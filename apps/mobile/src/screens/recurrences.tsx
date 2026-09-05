import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@todo/backend/api";
import type { Id } from "@todo/backend/dataModel";
import { type Area } from "@todo/contracts";
import {
  Button,
  Chip,
  Empty,
  Field,
  Icon,
  IconButton,
  Loading,
  Notice,
  Sheet,
} from "../components/ui";
import { DateField } from "../components/date-field";
import { useActions } from "../lib/actions";
import { areas, validateDate } from "../lib/model";
import { base, colors } from "../theme";

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export function HabitSetup({ onClose }: { onClose: () => void }) {
  const [titles, setTitles] = useState(["", "", "", "", ""]);
  const [error, setError] = useState(false);
  const initialize = useMutation(api.settings.initializeHabits);
  const actions = useActions();
  async function save() {
    const result = await actions.run("initialize-habits", () =>
      initialize({ titles: titles.map((value) => value.trim()) }),
    );
    if (result.ok) onClose();
    else setError(true);
  }
  return (
    <Sheet
      title="Was gehört zu deinem Tag?"
      onClose={onClose}
      footer={
        <Button
          disabled={titles.some((title) => !title.trim()) || !actions.connected}
          busy={actions.pending.has("initialize-habits")}
          onPress={() => void save()}
        >
          Meine fünf Habits einrichten
        </Button>
      }
    >
      <Text style={[base.subtitle, { marginBottom: 23 }]}>
        Beginne mit fünf Dingen, die du täglich tun möchtest. Weitere kannst du später ergänzen.
      </Text>
      {error ? (
        <Notice error>Die Habits wurden noch nicht bestätigt. Bitte erneut versuchen.</Notice>
      ) : null}
      {titles.map((title, index) => (
        <Field
          key={index}
          label={`Habit ${index + 1}`}
          placeholder="Dein täglicher Schritt"
          value={title}
          onChangeText={(value) =>
            setTitles((current) => current.map((entry, item) => (item === index ? value : entry)))
          }
          maxLength={500}
        />
      ))}
    </Sheet>
  );
}

export function RecurrenceSheet({
  kind,
  defaultArea,
  onClose,
}: {
  kind: "task" | "habit";
  defaultArea: Area;
  onClose: () => void;
}) {
  const actions = useActions();
  const create = useMutation(api.recurrences.create);
  const [title, setTitle] = useState("");
  const [area, setArea] = useState(defaultArea);
  const [projectName, setProjectName] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startOn, setStartOn] = useState("");
  const [error, setError] = useState("");
  async function save() {
    setError("");
    if (
      !validateDate(startOn) ||
      (frequency === "monthly" &&
        (!Number.isInteger(Number(dayOfMonth)) ||
          Number(dayOfMonth) < 1 ||
          Number(dayOfMonth) > 31))
    ) {
      setError("Bitte einen gültigen Termin wählen.");
      return;
    }
    const rule =
      frequency === "daily"
        ? { frequency }
        : frequency === "weekly"
          ? { frequency, weekday }
          : { frequency, dayOfMonth: Number(dayOfMonth) };
    const result = await actions.run("recurrence-create", () =>
      create({
        title: title.trim(),
        kind,
        rule,
        ...(kind === "task" ? { area, projectName: projectName.trim() || undefined } : {}),
        ...(startOn ? { startOn } : {}),
      }),
    );
    if (result.ok) onClose();
    else setError("Die Wiederholung wurde noch nicht bestätigt. Bitte erneut versuchen.");
  }
  return (
    <Sheet
      title={kind === "habit" ? "Neuer täglicher Habit" : "Wiederkehrende Aufgabe"}
      onClose={onClose}
      footer={
        <Button
          onPress={() => void save()}
          disabled={!title.trim() || !actions.connected}
          busy={actions.pending.has("recurrence-create")}
        >
          Wiederholung speichern
        </Button>
      }
    >
      {error ? <Notice error>{error}</Notice> : null}
      <Field
        label={kind === "habit" ? "Dein Habit" : "Aufgabe"}
        placeholder="Was möchtest du regelmäßig tun?"
        value={title}
        onChangeText={setTitle}
        maxLength={500}
      />
      {kind === "task" ? (
        <>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
            {areas.map((entry) => (
              <Chip key={entry} selected={area === entry} onPress={() => setArea(entry)}>
                {entry}
              </Chip>
            ))}
          </View>
          <Field
            label="Projekt"
            value={projectName}
            onChangeText={setProjectName}
            maxLength={120}
          />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {(
              [
                ["daily", "Täglich"],
                ["weekly", "Wöchentlich"],
                ["monthly", "Monatlich"],
              ] as const
            ).map(([value, text]) => (
              <Chip key={value} selected={frequency === value} onPress={() => setFrequency(value)}>
                {text}
              </Chip>
            ))}
          </View>
          {frequency === "weekly" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
              {weekdays.map((entry, index) => (
                <Chip
                  key={entry}
                  selected={weekday === index + 1}
                  onPress={() => setWeekday(index + 1)}
                >
                  {entry}
                </Chip>
              ))}
            </View>
          ) : null}
          {frequency === "monthly" ? (
            <Field
              label="Tag im Monat"
              keyboardType="number-pad"
              value={dayOfMonth}
              onChangeText={setDayOfMonth}
              maxLength={2}
              hint="Fehlt der gewählte Tag, gilt der letzte Tag des Monats."
            />
          ) : null}
          <DateField
            label="Beginnen am"
            value={startOn}
            onChange={setStartOn}
            hint="Ohne Datum beginnt die Wiederholung beim nächsten passenden Termin."
          />
        </>
      ) : null}
      <Text style={base.small}>
        {kind === "habit"
          ? "Jeden Tag neu. Unerledigte Vortage erzeugen keine zusätzlichen Einträge."
          : "Solange die letzte Aufgabe noch offen ist, entsteht keine zweite offene Kopie."}
      </Text>
    </Sheet>
  );
}

