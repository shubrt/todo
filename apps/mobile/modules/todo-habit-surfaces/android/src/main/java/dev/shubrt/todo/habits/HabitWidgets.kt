package dev.shubrt.todo.habits

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Date
import java.util.TimeZone
import java.util.concurrent.TimeUnit

class HabitWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    HabitSurfaces.render(context)
    HabitSurfaces.schedule(context)
    HabitSurfaces.enqueue(context)
  }
  override fun onEnabled(context: Context) { HabitSurfaces.schedule(context); HabitSurfaces.enqueue(context) }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: android.os.Bundle) { HabitSurfaces.render(context) }
  override fun onDisabled(context: Context) {
    if (!HabitData.prefs(context).getBoolean("notification", false)) WorkManager.getInstance(context).cancelUniqueWork(HabitSurfaces.PERIODIC)
  }
}

class HabitActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      HabitSurfaces.COMPLETE -> {
        val id = intent.getStringExtra("habitId") ?: return
        val day = intent.getStringExtra("occurrenceKey") ?: return
        HabitSurfaces.enqueue(context, id, day)
      }
      HabitSurfaces.REFRESH -> HabitSurfaces.enqueue(context)
    }
  }
}

class HabitWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    val context = applicationContext
    val expectedGeneration = inputData.getInt("generation", -1)
    if (expectedGeneration != -1 && expectedGeneration != HabitData.generation(context)) return@withContext Result.success()
    var captured: HabitRequestContext? = null
    try {
      val current = HabitData.capture(context, expectedGeneration.takeUnless { it == -1 })
      captured = current
      val id = inputData.getString("habitId")
      val day = inputData.getString("occurrenceKey")
      if (id != null && System.currentTimeMillis() - inputData.getLong("requestedAt", 0) > 120_000) {
        HabitData.recordError(context, current, "Der Abschluss konnte nicht bestätigt werden. Bitte aktualisieren.")
        HabitSurfaces.render(context)
        return@withContext Result.failure()
      }
      if (id != null && day != null) HabitData.complete(context, id, day, current.generation) else HabitData.refresh(context, current.generation)
      HabitSurfaces.render(context)
      Result.success()
    } catch (error: Exception) {
      if (error is HabitChangedException) return@withContext Result.success()
      captured?.let { HabitData.recordError(context, it, when(error) {
        is HabitAccessException -> "Gerätezugang abgelaufen. Bitte todo öffnen."
        is HabitConflictException -> "Der Habit-Stand ist veraltet. Bitte aktualisieren."
        else -> "Der Stand oder Abschluss konnte nicht bestätigt werden. Bitte aktualisieren."
      }) }
      HabitSurfaces.render(context)
      when {
        error is HabitAccessException || error is HabitConflictException || error is IllegalArgumentException -> Result.failure()
        runAttemptCount >= 2 -> Result.failure()
        else -> Result.retry()
      }
    }
  }
}

// Local expiry must also run offline. WorkManager may deliver this late under battery restrictions.
class HabitRolloverWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    synchronized(HabitData) {
      val context = applicationContext
      if (inputData.getInt("generation", -1) != HabitData.generation(context)) return@synchronized Result.success()
      val snapshot = HabitData.cached(context) ?: return@synchronized Result.success()
      if (snapshot.nextResetAt != inputData.getLong("nextResetAt", -1)) return@synchronized Result.success()
      // A manual clock change can move the wall-clock deadline after the scheduled delay.
      if (!snapshot.expired) return@synchronized Result.retry()
      HabitSurfaces.render(context)
      HabitSurfaces.enqueue(context)
      Result.success()
    }
  }
}

object HabitSurfaces {
  const val PERIODIC = "todo-habits-periodic"
  const val TAG = "todo-habits"
  const val COMPLETE = "dev.shubrt.todo.habits.COMPLETE"
  const val REFRESH = "dev.shubrt.todo.habits.REFRESH"
  private const val CHANNEL = "todo-habits"
  private const val NOTIFICATION_ID = 27182

