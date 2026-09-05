import AppIntents
import Foundation

struct CompleteTodoHabitIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Habit erledigen"
  static var openAppWhenRun = false
  @Parameter(title: "Habit") var habitID: String
  @Parameter(title: "Tag") var occurrenceKey: String

  init() { }
  init(id: String, occurrenceKey: String) { self.habitID = id; self.occurrenceKey = occurrenceKey }
  func perform() async throws -> some IntentResult {
    try await HabitStore.complete(id: habitID, occurrenceKey: occurrenceKey)
    return .result()
  }
}

struct RefreshTodoHabitsIntent: AppIntent {
  static var title: LocalizedStringResource = "Habits aktualisieren"
  static var openAppWhenRun = false
  func perform() async throws -> some IntentResult {
    _ = try await HabitStore.refresh()
    return .result()
  }
}
