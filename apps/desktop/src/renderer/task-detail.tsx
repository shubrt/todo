import { api } from "@todo/backend/api";
import { useMutation } from "convex/react";
import { CalendarDays, Clock3, Sparkles, Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTasks, type Area, type Task } from "./task-context";
import { dateTimeInput, Dialog } from "./ui";

export function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const actions = useTasks();
  const update = useMutation(api.tasks.update);
  const move = useMutation(api.tasks.move);
  const plan = useMutation(api.tasks.plan);
  const snooze = useMutation(api.tasks.snooze);
  const discard = useMutation(api.tasks.discard);
  const normalize = useMutation(api.tasks.normalizeUrgency);
  const [title, setTitle] = useState(task.title);
  const [area, setArea] = useState<Area>(task.area ?? "me");
  const [list, setList] = useState(task.list ?? "active");
  const [project, setProject] = useState(task.projectName ?? "");
  const [isAi, setAi] = useState(task.isAi);
  const [highPriority, setHighPriority] = useState(task.highPriority);
  const [plannedFor, setPlannedFor] = useState(task.plannedFor ?? "");
  const [dueOn, setDueOn] = useState(task.dueOn ?? "");
  const [snoozedUntil, setSnoozedUntil] = useState(dateTimeInput(task.snoozedUntil));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const root = !task.parentId && task.kind === "task";
  const schedulable = root && task.state === "open";
  const pending = actions.pending.has(task._id);
  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await actions.run(
      task._id,
      async () => {
        await update({
          taskId: task._id,
          title: title.trim(),
          isAi,
          ...(root ? { highPriority, projectName: project.trim() || null } : {}),
        });
        if (root && (area !== task.area || list !== task.list))
          await move({ taskId: task._id, area, list });
        if (schedulable && (plannedFor !== (task.plannedFor ?? "") || dueOn !== (task.dueOn ?? "")))
          await plan({ taskId: task._id, plannedFor: plannedFor || null, dueOn: dueOn || null });
        if (schedulable && snoozedUntil !== dateTimeInput(task.snoozedUntil))
          await snooze({
            taskId: task._id,
            snoozedUntil: snoozedUntil ? new Date(snoozedUntil).getTime() : null,
          });
      },
      "Gespeichert.",
    );
    if (result) onClose();
  }
  return (
    <Dialog
      title={task.parentId ? "Unteraufgabe" : task.kind === "habit" ? "Habit" : "Aufgabe"}
      onClose={onClose}
    >
      <form className="detail-form" onSubmit={(event) => void save(event)}>
        <label className="field">
          <span>Aufgabe</span>
          <textarea
            autoFocus
            rows={2}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={500}
          />
        </label>
        {root && (
          <>
            <div className="field-grid">
              <label className="field">
                <span>Bereich</span>
                <select value={area} onChange={(event) => setArea(event.target.value as Area)}>
                  <option>me</option>
                  <option>agency</option>
                  <option>work</option>
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
            <label className="field">
              <span>Projekt</span>
              <input
                value={project}
                onChange={(event) => setProject(event.target.value)}
                maxLength={120}
                placeholder="Projektname"
              />
            </label>
          </>
        )}
        <div className="toggle-row">
          <button
            type="button"
            className={`toggle ${isAi ? "selected" : ""}`}
            aria-pressed={isAi}
            onClick={() => setAi(!isAi)}
          >
            <Sparkles size={13} />
            Mit KI
          </button>
          {root && (
            <button
              type="button"
              className={`toggle ${highPriority ? "selected" : ""}`}
              aria-pressed={highPriority}
              onClick={() => setHighPriority(!highPriority)}
            >
              <Star size={13} />
              Hohe Priorität
            </button>
          )}
        </div>
        {schedulable && (
          <details
            className="date-fields"
            open={Boolean(task.plannedFor || task.dueOn || task.snoozedUntil)}
          >
            <summary>
              <CalendarDays size={13} />
              Planung & Termine
            </summary>
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
              <input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
            </label>
            <label className="field">
              <span>
                <Clock3 size={12} />
                Zurückstellen bis
              </span>
              <input
                type="datetime-local"
                value={snoozedUntil}
                onChange={(event) => setSnoozedUntil(event.target.value)}
              />
              <small>Uhrzeit auf diesem Mac.</small>
            </label>
            {task.isOverdue && (
              <button
                className="text-button"
                type="button"
                disabled={!actions.connected || pending}
                onClick={() => {
                  void actions
                    .run(
                      task._id,
                      () => normalize({ taskId: task._id }),
                      "Dringlichkeit zurückgenommen.",
                    )
                    .then((saved) => {
                      if (saved) onClose();
                    });
                }}
              >
                Wieder normal einordnen
              </button>
            )}
          </details>
        )}
        <div className="button-row end">
          <button type="button" className="button secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="button primary"
            disabled={!title.trim() || !actions.connected || pending}
          >
            {pending ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </form>
      <div className="discard-section">
        {confirmDelete ? (
          <>
            <p className="hint">
              Aufgabe und offene Unteraufgaben verwerfen? Bereits erledigte Arbeit bleibt im
              Verlauf.
            </p>
            <div className="button-row">
              <button
                className="button danger"
                disabled={!actions.connected || pending}
                onClick={() => {
                  void actions
                    .run(task._id, () => discard({ taskId: task._id }), "Aufgabe verworfen.")
                    .then((saved) => {
                      if (saved) onClose();
                    });
                }}
              >
                Verwerfen
              </button>
              <button className="text-button" onClick={() => setConfirmDelete(false)}>
                Behalten
              </button>
            </div>
          </>
        ) : (
          <button className="text-button danger-text" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={12} />
            Aufgabe verwerfen
          </button>
        )}
      </div>
    </Dialog>
  );
}
