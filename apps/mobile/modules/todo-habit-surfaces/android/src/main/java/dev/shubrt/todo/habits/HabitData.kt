package dev.shubrt.todo.habits

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import java.security.KeyStore
import java.util.TimeZone
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.HttpsURLConnection

data class HabitItem(val id: String, val title: String, val completed: Boolean, val occurrenceKey: String)
data class HabitSnapshot(val json: JSONObject) {
  val generatedAt get() = json.getDouble("generatedAt").toLong()
  val nextResetAt get() = json.getDouble("nextResetAt").toLong()
  val localDate get() = json.getString("localDate")
  val completedCount get() = json.getInt("completedCount")
  val totalCount get() = json.getInt("totalCount")
  val expired get() = System.currentTimeMillis() >= nextResetAt
  val habits: List<HabitItem> get() = json.getJSONArray("habits").let { array ->
    (0 until array.length()).map { i -> array.getJSONObject(i).let {
      HabitItem(it.getString("id"), it.getString("title"), it.getBoolean("completed"), it.getString("occurrenceKey"))
    } }
  }
  fun validate() {
    require(json.getDouble("generatedAt").isFinite() && json.getDouble("nextResetAt").isFinite() && nextResetAt > generatedAt)
    require(Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(localDate))
    require(TimeZone.getAvailableIDs().contains(json.getString("timeZone")))
    val entries = habits
    require(totalCount == entries.size && completedCount == entries.count { it.completed })
    require(entries.map { it.id }.toSet().size == entries.size)
    require(entries.all { Regex("^[A-Za-z0-9_-]{1,128}$").matches(it.id) && it.title.isNotEmpty() && it.title.length <= 500 && it.occurrenceKey == localDate })
  }
}

class HabitAccessException(message: String) : Exception(message)
class HabitConflictException(message: String) : Exception(message)
class HabitChangedException : Exception("Die Geräteverbindung wurde geändert.")
data class HabitRequestContext(val credential: Pair<String, String>, val generation: Int)