  private fun constraints() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
  fun schedule(context: Context) {
    val work = PeriodicWorkRequestBuilder<HabitWorker>(15, TimeUnit.MINUTES).setConstraints(constraints()).addTag(TAG).build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, work)
  }

  fun enqueue(context: Context, id: String? = null, day: String? = null) {
    val data = workDataOf("generation" to HabitData.generation(context), "habitId" to id, "occurrenceKey" to day, "requestedAt" to System.currentTimeMillis())
    val work = OneTimeWorkRequestBuilder<HabitWorker>().setInputData(data).setConstraints(constraints())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).addTag(TAG).build()
    // Retry identity is stable across process restarts; the backend deduplicates it too.
    WorkManager.getInstance(context).enqueueUniqueWork("todo-habit-${id ?: "refresh"}-${day ?: "now"}", ExistingWorkPolicy.KEEP, work)
  }

  private fun scheduleRollover(context: Context, snapshot: HabitSnapshot) {
    if (snapshot.expired) return
    val generation = HabitData.generation(context)
    val data = workDataOf("generation" to generation, "nextResetAt" to snapshot.nextResetAt)
    val work = OneTimeWorkRequestBuilder<HabitRolloverWorker>().setInputData(data)
      .setInitialDelay((snapshot.nextResetAt - System.currentTimeMillis()).coerceAtLeast(0), TimeUnit.MILLISECONDS)
      .addTag(TAG).build()
    WorkManager.getInstance(context).enqueueUniqueWork("todo-habits-rollover-$generation-${snapshot.nextResetAt}", ExistingWorkPolicy.KEEP, work)
  }

  private fun confirmedAt(snapshot: HabitSnapshot): String = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).apply {
    timeZone = TimeZone.getTimeZone(snapshot.json.getString("timeZone"))
  }.format(Date(snapshot.generatedAt))

  private fun open(context: Context): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("todo://habits")).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun action(context: Context, kind: String, habit: HabitItem? = null): PendingIntent {
    val intent = Intent(context, HabitActionReceiver::class.java).setAction(kind)
    if (habit != null) {
      intent.putExtra("habitId", habit.id).putExtra("occurrenceKey", habit.occurrenceKey)
      intent.data = Uri.parse("todo://habit-action/${habit.id}/${habit.occurrenceKey}")
    }
    return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun render(context: Context) = synchronized(HabitData) {
    val snapshot = HabitData.cached(context)
    val usable = snapshot?.takeUnless { it.expired }
    if (usable != null) scheduleRollover(context, usable)
    val error = HabitData.prefs(context).getString("error", null)
    val manager = AppWidgetManager.getInstance(context)
    for (id in manager.getAppWidgetIds(ComponentName(context, HabitWidgetProvider::class.java))) {
      val views = RemoteViews(context.packageName, R.layout.todo_habits_widget)
      views.setTextViewText(R.id.habit_count, usable?.let { "${it.completedCount}/${it.totalCount}" } ?: "")
      views.setOnClickPendingIntent(R.id.habit_title, open(context))
      views.setOnClickPendingIntent(R.id.habit_refresh, action(context, REFRESH))
      views.setOnClickPendingIntent(R.id.habit_footer, open(context))
      views.removeAllViews(R.id.habit_rows)
      val height = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 180)
      val limit = ((height - 84) / 32).coerceIn(1, 10)
      val pending = usable?.habits?.filter { !it.completed }.orEmpty()
      for (habit in pending.take(limit)) {
        val row = RemoteViews(context.packageName, R.layout.todo_habit_row)
        row.setTextViewText(R.id.habit_text, habit.title)
        row.setOnClickPendingIntent(R.id.habit_row, action(context, COMPLETE, habit))
        row.setContentDescription(R.id.habit_row, "${habit.title} erledigen")
        views.addView(R.id.habit_rows, row)
      }
      val message = when {
        usable == null -> if (snapshot?.expired == true) "Neuer Tag. Aktualisieren." else "todo öffnen und Gerät verbinden."
        usable.totalCount == 0 -> "Deine Habits in todo einrichten."
        pending.isEmpty() -> "Alles für heute erledigt."
        pending.size > limit -> "+${pending.size - limit} weitere in todo"
        else -> ""
      }
      views.setTextViewText(R.id.habit_message, message)
      views.setViewVisibility(R.id.habit_message, if (message.isEmpty()) View.GONE else View.VISIBLE)
      views.setOnClickPendingIntent(R.id.habit_message, open(context))
      views.setProgressBar(R.id.habit_progress, usable?.totalCount?.coerceAtLeast(1) ?: 1, usable?.completedCount ?: 0, false)
      val updated = snapshot?.let { confirmedAt(it) }
      views.setTextViewText(R.id.habit_footer, if (updated != null) "${if (error == null && usable != null) "Stand" else "Letzter Stand"} $updated" else "Mit todo verbinden")
      manager.updateAppWidget(id, views)
    }
    renderNotification(context, snapshot, error)
  }

  fun notificationAllowed(context: Context): Boolean =
    (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
      NotificationManagerCompat.from(context).areNotificationsEnabled()

  fun setNotification(context: Context, enabled: Boolean): Boolean {
    if (enabled && !notificationAllowed(context)) return false
    HabitData.prefs(context).edit().putBoolean("notification", enabled).apply()
    if (enabled) { schedule(context); enqueue(context) }
    render(context)
    return true
  }

  private fun renderNotification(context: Context, confirmed: HabitSnapshot?, error: String?) {
    val snapshot = confirmed?.takeUnless { it.expired }
    val manager = NotificationManagerCompat.from(context)
    if (!HabitData.prefs(context).getBoolean("notification", false) || !notificationAllowed(context)) { manager.cancel(NOTIFICATION_ID); return }
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(CHANNEL, "Tägliche Habits", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Dein Habit-Fortschritt mit Aktualisieren und Abhaken."
        setShowBadge(false)
      }
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    val pending = snapshot?.habits?.filter { !it.completed }.orEmpty()
    val message = when {
      snapshot == null && confirmed?.expired == true -> "Neuer Tag. Aktualisieren."
      snapshot == null -> "todo öffnen, um den aktuellen Stand zu laden."
      snapshot.totalCount == 0 -> "Deine Habits in todo einrichten."
      pending.isEmpty() -> "Alles für heute erledigt."
      else -> pending.first().title
    }
    val updated = confirmed?.let { "${if (error == null && !it.expired) "Stand" else "Letzter Stand"} ${confirmedAt(it)}" }
    val builder = NotificationCompat.Builder(context, CHANNEL).setSmallIcon(R.drawable.todo_habit_notification)
      .setContentTitle(snapshot?.let { "Habits · ${it.completedCount}/${it.totalCount}" } ?: "Habits aktualisieren")
      .setContentText(message).setSubText(updated)
      .setContentIntent(open(context)).setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setCategory(NotificationCompat.CATEGORY_STATUS)
      .addAction(0, "Aktualisieren", action(context, REFRESH))
    if (snapshot != null) {
      val style = NotificationCompat.InboxStyle()
      pending.take(5).forEach { style.addLine("○ ${it.title}") }
      style.setSummaryText(updated)
      builder.setStyle(style).setProgress(snapshot.totalCount.coerceAtLeast(1), snapshot.completedCount, false)
      pending.firstOrNull()?.let { builder.addAction(0, "Erledigt: ${it.title.take(24)}", action(context, COMPLETE, it)) }
    }
    try { manager.notify(NOTIFICATION_ID, builder.build()) } catch (_: SecurityException) { /* Permission may be revoked between check and notify. */ }
  }

  fun pin(context: Context): Boolean {
    val manager = AppWidgetManager.getInstance(context)
    return Build.VERSION.SDK_INT >= 26 && manager.isRequestPinAppWidgetSupported &&
      manager.requestPinAppWidget(ComponentName(context, HabitWidgetProvider::class.java), null, null)
  }

  fun clear(context: Context) = synchronized(HabitData) {
    WorkManager.getInstance(context).cancelAllWorkByTag(TAG)
    HabitData.clear(context)
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    render(context)
  }
}
