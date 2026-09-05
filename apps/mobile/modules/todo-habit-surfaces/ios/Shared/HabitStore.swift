import Foundation
import Security
import WidgetKit
import ActivityKit
import Darwin

private final class HabitRedirectPolicy: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }
}

struct HabitRequestContext: Equatable {
  let connection: HabitConnection
  let generation: String
}

enum HabitStore {
  static let widgetKind = "TodoHabits"
  static var group: String { Bundle.main.object(forInfoDictionaryKey: "TodoHabitAppGroup") as? String ?? "group.dev.shubrt.todo.habits" }
  static var defaults: UserDefaults { UserDefaults(suiteName: group)! }
  static let service = "dev.shubrt.todo.habits.device"
  private static let processLock = NSRecursiveLock()
  private static let network: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil
    configuration.urlCache = nil
    return URLSession(configuration: configuration, delegate: HabitRedirectPolicy(), delegateQueue: nil)
  }()
  static func error(_ message: String) -> NSError { NSError(domain: "TodoHabits", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
  private static func changed() -> NSError { NSError(domain: "TodoHabits", code: 2, userInfo: [NSLocalizedDescriptionKey: "Die Geräteverbindung wurde geändert."]) }

  // The app and extension are separate processes. Lock the shared container too,
  // so credential changes and snapshot commits have one ordering in both.
  private static func locked<T>(_ work: () throws -> T) throws -> T {
    processLock.lock()
    defer { processLock.unlock() }
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
      throw error("Die gemeinsame App-Gruppe ist im Build noch nicht eingerichtet.")
    }
    let descriptor = open(container.appendingPathComponent("habit-store.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
    guard descriptor >= 0 else { throw error("Der gemeinsame Habit-Speicher ist nicht verfügbar.") }
    defer { close(descriptor) }
    guard flock(descriptor, LOCK_EX) == 0 else { throw error("Der Habit-Speicher ist belegt.") }
    defer { defaults.synchronize(); flock(descriptor, LOCK_UN) }
    defaults.synchronize()
    return try work()
  }

  static func keychainQuery() throws -> [String: Any] {
    guard let accessGroup = Bundle.main.object(forInfoDictionaryKey: "TodoHabitKeychainGroup") as? String,
          !accessGroup.isEmpty, !accessGroup.contains("$(") else { throw error("Der gemeinsame Schlüsselbund ist im Build noch nicht eingerichtet.") }
    return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
      kSecAttrAccount as String: "connection", kSecAttrAccessGroup as String: accessGroup]
  }

  static func validate(_ connection: HabitConnection) throws {
    guard let url = URLComponents(string: connection.siteUrl), url.scheme == "https",
      let host = url.host, host.range(of: "^[a-z0-9-]+(?:\\.[a-z0-9-]+)?\\.convex\\.site$", options: .regularExpression) != nil,
      url.port == nil, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, url.path.isEmpty,
      connection.apiKey.range(of: "^todo_[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else {
      throw error("Die Geräteverbindung ist ungültig.")
    }
  }

  private static func connectionUnlocked() throws -> HabitConnection {
    var query = try keychainQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { throw error("Bitte todo öffnen und dieses Gerät verbinden.") }
    let connection = try JSONDecoder().decode(HabitConnection.self, from: data)
    try validate(connection)
    return connection
  }

  static func saveConnection(_ connection: HabitConnection) throws -> String {
    try validate(connection)
    let generation = try locked {
      if (try? connectionUnlocked()) == connection, let existing = defaults.string(forKey: "generation") { return existing }
      let query = try keychainQuery()
      let attributes: [String: Any] = [kSecValueData as String: try JSONEncoder().encode(connection), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
      let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
      if status == errSecItemNotFound {
        var insertion = query
        attributes.forEach { insertion[$0.key] = $0.value }
        guard SecItemAdd(insertion as CFDictionary, nil) == errSecSuccess else { throw error("Der Gerätezugang konnte nicht gespeichert werden.") }
      } else if status != errSecSuccess { throw error("Der Gerätezugang konnte nicht aktualisiert werden.") }
      let next = UUID().uuidString
      defaults.set(next, forKey: "generation")
      defaults.removeObject(forKey: "snapshot")
      defaults.removeObject(forKey: "error")
      return next
    }
    WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    return generation
  }

  static func capture(expectedGeneration: String? = nil) throws -> HabitRequestContext {
    try locked {
      let credential = try connectionUnlocked()
      let generation = defaults.string(forKey: "generation") ?? UUID().uuidString
      if let expectedGeneration, expectedGeneration != generation { throw changed() }
      defaults.set(generation, forKey: "generation")
      return HabitRequestContext(connection: credential, generation: generation)
    }
  }

  private static func isCurrentUnlocked(_ context: HabitRequestContext) -> Bool {
    defaults.string(forKey: "generation") == context.generation && (try? connectionUnlocked()) == context.connection
  }

  private static func check(_ context: HabitRequestContext) throws {
    try locked { guard isCurrentUnlocked(context) else { throw changed() } }
  }

  private static func cachedUnlocked() -> HabitSnapshot? {
    guard let data = defaults.data(forKey: "snapshot"), let snapshot = try? JSONDecoder().decode(HabitSnapshot.self, from: data),
          (try? snapshot.validate()) != nil else { return nil }
    return snapshot
  }
  static func cached() -> HabitSnapshot? { try? locked { cachedUnlocked() } }

  private static func commit(_ snapshot: HabitSnapshot, context: HabitRequestContext) throws -> HabitSnapshot {
    try snapshot.validate()
    return try locked {
      guard isCurrentUnlocked(context) else { throw changed() }
      if let current = cachedUnlocked(), current.generatedAt > snapshot.generatedAt { return current }
      defaults.set(try JSONEncoder().encode(snapshot), forKey: "snapshot")
      defaults.removeObject(forKey: "error")
      return snapshot
    }
  }

  static func publish(_ snapshot: HabitSnapshot, generation: String) async throws {
    let context = try capture(expectedGeneration: generation)
    let latest = try commit(snapshot, context: context)
    WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    await updateActivities(latest, context: context)
  }

  private static func recordError(_ message: String, context: HabitRequestContext) {
    _ = try? locked {
      guard isCurrentUnlocked(context) else { return }
      defaults.set(message, forKey: "error")
    }
  }

  private static func denyAccess(_ context: HabitRequestContext) async throws {
    let activities = try locked {
      guard isCurrentUnlocked(context) else { throw changed() }
      defaults.removeObject(forKey: "snapshot")
      return Activity<TodoHabitAttributes>.activities.filter { $0.attributes.generation == context.generation }
    }
    for activity in activities { await activity.end(nil, dismissalPolicy: .immediate) }
    WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
  }

  private static func request(context: HabitRequestContext, path: String, method: String = "GET", body: Data? = nil, idempotencyKey: String? = nil) async throws -> Data {
    try check(context)
    guard let url = URL(string: context.connection.siteUrl + path) else { throw error("Ungültige Anfrage.") }
    var request = URLRequest(url: url, timeoutInterval: 15)
    request.httpMethod = method
    request.setValue("Bearer " + context.connection.apiKey, forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let idempotencyKey { request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key") }
    request.httpBody = body
    let (data, response) = try await network.data(for: request)
    try check(context)
    guard let http = response as? HTTPURLResponse else { throw error("Keine Serverantwort.") }
    if http.statusCode == 401 || http.statusCode == 403 {
      try await denyAccess(context)
      throw NSError(domain: "TodoHabits", code: 3, userInfo: [NSLocalizedDescriptionKey: "Gerätezugang abgelaufen. Bitte todo öffnen."])
    }
    guard (200..<300).contains(http.statusCode) else {
      throw error(http.statusCode == 409 ? "Der Habit gehört nicht mehr zum aktuellen Tag. Bitte aktualisieren." : "Der Abschluss oder Stand konnte nicht bestätigt werden. Bitte aktualisieren.")
    }
    return data
  }

  static func refresh(reloadTimelines: Bool = true) async throws -> HabitSnapshot {
    try await refresh(context: capture(), reloadTimelines: reloadTimelines)
  }

  private static func refresh(context: HabitRequestContext, reloadTimelines: Bool = true) async throws -> HabitSnapshot {
    do {
      let data = try await request(context: context, path: "/api/v1/habits/snapshot")
      let snapshot = try JSONDecoder().decode(HabitEnvelope.self, from: data).data
      let latest = try commit(snapshot, context: context)
      if reloadTimelines { WidgetCenter.shared.reloadTimelines(ofKind: widgetKind) }
      await updateActivities(latest, context: context)
      return latest
    } catch {
      let failure = error as NSError
      recordError(failure.domain == "TodoHabits" && failure.code == 3 ? failure.localizedDescription : "Der Habit-Stand konnte nicht bestätigt werden. Bitte aktualisieren.", context: context)
      throw error
    }
  }

  static func complete(id: String, occurrenceKey: String) async throws {
    guard id.range(of: "^[a-zA-Z0-9_-]{1,128}$", options: .regularExpression) != nil,
          occurrenceKey.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil else { throw error("Ungültiger Habit.") }
    let context = try capture()
    let body = try JSONSerialization.data(withJSONObject: ["occurrenceKey": occurrenceKey])
    do {
      let data = try await request(context: context, path: "/api/v1/tasks/" + id + "/complete", method: "POST", body: body,
        idempotencyKey: "widget-complete-" + id + "-" + occurrenceKey)
      guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        let command = result["data"] as? [String: Any], command["id"] as? String == id else { throw error("Der Abschluss wurde nicht bestätigt.") }
      _ = try await refresh(context: context)
    } catch {
      let failure = error as NSError
      recordError(failure.domain == "TodoHabits" && failure.code == 3 ? failure.localizedDescription : "Der Abschluss konnte nicht bestätigt werden. Bitte aktualisieren.", context: context)
      WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
      throw error
    }
  }

  private static func updateActivities(_ snapshot: HabitSnapshot, context: HabitRequestContext) async {
    guard let activities = try? locked({
      guard isCurrentUnlocked(context) else { throw changed() }
      return Activity<TodoHabitAttributes>.activities.filter { $0.attributes.generation == context.generation }
    }) else { return }
    for activity in activities {
      guard let latest = try? locked({
        guard isCurrentUnlocked(context) else { throw changed() }
        return cachedUnlocked() ?? snapshot
      }) else { return }
      await activity.update(ActivityContent(state: latest.activityState, staleDate: min(latest.resetDate, Date().addingTimeInterval(30 * 60))))
    }
  }

  static func endObsoleteActivities(generation: String) async {
    guard let context = try? capture(expectedGeneration: generation), let activities = try? locked({
      guard isCurrentUnlocked(context) else { throw changed() }
      return Activity<TodoHabitAttributes>.activities.filter { $0.attributes.generation != generation }
    }) else { return }
    for activity in activities { await activity.end(nil, dismissalPolicy: .immediate) }
  }

  static func startActivity() async throws -> String {
    let context = try capture()
    _ = try await refresh(context: context)
    return try locked {
      guard isCurrentUnlocked(context), let latest = cachedUnlocked() else { throw changed() }
      if let existing = Activity<TodoHabitAttributes>.activities.first(where: { $0.attributes.generation == context.generation }) { return existing.id }
      return try Activity.request(attributes: TodoHabitAttributes(title: "Habits", generation: context.generation),
        content: ActivityContent(state: latest.activityState, staleDate: min(latest.resetDate, Date().addingTimeInterval(30 * 60))), pushType: nil).id
    }
  }

  static func endActivities() async {
    let activities = Activity<TodoHabitAttributes>.activities
    for activity in activities { await activity.end(nil, dismissalPolicy: .immediate) }
  }

  static func clear() async throws {
    let activities = try locked {
      let status = SecItemDelete(try keychainQuery() as CFDictionary)
      guard status == errSecSuccess || status == errSecItemNotFound else { throw error("Der Gerätezugang konnte nicht entfernt werden.") }
      defaults.set(UUID().uuidString, forKey: "generation")
      defaults.removeObject(forKey: "snapshot")
      defaults.removeObject(forKey: "error")
      return Activity<TodoHabitAttributes>.activities
    }
    for activity in activities { await activity.end(nil, dismissalPolicy: .immediate) }
    WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
  }
}