object HabitData {
  private const val ALIAS = "todo.habits.device.v1"
  private const val PREFS = "todo_habit_surfaces"
  fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  @Synchronized fun generation(context: Context) = prefs(context).getInt("generation", 0)

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true).build())
    }.generateKey()
  }

  private fun validate(siteUrl: String, apiKey: String) {
    require(Regex("^https://[a-z0-9-]+(?:\\.[a-z0-9-]+)?\\.convex\\.site$").matches(siteUrl)) { "Ungültige Backend-Adresse." }
    require(Regex("^todo_[A-Za-z0-9_-]{43}$").matches(apiKey)) { "Ungültiger Gerätezugang." }
  }

  @Synchronized fun configure(context: Context, siteUrl: String, apiKey: String): String {
    validate(siteUrl, apiKey)
    val old = runCatching { connection(context) }.getOrNull()
    if (old?.first == siteUrl && old.second == apiKey) return generation(context).toString()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
    val content = JSONObject().put("siteUrl", siteUrl).put("apiKey", apiKey).toString().toByteArray(Charsets.UTF_8)
    val encrypted = cipher.doFinal(content)
    val next = generation(context) + 1
    check(prefs(context).edit().putString("credential", Base64.encodeToString(encrypted, Base64.NO_WRAP))
      .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).putInt("generation", next)
      .remove("snapshot").remove("error").commit()) { "Der Gerätezugang konnte nicht gespeichert werden." }
    return next.toString()
  }

  @Synchronized fun connection(context: Context): Pair<String, String> {
    val prefs = prefs(context)
    val content = prefs.getString("credential", null) ?: throw HabitAccessException("Bitte todo öffnen und dieses Gerät verbinden.")
    val iv = prefs.getString("iv", null) ?: throw HabitAccessException("Bitte den Gerätezugang erneut verbinden.")
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
        init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
      }
      val decoded = JSONObject(String(cipher.doFinal(Base64.decode(content, Base64.NO_WRAP)), Charsets.UTF_8))
      return Pair(decoded.getString("siteUrl"), decoded.getString("apiKey")).also { validate(it.first, it.second) }
    } catch (_: Exception) {
      throw HabitAccessException("Der sichere Gerätezugang ist nicht verfügbar. Bitte todo öffnen.")
    }
  }

  @Synchronized fun capture(context: Context, expectedGeneration: Int? = null): HabitRequestContext {
    val current = generation(context)
    if (expectedGeneration != null && expectedGeneration != current) throw HabitChangedException()
    return HabitRequestContext(connection(context), current)
  }

  @Synchronized private fun checkCurrent(context: Context, captured: HabitRequestContext) {
    if (captured.generation != generation(context) || runCatching { connection(context) }.getOrNull() != captured.credential) throw HabitChangedException()
  }

  @Synchronized fun recordError(context: Context, captured: HabitRequestContext, message: String) {
    if (runCatching { checkCurrent(context, captured) }.isSuccess)
      prefs(context).edit().putString("error", message).apply()
  }

  @Synchronized private fun denyAccess(context: Context, captured: HabitRequestContext) {
    checkCurrent(context, captured)
    prefs(context).edit().remove("snapshot").putString("error", "Gerätezugang abgelaufen. Bitte todo öffnen.").apply()
  }

  @Synchronized fun cached(context: Context): HabitSnapshot? = runCatching {
    prefs(context).getString("snapshot", null)?.let { HabitSnapshot(JSONObject(it)).also { snapshot -> snapshot.validate() } }
  }.getOrNull()

  @Synchronized private fun commit(context: Context, snapshot: HabitSnapshot, captured: HabitRequestContext): HabitSnapshot {
    checkCurrent(context, captured)
    snapshot.validate()
    val current = cached(context)
    if (current != null && current.generatedAt > snapshot.generatedAt) return current
    prefs(context).edit().putString("snapshot", snapshot.json.toString()).remove("error").apply()
    return snapshot
  }

  fun publish(context: Context, snapshot: HabitSnapshot, generation: String) {
    val expected = generation.toIntOrNull() ?: throw HabitChangedException()
    commit(context, snapshot, capture(context, expected))
  }

  private fun request(context: Context, captured: HabitRequestContext, path: String, body: JSONObject? = null, idempotency: String? = null): JSONObject {
    checkCurrent(context, captured)
    val request = URL(captured.credential.first + path).openConnection() as HttpsURLConnection
    try {
      request.connectTimeout = 15000
      request.readTimeout = 15000
      request.instanceFollowRedirects = false
      request.setRequestProperty("Authorization", "Bearer " + captured.credential.second)
      request.setRequestProperty("Content-Type", "application/json")
      if (idempotency != null) request.setRequestProperty("Idempotency-Key", idempotency)
      if (body != null) {
        request.requestMethod = "POST"
        request.doOutput = true
        request.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      }
      val status = request.responseCode
      checkCurrent(context, captured)
      if (status == 401 || status == 403) {
        denyAccess(context, captured)
        throw HabitAccessException("Gerätezugang abgelaufen. Bitte todo öffnen.")
      }
      if (status == 409) throw HabitConflictException("Dieser Habit gehört zu einem früheren Tag. Bitte aktualisieren.")
      if (status !in 200..299) throw Exception("Server gerade nicht erreichbar. Bitte erneut versuchen.")
      val result = request.inputStream.bufferedReader().use { JSONObject(it.readText()) }
      checkCurrent(context, captured)
      return result
    } finally { request.disconnect() }
  }

  private fun refresh(context: Context, captured: HabitRequestContext): HabitSnapshot {
    val snapshot = HabitSnapshot(request(context, captured, "/api/v1/habits/snapshot").getJSONObject("data"))
    return commit(context, snapshot, captured)
  }

  fun refresh(context: Context, expectedGeneration: Int? = null): HabitSnapshot = refresh(context, capture(context, expectedGeneration))

  fun complete(context: Context, id: String, occurrenceKey: String, expectedGeneration: Int? = null) {
    require(Regex("^[A-Za-z0-9_-]{1,128}$").matches(id)) { "Ungültiger Habit." }
    require(Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(occurrenceKey)) { "Ungültiger Tag." }
    val captured = capture(context, expectedGeneration)
    val result = request(context, captured, "/api/v1/tasks/$id/complete", JSONObject().put("occurrenceKey", occurrenceKey), "widget-complete-$id-$occurrenceKey")
    check(result.getJSONObject("data").getString("id") == id) { "Der Abschluss wurde nicht bestätigt." }
    refresh(context, captured)
  }

  @Synchronized fun clear(context: Context) {
    val next = generation(context) + 1
    check(prefs(context).edit().clear().putInt("generation", next).commit()) { "Der Gerätezugang konnte nicht entfernt werden." }
    KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(ALIAS)
  }

  fun asMap(json: JSONObject): Map<String, Any?> = json.keys().asSequence().associateWith { key -> convert(json.get(key)) }
  private fun convert(value: Any?): Any? = when(value) {
    JSONObject.NULL -> null
    is JSONObject -> asMap(value)
    is JSONArray -> (0 until value.length()).map { convert(value.get(it)) }
    else -> value
  }
}
