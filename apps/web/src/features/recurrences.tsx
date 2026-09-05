import { useMutation, useQuery } from "convex/react";
import { api } from "@todo/backend/api";
import { useState, type FormEvent } from "react";
import { CircleCheck, Pause, Play, Plus, Repeat2 } from "lucide-react";
import { Modal } from "../components/ui";
import { areas, useTaskActions, type Area } from "./task-context";

export function HabitSetup() {
  const initialize = useMutation(api.settings.initializeHabits);
  const actions = useTaskActions();
  const [titles, setTitles] = useState(["", "", "", "", ""]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await actions.run(
      "habit-setup",
      () => initialize({ titles: titles.map((title) => title.trim()) }),
      "Deine Habits sind eingerichtet.",
    );
  }
  return (
    <div className="habit-setup">
      <div className="setup-icon">
        <Repeat2 size={26} />
      </div>
      <h2>Was gehört zu deinem Tag?</h2>
      <p>
        Beginne mit fünf Habits. Du bestimmst, welche das sind. Weitere kannst du jederzeit
        ergänzen.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        {titles.map((title, index) => (
          <label className="habit-input" key={index}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <input
              aria-label={`Habit ${index + 1}`}
              placeholder={`Dein ${index + 1}. Habit`}
              required
              maxLength={500}
              value={title}
              onChange={(event) =>
                setTitles((previous) =>
                  previous.map((value, current) =>
                    current === index ? event.target.value : value,
                  ),
                )
              }
            />
          </label>
        ))}
        <button
          className="button primary"
          disabled={
            !actions.connected ||
            actions.pending.has("habit-setup") ||
            titles.some((title) => !title.trim())
          }
        >
          <CircleCheck size={16} />
          Habits einrichten
        </button>
      </form>
      <small>Jeden Tag neu. Offene Habits bleiben einmal stehen.</small>
    </div>
  );
}

