import WidgetKit
import SwiftUI
import ActivityKit

private let ink = Color(red: 0.20, green: 0.23, blue: 0.18)
private let accent = Color(red: 0.43, green: 0.50, blue: 0.33)

struct HabitEntry: TimelineEntry {
  let date: Date
  let snapshot: HabitSnapshot?
  let message: String?
}

struct HabitProvider: TimelineProvider {
  func placeholder(in context: Context) -> HabitEntry { HabitEntry(date: Date(), snapshot: nil, message: nil) }
  func getSnapshot(in context: Context, completion: @escaping (HabitEntry) -> Void) {
    completion(HabitEntry(date: Date(), snapshot: HabitStore.cached(), message: nil))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<HabitEntry>) -> Void) {
    Task {
      let snapshot = (try? await HabitStore.refresh(reloadTimelines: false)) ?? HabitStore.cached()
      let entry = HabitEntry(date: Date(), snapshot: snapshot, message: HabitStore.defaults.string(forKey: "error"))
      var entries = [entry]
      // A cached previous day must never appear as today's completed habits.
      if let snapshot, snapshot.resetDate > Date() {
        entries.append(HabitEntry(date: snapshot.resetDate, snapshot: nil, message: "Neuer Tag. Aktualisieren."))
      }
      let next = min(Date().addingTimeInterval(20 * 60), snapshot?.resetDate ?? Date().addingTimeInterval(20 * 60))
      completion(Timeline(entries: entries, policy: .after(max(next, Date().addingTimeInterval(60)))))
    }
  }
}

struct HabitWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: HabitEntry
  private var limit: Int { family == .systemLarge ? 8 : family == .systemMedium ? 4 : 2 }
  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack {
        Label("Habits", systemImage: "leaf.fill").font(.system(size: 15, weight: .semibold))
        Spacer(minLength: 4)
        if let snapshot = entry.snapshot, !snapshot.isExpired {
          Text("\(snapshot.completedCount)/\(snapshot.totalCount)").font(.system(size: 13, weight: .medium, design: .rounded)).monospacedDigit()
        }
        Button(intent: RefreshTodoHabitsIntent()) { Image(systemName: "arrow.clockwise").font(.system(size: 12, weight: .medium)) }
          .buttonStyle(.plain).accessibilityLabel("Habits aktualisieren")
      }
      if let snapshot = entry.snapshot, !snapshot.isExpired {
        ProgressView(value: Double(snapshot.completedCount), total: Double(max(1, snapshot.totalCount))).tint(accent)
        if snapshot.totalCount == 0 {
          Link("Deine Habits einrichten", destination: URL(string: "todo://habits")!).font(.system(size: 13))
        } else if snapshot.pending.isEmpty {
          Spacer(minLength: 0)
          Label("Alles für heute erledigt.", systemImage: "checkmark.seal.fill").font(.system(size: 14, weight: .medium))
          Spacer(minLength: 0)
        } else {
          ForEach(Array(snapshot.pending.prefix(limit))) { habit in
            Button(intent: CompleteTodoHabitIntent(id: habit.id, occurrenceKey: habit.occurrenceKey)) {
              HStack(alignment: .top, spacing: 7) {
                Image(systemName: "circle").font(.system(size: 15)).foregroundStyle(accent)
                Text(habit.title).font(.system(size: 13)).lineLimit(family == .systemSmall ? 1 : 2).frame(maxWidth: .infinity, alignment: .leading)
              }
            }.buttonStyle(.plain).accessibilityLabel("\(habit.title) erledigen")
          }
          if snapshot.pending.count > limit {
            Link("+\(snapshot.pending.count - limit) weitere", destination: URL(string: "todo://habits")!).font(.system(size: 11)).foregroundStyle(accent)
          }
        }
        Spacer(minLength: 0)
        HStack(spacing: 3) {
          Text(entry.message == nil ? "Stand" : "Letzter Stand")
          Text(snapshot.generatedDate, style: .time)
        }.font(.system(size: 10)).foregroundStyle(.secondary)
      } else {
        Spacer(minLength: 0)
        Text(entry.message ?? "Verbinde todo und richte deine Habits ein.").font(.system(size: 13)).foregroundStyle(.secondary)
        Link("todo öffnen", destination: URL(string: "todo://habits")!).font(.system(size: 13, weight: .semibold)).foregroundStyle(accent)
        Spacer(minLength: 0)
      }
    }
    .foregroundStyle(ink)
    .containerBackground(for: .widget) { Color(red: 0.96, green: 0.96, blue: 0.93) }
    .widgetURL(URL(string: "todo://habits"))
  }
}

