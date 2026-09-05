import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@todo/backend/api";
import { type Area } from "@todo/contracts";
import { DateField, TimeField } from "../components/date-field";
import {
  Button,
  Chip,
  Field,
  IconButton,
  Notice,
  SectionLabel,
  Sheet,
  SwitchRow,
} from "../components/ui";
import { useActions } from "../lib/actions";
import { areas, shiftDate, validateDate, type Task } from "../lib/model";
import { base, colors } from "../theme";

export function CaptureSheet({ defaultArea, onClose }: { defaultArea: Area; onClose: () => void }) {
  const create = useMutation(api.tasks.create);
  const actions = useActions();
  const [title, setTitle] = useState("");
  const [area, setArea] = useState(defaultArea);
  const [projectName, setProjectName] = useState("");
  const [isAi, setAi] = useState(false);
  const [error, setError] = useState("");
  const busy = actions.pending.has("capture");
  async function capture() {
    const result = await actions.run("capture", () =>
      create({ title: title.trim(), area, projectName: projectName.trim() || undefined, isAi }),
    );
    if (result.ok) onClose();
    else setError("Die Aufgabe wurde noch nicht bestätigt. Bitte erneut versuchen.");
  }
  return (
    <Sheet
      title="Gedanken festhalten"
      onClose={onClose}
      footer={
        <Button
          onPress={() => void capture()}
          disabled={!title.trim() || !actions.connected}
          busy={busy}
          icon="add"
        >
          Aufgabe hinzufügen
        </Button>
      }
    >
      <Text style={[base.subtitle, { marginTop: 0, marginBottom: 22 }]}>
        Ein klarer Auftrag reicht. Alles Weitere kannst du später einordnen.
      </Text>
      {error ? <Notice error>{error}</Notice> : null}
      <Field
        label="Was möchtest du tun?"
        placeholder="Zum Beispiel: Mit Alex das Angebot besprechen"
        multiline
        autoFocus
        maxLength={500}
        value={title}
        onChangeText={setTitle}
      />
      <Text style={[base.small, { marginBottom: 9 }]}>Bereich</Text>
      <View style={styles.chips}>
        {areas.map((value) => (
          <Chip key={value} selected={area === value} onPress={() => setArea(value)}>
            {value}
          </Chip>
        ))}
      </View>
      {area !== "me" ? (
        <Field
          label="Projekt"
          hint="Kann für den ersten Einfall noch offenbleiben."
          placeholder="Projektname"
          value={projectName}
          onChangeText={setProjectName}
          maxLength={120}
        />
      ) : null}
      <SwitchRow label="Mit KI bearbeitbar" icon="sparkles-outline" value={isAi} onChange={setAi} />
      <Text style={[base.small, { marginTop: 12 }]}>
        Kommt mit Inbox-Markierung oben in deine aktive Liste.
      </Text>
    </Sheet>
  );
}