export function RecurrenceModal({
  onClose,
  kind = "task",
  defaultArea = "me",
}: {
  onClose: () => void;
  kind?: "task" | "habit";
  defaultArea?: Area;
}) {
  const create = useMutation(api.recurrences.create);
  const actions = useTaskActions();
  const [title, setTitle] = useState("");
  const [area, setArea] = useState(defaultArea);
  const [projectName, setProjectName] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [startOn, setStartOn] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const rule =
      frequency === "weekly"
        ? { frequency, weekday }
        : frequency === "monthly"
          ? { frequency, dayOfMonth }
          : { frequency };
    const saved = await actions.run(
      "recurrence-create",
      async () => {
        await create({
          title: title.trim(),
          kind,
          rule,
          ...(kind === "task" ? { area, projectName: projectName.trim() || undefined } : {}),
          ...(startOn ? { startOn } : {}),
        });
        return true;
      },
      kind === "habit" ? "Habit hinzugefügt." : "Wiederholung eingerichtet.",
    );
    if (saved) onClose();
  }
  return (
    <Modal
      title={kind === "habit" ? "Habit hinzufügen" : "Wiederkehrende Aufgabe"}
      onClose={onClose}
    >
      <form className="detail-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>{kind === "habit" ? "Dein Habit" : "Aufgabe"}</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={500}
            placeholder="Was möchtest du regelmäßig tun?"
          />
        </label>
        {kind === "task" && (
          <>
            <div className="field-grid">
              <label className="field">
                <span>Bereich</span>
                <select value={area} onChange={(event) => setArea(event.target.value as Area)}>
                  {areas.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Projekt</span>
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  maxLength={120}
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Wiederholung</span>
                <select
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value as typeof frequency)}
                >
                  <option value="daily">Täglich</option>
                  <option value="weekly">Wöchentlich</option>
                  <option value="monthly">Monatlich</option>
                </select>
              </label>
              {frequency === "weekly" && (
                <label className="field">
                  <span>Wochentag</span>
                  <select
                    value={weekday}
                    onChange={(event) => setWeekday(Number(event.target.value))}
                  >
                    {[
                      "Montag",
                      "Dienstag",
                      "Mittwoch",
                      "Donnerstag",
                      "Freitag",
                      "Samstag",
                      "Sonntag",
                    ].map((day, index) => (
                      <option key={day} value={index + 1}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {frequency === "monthly" && (
                <label className="field">
                  <span>Tag im Monat</span>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    onChange={(event) => setDayOfMonth(Number(event.target.value))}
                  />
                </label>
              )}
            </div>
            <label className="field">
              <span>
                Beginnen am <small>optional</small>
              </span>
              <input
                type="date"
                value={startOn}
                onChange={(event) => setStartOn(event.target.value)}
              />
            </label>
          </>
        )}
        <p className="field-hint">
          Solange eine Wiederholung offen ist, entsteht keine zweite Aufgabe.
        </p>
        <div className="form-footer">
          <button className="button secondary" type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="button primary"
            disabled={
              !title.trim() || !actions.connected || actions.pending.has("recurrence-create")
            }
          >
            <Plus size={16} />
            {kind === "habit" ? "Hinzufügen" : "Einrichten"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function RecurrenceSettings() {
  const recurrences = useQuery(api.recurrences.list, {});
  const update = useMutation(api.recurrences.update);
  const actions = useTaskActions();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  return (
    <section className="settings-section">
      <div className="section-heading">
        <div>
          <h2>Wiederholungen</h2>
          <p>Aufgaben und Habits, die regelmäßig zurückkommen.</p>
        </div>
        <button className="button secondary compact" onClick={() => setCreateOpen(true)}>
          <Plus size={15} />
          Neu
        </button>
      </div>
      {recurrences?.length === 0 && (
        <p className="settings-empty">Noch keine Wiederholungen eingerichtet.</p>
      )}
      <div className="recurrence-list">
        {recurrences?.map((item) => (
          <div className="recurrence-item" key={item._id}>
            <span className={`recurrence-icon ${item.enabled ? "" : "paused"}`}>
              <Repeat2 size={17} />
            </span>
            <div className="recurrence-title">
              {editing === item._id ? (
                <form
                  className="input-with-button"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void actions.run(
                      item._id,
                      async () => {
                        await update({ recurrenceId: item._id, title: newTitle.trim() });
                        setEditing(null);
                      },
                      "Vorlage umbenannt.",
                    );
                  }}
                >
                  <input
                    aria-label="Vorlage umbenennen"
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    maxLength={500}
                    autoFocus
                  />
                  <button
                    className="button secondary compact"
                    disabled={!newTitle.trim() || !actions.connected}
                  >
                    Speichern
                  </button>
                </form>
              ) : (
                <button
                  className="plain-button"
                  title="Vorlage umbenennen"
                  onClick={() => {
                    setEditing(item._id);
                    setNewTitle(item.title);
                  }}
                >
                  {item.title}
                </button>
              )}
              <small>
                {item.kind === "habit" ? "Habit" : item.area} ·{" "}
                {item.rule.frequency === "daily"
                  ? "Täglich"
                  : item.rule.frequency === "weekly"
                    ? `Jeden ${["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"][item.rule.weekday - 1]}`
                    : `Am ${item.rule.dayOfMonth}. des Monats`}
                {!item.enabled && " · Pausiert"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label={`${item.title} ${item.enabled ? "pausieren" : "fortsetzen"}`}
              title={item.enabled ? "Wiederholung pausieren" : "Wiederholung fortsetzen"}
              disabled={!actions.connected || actions.pending.has(item._id)}
              onClick={() => {
                void actions.run(
                  item._id,
                  () => update({ recurrenceId: item._id, enabled: !item.enabled }),
                  item.enabled
                    ? "Wiederholung pausiert. Die aktuelle Aufgabe bleibt erhalten."
                    : "Wiederholung fortgesetzt.",
                );
              }}
            >
              {item.enabled ? <Pause size={17} /> : <Play size={17} />}
            </button>
          </div>
        ))}
      </div>
      {createOpen && <RecurrenceModal onClose={() => setCreateOpen(false)} />}
    </section>
  );
}
