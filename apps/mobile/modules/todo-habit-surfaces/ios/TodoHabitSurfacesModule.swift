import ExpoModulesCore
import Foundation
import ActivityKit

public class TodoHabitSurfacesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TodoHabitSurfaces")
    AsyncFunction("configure") { (connection: [String: String]) async throws -> String in
      guard let site = connection["siteUrl"], let key = connection["apiKey"] else { throw HabitStore.error("Gerätezugang fehlt.") }
      let generation = try HabitStore.saveConnection(HabitConnection(siteUrl: site, apiKey: key))
      await HabitStore.endObsoleteActivities(generation: generation)
      return generation
    }
    AsyncFunction("publish") { (value: [String: Any], generation: String) async throws in
      let snapshot = try JSONDecoder().decode(HabitSnapshot.self, from: JSONSerialization.data(withJSONObject: value))
      try await HabitStore.publish(snapshot, generation: generation)
    }
    AsyncFunction("refresh") { () async throws -> [String: Any] in
      let snapshot = try await HabitStore.refresh()
      return try JSONSerialization.jsonObject(with: JSONEncoder().encode(snapshot)) as! [String: Any]
    }
    AsyncFunction("capabilities") { () -> [String: Bool] in
      ["nativeAvailable": true, "widgets": true, "liveActivities": ActivityAuthorizationInfo().areActivitiesEnabled, "ongoingNotification": false]
    }
    AsyncFunction("setNotificationEnabled") { (_: Bool) -> Bool in false }
    AsyncFunction("requestPinWidget") { () -> Bool in false }
    AsyncFunction("startLiveActivity") { () async throws -> String in
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { throw HabitStore.error("Live-Aktivitäten sind in den iPhone-Einstellungen deaktiviert.") }
      return try await HabitStore.startActivity()
    }
    AsyncFunction("endLiveActivity") { () async in await HabitStore.endActivities() }
    AsyncFunction("clear") { () async throws in try await HabitStore.clear() }
  }
}