struct TodoHabitsWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: HabitStore.widgetKind, provider: HabitProvider()) { HabitWidgetView(entry: $0) }
      .configurationDisplayName("Deine Habits")
      .description("Dein täglicher Fortschritt. Habits direkt abhaken.")
      .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct TodoHabitsLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: TodoHabitAttributes.self) { context in
      VStack(alignment: .leading, spacing: 10) {
        HStack {
          Label("Habits", systemImage: "leaf.fill").font(.headline)
          Spacer()
          Text(context.isStale || context.state.expired ? "–" : "\(context.state.completed)/\(context.state.total)").font(.headline).monospacedDigit()
        }
        if context.isStale || context.state.expired {
          Link("Stand aktualisieren", destination: URL(string: "todo://habits")!).font(.subheadline)
        } else {
          ProgressView(value: Double(context.state.completed), total: Double(max(1, context.state.total))).tint(accent)
          ForEach(context.state.habits) { habit in
            Button(intent: CompleteTodoHabitIntent(id: habit.id, occurrenceKey: habit.occurrenceKey)) {
              Label(habit.title, systemImage: "circle").font(.subheadline).lineLimit(1)
            }.buttonStyle(.plain)
          }
          if context.state.completed == context.state.total && context.state.total > 0 { Text("Alles für heute erledigt.").font(.subheadline) }
        }
        HStack(spacing: 4) { Text("Stand"); Text(context.state.updatedAt, style: .time) }.font(.caption2).foregroundStyle(.secondary)
      }.padding(16).foregroundStyle(ink)
      .activityBackgroundTint(Color(red: 0.96, green: 0.96, blue: 0.93))
      .activitySystemActionForegroundColor(accent)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) { Label("Habits", systemImage: "leaf.fill").font(.headline) }
        DynamicIslandExpandedRegion(.trailing) { Text(context.isStale || context.state.expired ? "–" : "\(context.state.completed)/\(context.state.total)").monospacedDigit() }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 7) {
            if context.isStale || context.state.expired {
              Link("Stand aktualisieren", destination: URL(string: "todo://habits")!)
            } else {
              ForEach(context.state.habits.prefix(2)) { habit in
                Button(intent: CompleteTodoHabitIntent(id: habit.id, occurrenceKey: habit.occurrenceKey)) {
                  Label(habit.title, systemImage: "circle").font(.caption).lineLimit(1)
                }.buttonStyle(.plain)
              }
              if context.state.habits.isEmpty {
                Text(context.state.total == 0 ? "Deine Habits in todo einrichten." : "Alles für heute erledigt.").font(.caption)
              }
            }
          }.frame(maxWidth: .infinity, alignment: .leading)
        }
      } compactLeading: { Image(systemName: "leaf.fill").foregroundStyle(accent) }
        compactTrailing: { Text(context.isStale || context.state.expired ? "–" : "\(context.state.completed)/\(context.state.total)").font(.caption).monospacedDigit() }
        minimal: { Image(systemName: context.isStale || context.state.expired ? "arrow.clockwise" : context.state.total > 0 && context.state.completed == context.state.total ? "checkmark.circle.fill" : "leaf.fill").foregroundStyle(accent) }
        .widgetURL(URL(string: "todo://habits"))
    }
  }
}

@main
struct TodoHabitsBundle: WidgetBundle {
  var body: some Widget {
    TodoHabitsWidget()
    TodoHabitsLiveActivity()
  }
}
