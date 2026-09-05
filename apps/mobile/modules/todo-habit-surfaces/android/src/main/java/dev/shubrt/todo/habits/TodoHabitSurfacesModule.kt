package dev.shubrt.todo.habits

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class TodoHabitSurfacesModule : Module() {
  private fun context() = appContext.reactContext ?: throw IllegalStateException("App-Kontext nicht verfügbar.")
  override fun definition() = ModuleDefinition {
    Name("TodoHabitSurfaces")
    AsyncFunction("configure") { connection: Map<String, String> ->
      val context = context()
      val generation = HabitData.configure(context, connection["siteUrl"] ?: "", connection["apiKey"] ?: "")
      HabitSurfaces.schedule(context)
      HabitSurfaces.enqueue(context)
      generation
    }
    AsyncFunction("publish") { value: Map<String, Any?>, generation: String ->
      val context = context()
      HabitData.publish(context, HabitSnapshot(JSONObject(value)), generation)
      HabitSurfaces.render(context)
    }
    AsyncFunction("refresh") {
      val context = context()
      val snapshot = HabitData.refresh(context)
      HabitSurfaces.render(context)
      HabitData.asMap(snapshot.json)
    }
    AsyncFunction("capabilities") {
      mapOf("nativeAvailable" to true, "widgets" to true, "liveActivities" to false, "ongoingNotification" to true)
    }
    AsyncFunction("setNotificationEnabled") { enabled: Boolean -> HabitSurfaces.setNotification(context(), enabled) }
    AsyncFunction("startLiveActivity") { null as String? }
    AsyncFunction("endLiveActivity") { Unit }
    AsyncFunction("requestPinWidget") { HabitSurfaces.pin(context()) }
    AsyncFunction("clear") { HabitSurfaces.clear(context()) }
  }
}