export function TaskEditor({
  initialTask,
  today,
  onClose,
}: {
  initialTask: Task;
  today: string;
  onClose: () => void;
}) {
  const live = useQuery(api.tasks.get, { taskId: initialTask._id });
  const task = live ?? initialTask;
  const actions = useActions();
  const update = useMutation(api.tasks.update);
  const updateRecurrence = useMutation(api.recurrences.update);
  const move = useMutation(api.tasks.move);
  const plan = useMutation(api.tasks.plan);
  const snooze = useMutation(api.tasks.snooze);
  const normalize = useMutation(api.tasks.normalizeUrgency);
  const discard = useMutation(api.tasks.discard);
  const addSubtask = useMutation(api.tasks.addSubtask);
  const [title, setTitle] = useState(initialTask.title);
  const [projectName, setProjectName] = useState(initialTask.projectName ?? "");
  const [area, setArea] = useState<Area>(initialTask.area ?? "me");
  const [list, setList] = useState<"active" | "backlog">(initialTask.list ?? "active");
  const [isAi, setAi] = useState(initialTask.isAi);
  const [highPriority, setPriority] = useState(initialTask.highPriority);
  const [plannedFor, setPlannedFor] = useState(initialTask.plannedFor ?? "");
  const [dueOn, setDueOn] = useState(initialTask.dueOn ?? "");
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(initialTask.snoozedUntil ?? null);
  const [showPlanning, setShowPlanning] = useState(
    Boolean(initialTask.plannedFor || initialTask.dueOn || initialTask.snoozedUntil),
  );
  const [childTitle, setChildTitle] = useState("");
  const [error, setError] = useState("");
  const root = !task.parentId && task.kind === "task";
  const schedulable = root && task.state === "open";
  const busy = actions.pending.has(task._id);
  const subtasks = live?.subtasks ?? [];
  async function save() {
    setError("");
    if (!validateDate(plannedFor) || !validateDate(dueOn)) {
      setError("Bitte ein gültiges Datum im Format JJJJ-MM-TT eingeben.");
      return;
    }
    if (
      snoozedUntil !== null &&
      snoozedUntil !== initialTask.snoozedUntil &&
      snoozedUntil <= Date.now()
    ) {
      setError("Der Snooze-Zeitpunkt muss in der Zukunft liegen.");
      return;
    }
    const saved = await actions.run(task._id, async () => {
      if (task.kind === "habit" && task.recurrenceId) {
        await updateRecurrence({ recurrenceId: task.recurrenceId, title: title.trim() });
        return;
      }
      await update({
        taskId: task._id,
        title: title.trim(),
        isAi,
        ...(root ? { projectName: projectName.trim() || null, highPriority } : {}),
      });
      if (root && (area !== task.area || list !== task.list))
        await move({ taskId: task._id, area, list });
      if (schedulable && (plannedFor !== (task.plannedFor ?? "") || dueOn !== (task.dueOn ?? "")))
        await plan({ taskId: task._id, plannedFor: plannedFor || null, dueOn: dueOn || null });
      if (schedulable && snoozedUntil !== (task.snoozedUntil ?? null))
        await snooze({ taskId: task._id, snoozedUntil });
    });
    if (saved.ok) onClose();
    else
      setError(
        "Nicht alle Änderungen wurden bestätigt. Bitte den Stand prüfen und erneut speichern.",
      );
  }
  function confirmDiscard() {
    if (task.kind === "habit" && task.recurrenceId) {
      const recurrenceId = task.recurrenceId;
      Alert.alert(
        "Habit pausieren?",
        "Dieser Habit erscheint nicht mehr täglich. Du kannst ihn in den Einstellungen wieder aktivieren. Dein Rückblick bleibt erhalten.",
        [
          { text: "Behalten", style: "cancel" },
          {
            text: "Pausieren",
            onPress: () => {
              void actions
                .run(task._id, () => updateRecurrence({ recurrenceId, enabled: false }))
                .then((result) => {
                  if (result.ok) onClose();
                });
            },
          },
        ],
      );
      return;
    }
    Alert.alert(
      "Aufgabe verwerfen?",
      "Offene Unteraufgaben werden ebenfalls entfernt. Bereits erledigte Arbeit bleibt im Rückblick erhalten.",
      [
        { text: "Behalten", style: "cancel" },
        {
          text: "Verwerfen",
          style: "destructive",
          onPress: () => {
            void actions
              .run(task._id, () => discard({ taskId: task._id }))
              .then((result) => {
                if (result.ok) onClose();
              });
          },
        },
      ],
    );
  }
  return (
    <Sheet
      title={task.kind === "habit" ? "Habit" : task.parentId ? "Unteraufgabe" : "Aufgabe"}
      onClose={onClose}
      footer={
        <Button
          onPress={() => void save()}
          disabled={!title.trim() || !actions.connected}
          busy={busy}
        >
          Änderungen speichern
        </Button>
      }
    >
      {error ? (
        <Notice error onClose={() => setError("")}>
          {error}
        </Notice>
      ) : null}
      <Field label="Aufgabe" value={title} onChangeText={setTitle} multiline maxLength={500} />
      {root ? (
        <>
          <View style={styles.chips}>
            {areas.map((value) => (
              <Chip key={value} selected={area === value} onPress={() => setArea(value)}>
                {value}
              </Chip>
            ))}
          </View>
          <View style={styles.chips}>
            <Chip selected={list === "active"} onPress={() => setList("active")}>
              Aktive Liste
            </Chip>
            <Chip selected={list === "backlog"} onPress={() => setList("backlog")}>
              Backlog
            </Chip>
          </View>
          <Field
            label="Projekt"
            value={projectName}
            onChangeText={setProjectName}
            maxLength={120}
            placeholder={area === "me" ? "Optional" : "Projektname"}
          />
        </>
      ) : null}
      {task.kind === "habit" ? (
        <Text style={[base.small, { marginBottom: 14 }]}>
          Der Name gilt auch für kommende Tage. Bereits erledigte Einträge bleiben unverändert.
        </Text>
      ) : (
        <SwitchRow
          label="Mit KI bearbeitbar"
          icon="sparkles-outline"
          value={isAi}
          onChange={setAi}
        />
      )}
      {root ? (
        <SwitchRow
          label="Hohe Priorität"
          hint="Auch in Wichtig sichtbar."
          icon="star-outline"
          value={highPriority}
          onChange={setPriority}
        />
      ) : null}
      {schedulable ? (
        <>
          <Button
            variant="ghost"
            icon="calendar-outline"
            onPress={() => setShowPlanning(!showPlanning)}
          >
            {showPlanning ? "Planung einklappen" : "Planung und Termine"}
          </Button>
          {showPlanning ? (
            <View style={styles.planning}>
              <DateField
                label="Einplanen für"
                value={plannedFor}
                onChange={setPlannedFor}
                hint="An diesem Tag wieder oben in der aktiven Liste."
              />
              <View style={styles.chips}>
                <Chip onPress={() => setPlannedFor(today)}>Heute</Chip>
                <Chip onPress={() => setPlannedFor(shiftDate(today, 1))}>Morgen</Chip>
                <Chip onPress={() => setPlannedFor("")}>Ohne Plan</Chip>
              </View>
              <DateField
                label="Verbindlich fällig am"
                value={dueOn}
                onChange={setDueOn}
                hint="Gehört am Termin zusätzlich zu Wichtig."
              />
              <View style={styles.chips}>
                <Chip onPress={() => setDueOn(today)}>Heute</Chip>
                <Chip onPress={() => setDueOn(shiftDate(today, 1))}>Morgen</Chip>
                <Chip onPress={() => setDueOn("")}>Keine Frist</Chip>
              </View>
              <Text style={[base.body, { fontWeight: "600", marginBottom: 8 }]}>Zurückstellen</Text>
              <Text style={[base.small, { marginBottom: 12 }]}>
                {snoozedUntil
                  ? `Bis ${new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(snoozedUntil)}`
                  : "Gerade nicht zurückgestellt"}
              </Text>
              <View style={styles.chips}>
                <Chip onPress={() => setSnoozedUntil(Date.now() + 3600_000)}>1 Stunde</Chip>
                <Chip onPress={() => setSnoozedUntil(Date.now() + 3 * 3600_000)}>3 Stunden</Chip>
                <Chip
                  onPress={() => {
                    const next = new Date();
                    next.setDate(next.getDate() + 1);
                    next.setHours(9, 0, 0, 0);
                    setSnoozedUntil(next.getTime());
                  }}
                >
                  Morgen 9 Uhr
                </Chip>
                <Chip onPress={() => setSnoozedUntil(null)}>Aufheben</Chip>
              </View>
              <TimeField value={snoozedUntil} onChange={setSnoozedUntil} />
              <Text style={base.small}>Snooze-Uhrzeiten gelten in der Zeitzone dieses Geräts.</Text>
              {task.isOverdue || task.highPriority ? (
                <Button
                  variant="ghost"
                  onPress={() => {
                    void actions
                      .run(task._id, () => normalize({ taskId: task._id }))
                      .then((result) => {
                        if (result.ok) {
                          setPriority(false);
                          setDueOn("");
                          setPlannedFor("");
                        }
                      });
                  }}
                >
                  Wieder normal behandeln
                </Button>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
      {root ? (
        <>
          <SectionLabel>Unteraufgaben</SectionLabel>
          {subtasks.map((child) => (
            <View key={child._id} style={styles.child}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    base.body,
                    child.state === "done" && {
                      textDecorationLine: "line-through",
                      color: colors.muted,
                    },
                  ]}
                >
                  {child.title}
                </Text>
              </View>
              <IconButton
                name={child.state === "done" ? "checkmark-circle" : "ellipse-outline"}
                label={`${child.title} erledigen`}
                disabled={
                  child.state === "done" || !actions.connected || actions.pending.has(child._id)
                }
                onPress={() => void actions.complete(child)}
              />
            </View>
          ))}
          {task.state === "open" ? (
            <>
              <Field
                label="Neue Unteraufgabe"
                placeholder="Ein konkreter nächster Schritt"
                value={childTitle}
                onChangeText={setChildTitle}
                maxLength={500}
              />
              <Button
                variant="secondary"
                small
                icon="add"
                disabled={!childTitle.trim() || !actions.connected}
                busy={busy}
                onPress={() => {
                  void actions
                    .run(task._id, () => addSubtask({ taskId: task._id, title: childTitle.trim() }))
                    .then((result) => {
                      if (result.ok) setChildTitle("");
                    });
                }}
              >
                Unteraufgabe hinzufügen
              </Button>
              <Text style={[base.small, { marginTop: 10 }]}>
                Den Haupttask schließt du weiterhin selbst ab.
              </Text>
            </>
          ) : null}
        </>
      ) : null}
      <View style={{ marginTop: 26 }}>
        <Button
          variant="danger"
          icon="trash-outline"
          disabled={busy || !actions.connected}
          onPress={confirmDiscard}
        >
          {task.kind === "habit" ? "Habit pausieren" : "Aufgabe verwerfen"}
        </Button>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 18 },
  planning: { padding: 16, backgroundColor: colors.background, borderRadius: 14 },
  child: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: 10,
  },
});
