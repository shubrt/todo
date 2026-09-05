import { useMutation } from "convex/react";
import { api } from "@todo/backend/api";
import { useState, type FormEvent } from "react";
import { ArrowRight, CalendarDays, Clock3, Plus, Sparkles, Star, Trash2 } from "lucide-react";
import { Modal } from "../components/ui";
import { areas, useTaskActions, type Area, type Task } from "./task-context";

function dateTimeInput(timestamp: number | undefined) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const actions = useTaskActions();
  const update = useMutation(api.tasks.update);
  const move = useMutation(api.tasks.move);
  const plan = useMutation(api.tasks.plan);
  const snooze = useMutation(api.tasks.snooze);
  const discard = useMutation(api.tasks.discard);
  const normalize = useMutation(api.tasks.normalizeUrgency);
  const [title, setTitle] = useState(task.title);
  const [project, setProject] = useState(task.projectName ?? "");
  const [area, setArea] = useState<Area>(task.area ?? "me");
  const [list, setList] = useState<"active" | "backlog">(task.list ?? "active");
  const [isAi, setAi] = useState(task.isAi);
  const [priority, setPriority] = useState(task.highPriority);
  const [plannedFor, setPlannedFor] = useState(task.plannedFor ?? "");
  const [dueOn, setDueOn] = useState(task.dueOn ?? "");
  const [snoozedUntil, setSnoozedUntil] = useState(() => dateTimeInput(task.snoozedUntil));
  const [childTitle, setChildTitle] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const parent = !task.parentId;
  const normal = parent && task.kind === "task";
  const schedulable = normal && task.state === "open";
  const busy = actions.pending.has(task._id);

  async function save(event: FormEvent) {
    event.preventDefault();
    const saved = await actions.run(
      task._id,
      async () => {
        await update({
          taskId: task._id,
          title: title.trim(),
          isAi,
          ...(normal ? { highPriority: priority, projectName: project.trim() || null } : {}),
        });
        if (normal && (area !== task.area || list !== task.list))
          await move({ taskId: task._id, area, list });
        if (schedulable && (plannedFor !== (task.plannedFor ?? "") || dueOn !== (task.dueOn ?? "")))
          await plan({ taskId: task._id, plannedFor: plannedFor || null, dueOn: dueOn || null });
        if (schedulable && snoozedUntil !== dateTimeInput(task.snoozedUntil)) {
          const nextSnooze = snoozedUntil ? new Date(snoozedUntil).getTime() : null;
          await snooze({ taskId: task._id, snoozedUntil: nextSnooze });
        }
        return true;
      },
      "Änderungen gespeichert.",
    );
    if (saved) onClose();
  }

  return (
    <Modal title={parent ? "Aufgabe bearbeiten" : "Unteraufgabe bearbeiten"} onClose={onClose}>
      <form onSubmit={(event) => void save(event)} className="detail-form">
        <label className="field">
          <span>Aufgabe</span>
          <textarea
            autoFocus
            rows={2}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={500}
            required
          />
        </label>
        {normal && (
          <div className="field-grid">
            <label className="field">
              <span>Bereich</span>
              <select value={area} onChange={(event) => setArea(event.target.value as Area)}>
                {areas.map((entry) => (
                  <option key={entry}>{entry}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Liste</span>
              <select
                value={list}
                onChange={(event) => setList(event.target.value as "active" | "backlog")}
              >
                <option value="active">Aktiv</option>
                <option value="backlog">Backlog</option>
              </select>
            </label>
          </div>
        )}
        {normal && (
          <label className="field">
            <span>Projekt {area === "me" && <small>optional</small>}</span>
            <input
              value={project}
              onChange={(event) => setProject(event.target.value)}
              placeholder="Projektname"
              maxLength={120}
            />
          </label>
        )}
        <div className="toggle-fields">
          <button
            type="button"
            className={`toggle-chip ${isAi ? "selected" : ""}`}
            onClick={() => setAi(!isAi)}
            aria-pressed={isAi}
          >
            <Sparkles size={15} />
            Mit KI bearbeitbar
          </button>
          {normal && (
            <button
              type="button"
              className={`toggle-chip ${priority ? "selected" : ""}`}
              onClick={() => setPriority(!priority)}
              aria-pressed={priority}
            >
              <Star size={15} />
              Hohe Priorität
            </button>
          )}
        </div>
        {schedulable && (
          <details
            className="schedule-fields"
            open={Boolean(task.plannedFor || task.dueOn || task.snoozedUntil)}
          >
            <summary>
              <CalendarDays size={16} />
              Planung & Termine
            </summary>
            <div className="field-grid">
              <label className="field">
                <span>Einplanen für</span>
                <input
                  type="date"
                  value={plannedFor}
                  onChange={(event) => setPlannedFor(event.target.value)}
                />
                <small>Erscheint an diesem Tag wieder oben.</small>
              </label>
              <label className="field">
                <span>Verbindlich fällig am</span>
                <input
                  type="date"
                  value={dueOn}
                  onChange={(event) => setDueOn(event.target.value)}
                />
                <small>Wird am Termin zur Priorität.</small>
              </label>
            </div>
            <label className="field">
              <span>
                <Clock3 size={14} />
                Zurückstellen bis
              </span>
              <input
                type="datetime-local"
                value={snoozedUntil}
                onChange={(event) => setSnoozedUntil(event.target.value)}
              />
              <small>Uhrzeit in der Zeitzone dieses Geräts.</small>
            </label>
            {task.isOverdue && (
              <button
                type="button"
                className="text-button"
                disabled={!actions.connected || busy}
                onClick={() => {
                  void actions.run(
                    task._id,
                    async () => {
                      await normalize({ taskId: task._id });
                      onClose();
                    },
                    "Die Aufgabe wird wieder normal eingeordnet.",
                  );
                }}
              >
                Dringlichkeit zurücknehmen <ArrowRight size={14} />
              </button>
            )}
          </details>
        )}
        <div className="form-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={!actions.connected || busy || !title.trim()}
          >
            {busy ? "Wird gespeichert …" : "Speichern"}
          </button>
        </div>
      </form>
      {parent && task.kind === "task" && task.state === "open" && (
        <form
          className="detail-add-child"
          onSubmit={(event) => {
            event.preventDefault();
            void actions.addSubtask(task._id, childTitle.trim()).then((saved) => {
              if (saved) setChildTitle("");
            });
          }}
        >
          <label htmlFor="detail-child">Unteraufgabe hinzufügen</label>
          <div className="input-with-button">
            <input
              id="detail-child"
              value={childTitle}
              onChange={(event) => setChildTitle(event.target.value)}
              placeholder="Ein konkreter nächster Schritt …"
              maxLength={500}
            />
            <button
              className="button secondary"
              disabled={!actions.connected || busy || !childTitle.trim()}
            >
              <Plus size={17} />
              <span className="sr-only">Hinzufügen</span>
            </button>
          </div>
          <p className="field-hint">
            Unteraufgaben lassen sich einzeln erledigen. Den Haupttask schließt du selbst ab.
          </p>
        </form>
      )}
      <div className="discard-zone">
        {confirmDiscard ? (
          <>
            <p>
              Diese Aufgabe verwerfen? Offene Unteraufgaben werden ebenfalls entfernt. Es entsteht
              kein Erledigungseintrag.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="button danger"
                disabled={!actions.connected || busy}
                onClick={() => {
                  void actions.run(
                    task._id,
                    async () => {
                      await discard({ taskId: task._id });
                      onClose();
                    },
                    "Aufgabe verworfen.",
                  );
                }}
              >
                Verwerfen
              </button>
              <button className="text-button" onClick={() => setConfirmDiscard(false)}>
                Behalten
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="text-button danger-text"
            onClick={() => setConfirmDiscard(true)}
          >
            <Trash2 size={14} />
            Aufgabe verwerfen
          </button>
        )}
      </div>
    </Modal>
  );
}
