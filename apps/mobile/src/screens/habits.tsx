import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@todo/backend/api";
import { Button, Empty, Icon, IconButton, Loading, SectionLabel } from "../components/ui";
import { useActions } from "../lib/actions";
import { useSurfaces } from "../lib/surfaces";
import { type Settings, type Task } from "../lib/model";
import { base, colors } from "../theme";
import { HabitSetup, RecurrenceSheet } from "./recurrences";

export function HabitsScreen({
  settings,
  onEdit,
  onSurfaces,
}: {
  settings: Settings;
  onEdit: (task: Task) => void;
  onSurfaces: () => void;
}) {
  const habits = useQuery(api.tasks.list, { view: "habits" });
  const actions = useActions();
  const surfaces = useSurfaces();
  const [setup, setSetup] = useState(false);
  const [add, setAdd] = useState(false);
  const total = habits?.length ?? 0;
  const completed = habits?.filter((habit) => habit.state === "done").length ?? 0;
  if (!habits) return <Loading />;
  return (
    <View>
      {total > 0 ? (
        <View style={styles.progressCard}>
          <View style={base.between}>
            <View>
              <Text style={styles.progressEyebrow}>DEIN TÄGLICHER RHYTHMUS</Text>
              <Text style={styles.progressTitle}>
                {completed === total ? "Für heute geschafft." : "Schritt für Schritt."}
              </Text>
            </View>
            <View style={styles.progressNumber}>
              <Text style={styles.completed}>{completed}</Text>
              <Text style={styles.total}>/{total}</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${total ? (completed / total) * 100 : 0}%` }]}
            />
          </View>
          <Text style={styles.progressHint}>
            {completed === total
              ? "Morgen beginnt ein neuer Tag."
              : `${total - completed} ${total - completed === 1 ? "kleiner Schritt wartet" : "kleine Schritte warten"} noch auf dich.`}
          </Text>
        </View>
      ) : null}
      <SectionLabel
        trailing={
          <IconButton
            name="add"
            label="Habit hinzufügen"
            onPress={() => (settings.habitsInitialized ? setAdd(true) : setSetup(true))}
          />
        }
      >
        Heute
      </SectionLabel>
      {!total ? (
        <Empty
          icon="leaf-outline"
          title={
            settings.habitsInitialized ? "Platz für deinen Rhythmus." : "Kleine Dinge. Jeden Tag."
          }
          action={
            <Button onPress={() => (settings.habitsInitialized ? setAdd(true) : setSetup(true))}>
              {settings.habitsInitialized ? "Habit hinzufügen" : "Meine fünf Habits einrichten"}
            </Button>
          }
        >
          {settings.habitsInitialized
            ? "Ergänze einen Habit oder setze pausierte Habits in den Einstellungen fort."
            : "Welche fünf Dinge möchtest du täglich tun? Du bestimmst, was zu dir passt."}
        </Empty>
      ) : (
        <View style={{ gap: 10 }}>
          {habits.map((habit, index) => (
            <View
              key={habit._id}
              style={[styles.habit, habit.state === "done" && styles.habitDone]}
            >
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={habit.title}
                accessibilityState={{
                  checked: habit.state === "done",
                  disabled:
                    habit.state === "done" || actions.pending.has(habit._id) || !actions.connected,
                }}
                disabled={
                  habit.state === "done" || actions.pending.has(habit._id) || !actions.connected
                }
                onPress={() => void actions.complete(habit)}
                style={[base.row, { flex: 1, gap: 15 }]}
              >
                <View style={[styles.habitCheck, habit.state === "done" && styles.habitChecked]}>
                  {habit.state === "done" ? (
                    <Icon name="checkmark" size={19} color="#fff" />
                  ) : (
                    <Text style={styles.habitNumber}>{String(index + 1).padStart(2, "0")}</Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.habitTitle,
                    habit.state === "done" && {
                      textDecorationLine: "line-through",
                      color: colors.muted,
                    },
                  ]}
                >
                  {habit.title}
                </Text>
              </Pressable>
              <IconButton
                name="ellipsis-horizontal"
                label={`${habit.title} bearbeiten`}
                onPress={() => onEdit(habit)}
              />
            </View>
          ))}
        </View>
      )}
      <Pressable accessibilityRole="button" onPress={onSurfaces} style={styles.surfaceCard}>
        <View style={styles.surfaceIcon}>
          <Icon name="phone-portrait-outline" color={colors.green} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[base.body, { fontWeight: "600" }]}>Deine Habits im Blick</Text>
          <Text style={base.small}>
            {surfaces.capabilities?.nativeAvailable
              ? "Zum Homescreen und Sperrbildschirm hinzufügen."
              : "Widgets und Live-Anzeige einrichten."}
          </Text>
        </View>
        <Icon name="chevron-forward" color={colors.muted} size={16} />
      </Pressable>
      {setup ? <HabitSetup onClose={() => setSetup(false)} /> : null}
      {add ? (
        <RecurrenceSheet
          kind="habit"
          defaultArea={settings.defaultArea}
          onClose={() => setAdd(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  progressCard: { backgroundColor: colors.green, borderRadius: 21, padding: 22, marginTop: 24 },
  progressEyebrow: {
    color: "#BACBB4",
    fontSize: 9,
    letterSpacing: 1.7,
    fontWeight: "700",
    marginBottom: 9,
  },
  progressTitle: { color: "#fff", fontSize: 21, fontWeight: "600", letterSpacing: -0.5 },
  progressNumber: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  completed: { color: colors.lime, fontSize: 38, fontWeight: "600", letterSpacing: -1.6 },
  total: { color: "#ADC2AC", fontSize: 18 },
  progressTrack: { height: 5, backgroundColor: "#4C7054", borderRadius: 4, marginTop: 24 },
  progressFill: { height: 5, borderRadius: 4, backgroundColor: colors.lime },
  progressHint: { color: "#CAD7C1", fontSize: 12, marginTop: 12 },
  habit: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 18,
    paddingLeft: 17,
    paddingRight: 10,
  },
  habitDone: { backgroundColor: "#F0F3E8", borderColor: "#DCE5CF" },
  habitCheck: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderColor: colors.line,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAF3",
  },
  habitChecked: { backgroundColor: colors.green, borderColor: colors.green },
  habitNumber: { fontSize: 12, fontWeight: "500", color: colors.muted },
  habitTitle: { flex: 1, fontSize: 16, lineHeight: 23, fontWeight: "500", color: colors.ink },
  surfaceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginTop: 29,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.greenLight,
  },
  surfaceIcon: { height: 41, width: 35, justifyContent: "center", alignItems: "center" },
});