export function RecurrenceManager({ defaultArea }: { defaultArea: Area }) {
  const recurrences = useQuery(api.recurrences.list, {});
  const update = useMutation(api.recurrences.update);
  const actions = useActions();
  const [creating, setCreating] = useState<"task" | "habit" | null>(null);
  const [editing, setEditing] = useState<Id<"recurrences"> | null>(null);
  const [title, setTitle] = useState("");
  return (
    <View>
      <View style={[base.row, { gap: 8, marginBottom: 14 }]}>
        <Button small variant="secondary" icon="add" onPress={() => setCreating("task")}>
          Aufgabe
        </Button>
        <Button small variant="secondary" icon="leaf-outline" onPress={() => setCreating("habit")}>
          Habit
        </Button>
      </View>
      {!recurrences ? (
        <Loading />
      ) : recurrences.length === 0 ? (
        <Empty icon="repeat-outline" title="Noch keine Wiederholungen">
          Regelmäßige Aufgaben kommen von selbst zurück.
        </Empty>
      ) : (
        recurrences.map((entry) => (
          <View
            key={entry._id}
            style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line }}
          >
            <View style={[base.row, { gap: 12 }]}>
              <Icon
                name={entry.kind === "habit" ? "leaf-outline" : "repeat-outline"}
                color={entry.enabled ? colors.green : colors.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[base.body, !entry.enabled && { color: colors.muted }]}>
                  {entry.title}
                </Text>
                <Text style={base.small}>
                  {entry.kind === "habit" ? "Habit" : entry.area} ·{" "}
                  {entry.rule.frequency === "daily"
                    ? "Täglich"
                    : entry.rule.frequency === "weekly"
                      ? `Jeden ${weekdays[entry.rule.weekday - 1]}`
                      : `Am ${entry.rule.dayOfMonth}. des Monats`}
                  {!entry.enabled ? " · Pausiert" : ""}
                </Text>
              </View>
              <IconButton
                name="create-outline"
                label={`${entry.title} umbenennen`}
                onPress={() => {
                  setEditing(entry._id);
                  setTitle(entry.title);
                }}
              />
              <IconButton
                name={entry.enabled ? "pause-outline" : "play-outline"}
                label={`${entry.title} ${entry.enabled ? "pausieren" : "fortsetzen"}`}
                disabled={!actions.connected || actions.pending.has(entry._id)}
                onPress={() =>
                  void actions.run(entry._id, () =>
                    update({ recurrenceId: entry._id, enabled: !entry.enabled }),
                  )
                }
              />
            </View>
          </View>
        ))
      )}
      {creating ? (
        <RecurrenceSheet
          kind={creating}
          defaultArea={defaultArea}
          onClose={() => setCreating(null)}
        />
      ) : null}
      {editing ? (
        <Sheet
          title="Wiederholung umbenennen"
          onClose={() => setEditing(null)}
          footer={
            <Button
              disabled={!title.trim() || !actions.connected}
              busy={actions.pending.has(editing)}
              onPress={() => {
                void actions
                  .run(editing, () => update({ recurrenceId: editing, title: title.trim() }))
                  .then((result) => {
                    if (result.ok) setEditing(null);
                  });
              }}
            >
              Speichern
            </Button>
          }
        >
          <Field label="Titel" value={title} onChangeText={setTitle} maxLength={500} />
          <Text style={base.small}>
            Gilt für die offene Aufgabe und alle künftigen Wiederholungen. Erledigte Arbeit behält
            ihren bisherigen Titel.
          </Text>
        </Sheet>
      ) : null}
    </View>
  );
}
