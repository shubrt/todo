import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@todo/backend/api";
import { useMutation } from "convex/react";
import { useActions } from "../lib/actions";
import { formatDay, type Task } from "../lib/model";
import { areaColors, base, colors } from "../theme";
import { Icon, IconButton } from "./ui";

export function TaskRows({
  tasks,
  onEdit,
  today,
  showArea = false,
  sortable = true,
}: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  today: string;
  showArea?: boolean;
  sortable?: boolean;
}) {
  const roots = tasks.filter((task) => !task.parentId);
  return (
    <View style={styles.list}>
      {roots.map((task) => (
        <TaskRow
          key={task._id}
          task={task}
          childrenTasks={tasks.filter((child) => child.parentId === task._id)}
          siblings={roots}
          onEdit={onEdit}
          today={today}
          showArea={showArea}
          sortable={sortable}
        />
      ))}
    </View>
  );
}

function TaskRow({
  task,
  childrenTasks,
  siblings,
  onEdit,
  today,
  showArea,
  sortable,
  child = false,
}: {
  task: Task;
  childrenTasks: Task[];
  siblings: Task[];
  onEdit: (task: Task) => void;
  today: string;
  showArea?: boolean;
  sortable: boolean;
  child?: boolean;
}) {
  const actions = useActions();
  const clearInbox = useMutation(api.tasks.clearInbox);
  const [expanded, setExpanded] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const busy = actions.pending.has(task._id);
  const done = task.state === "done";
  const completedChildren = childrenTasks.filter((item) => item.state === "done").length;
  const index = siblings.findIndex((item) => item._id === task._id);
  return (
    <View style={[styles.group, child && styles.childGroup]}>
      <View style={[styles.taskRow, done && { opacity: 0.65 }]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done, disabled: done || busy || !actions.connected }}
          accessibilityLabel={`${task.title} erledigen`}
          disabled={done || busy || !actions.connected}
          onPress={() => void actions.complete(task)}
          hitSlop={8}
          style={[styles.checkbox, done && styles.checked]}
        >
          {busy ? (
            <ActivityIndicator color={colors.green} size="small" />
          ) : done ? (
            <Icon name="checkmark" size={16} color="#fff" />
          ) : null}
        </Pressable>
        <Pressable
          style={{ flex: 1 }}
          onPress={() => onEdit(task)}
          onLongPress={() => {
            if (sortable) setOrdering(!ordering);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${task.title} bearbeiten`}
        >
          <Text style={[styles.title, done && styles.doneTitle]}>{task.title}</Text>
          <View style={styles.metadata}>
            {showArea && task.area ? (
              <View style={[styles.areaDot, { backgroundColor: areaColors[task.area] }]} />
            ) : null}
            {showArea && task.area ? <Text style={styles.metadataText}>{task.area}</Text> : null}
            {task.projectName ? (
              <Text numberOfLines={1} style={styles.metadataText}>
                {task.projectName}
              </Text>
            ) : !child && task.kind === "task" && task.area !== "me" ? (
              <Text style={[styles.metadataText, { color: colors.amber }]}>Projekt ergänzen</Text>
            ) : null}
            {task.dueOn ? (
              <Text
                style={[
                  styles.metadataText,
                  (task.isDue || task.isOverdue) && {
                    color: task.isOverdue ? colors.red : colors.amber,
                  },
                ]}
              >
                {task.isOverdue ? "Überfällig · " : "Fällig · "}
                {formatDay(task.dueOn, today)}
              </Text>
            ) : task.plannedFor ? (
              <Text style={styles.metadataText}>{formatDay(task.plannedFor, today)}</Text>
            ) : null}
            {task.isAi ? (
              <View style={[base.row, { gap: 3 }]}>
                <Icon name="sparkles-outline" size={11} color={colors.muted} />
                <Text style={styles.metadataText}>KI</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
        {task.highPriority ? <Icon name="star" size={14} color={colors.amber} /> : null}
        {task.isInbox ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Inbox-Markierung von ${task.title} entfernen`}
            disabled={!actions.connected || busy}
            onPress={() => void actions.run(task._id, () => clearInbox({ taskId: task._id }))}
            style={styles.inbox}
          >
            <Icon name="file-tray-outline" size={14} color={colors.green} />
          </Pressable>
        ) : null}
        {childrenTasks.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Unteraufgaben anzeigen"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
            style={styles.childCount}
          >
            <Text style={styles.countText}>
              {completedChildren}/{childrenTasks.length}
            </Text>
            <Icon name={expanded ? "chevron-up" : "chevron-down"} size={12} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {ordering && sortable ? (
        <View style={styles.ordering}>
          <Text style={[base.small, { flex: 1 }]}>Reihenfolge ändern</Text>
          <IconButton
            name="arrow-up"
            label="Nach oben"
            disabled={
              !actions.connected ||
              busy ||
              !siblings[index - 1] ||
              siblings[index - 1]!.state !== task.state
            }
            onPress={() => void actions.moveOrder(siblings, task, -1)}
          />
          <IconButton
            name="arrow-down"
            label="Nach unten"
            disabled={
              !actions.connected ||
              busy ||
              !siblings[index + 1] ||
              siblings[index + 1]!.state !== task.state
            }
            onPress={() => void actions.moveOrder(siblings, task, 1)}
          />
          <IconButton
            name="close"
            label="Sortierung schließen"
            onPress={() => setOrdering(false)}
          />
        </View>
      ) : null}
      {expanded ? (
        <View style={styles.children}>
          {childrenTasks.map((item) => (
            <TaskRow
              key={item._id}
              task={item}
              siblings={childrenTasks}
              childrenTasks={[]}
              onEdit={onEdit}
              today={today}
              sortable
              child
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 9 },
  group: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    overflow: "hidden",
  },
  childGroup: { borderWidth: 0, borderRadius: 0, backgroundColor: "transparent" },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 79,
    paddingHorizontal: 15,
    paddingVertical: 16,
  },
  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 8,
    borderColor: "#CCD4C6",
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 1,
  },
  checked: { backgroundColor: colors.green, borderColor: colors.green },
  title: { fontSize: 15, lineHeight: 22, color: colors.ink, fontWeight: "500" },
  doneTitle: { textDecorationLine: "line-through", color: colors.muted },
  metadata: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 4 },
  metadataText: { fontSize: 11, lineHeight: 16, color: colors.muted },
  areaDot: { width: 5, height: 5, borderRadius: 4 },
  inbox: { backgroundColor: colors.greenLight, padding: 7, borderRadius: 9 },
  childCount: {
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingLeft: 4,
    minHeight: 36,
  },
  countText: { fontSize: 10, color: colors.muted, fontWeight: "600" },
  children: { marginLeft: 33, borderTopWidth: 1, borderTopColor: colors.line, marginRight: 8 },
  ordering: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
