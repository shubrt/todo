import Foundation
import ActivityKit

struct HabitItem: Codable, Hashable, Identifiable {
  let id: String
  let title: String
  let completed: Bool
  let occurrenceKey: String
}

struct HabitSnapshot: Codable, Hashable {
  let generatedAt: Double
  let localDate: String
  let timeZone: String
  let nextResetAt: Double
  let habits: [HabitItem]
  let completedCount: Int
  let totalCount: Int

  var generatedDate: Date { Date(timeIntervalSince1970: generatedAt / 1000) }
  var resetDate: Date { Date(timeIntervalSince1970: nextResetAt / 1000) }
  var isExpired: Bool { Date() >= resetDate }
  var pending: [HabitItem] { habits.filter { !$0.completed } }

  func validate() throws {
    guard generatedAt.isFinite, nextResetAt.isFinite, nextResetAt > generatedAt,
      TimeZone(identifier: timeZone) != nil,
      localDate.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil,
      totalCount == habits.count, completedCount == habits.filter({ $0.completed }).count,
      Set(habits.map { $0.id }).count == habits.count,
      habits.allSatisfy({ item in
        item.id.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil &&
        !item.title.isEmpty && item.title.utf16.count <= 500 && item.occurrenceKey == localDate
      }) else { throw HabitStore.error("Der Habit-Stand ist ungültig.") }
  }
}

struct HabitConnection: Codable, Equatable {
  let siteUrl: String
  let apiKey: String
}

struct HabitEnvelope: Decodable { let data: HabitSnapshot }

struct TodoHabitAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    let localDate: String
    let completed: Int
    let total: Int
    let updatedAt: Date
    let nextResetAt: Date
    let habits: [HabitItem]
    var expired: Bool { Date() >= nextResetAt }
  }
  let title: String
  let generation: String
}

extension HabitSnapshot {
  var activityState: TodoHabitAttributes.ContentState {
    // ActivityKit has a 4 KB limit. The full list stays in the home widget/app.
    TodoHabitAttributes.ContentState(localDate: localDate, completed: completedCount, total: totalCount,
      updatedAt: generatedDate, nextResetAt: resetDate,
      habits: Array(pending.prefix(3)).map { HabitItem(id: $0.id, title: String(String.UnicodeScalarView($0.title.unicodeScalars.prefix(70))), completed: $0.completed, occurrenceKey: $0.occurrenceKey) })
  }
}
