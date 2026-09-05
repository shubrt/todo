import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat2,
  Sparkles,
  Star,
} from "lucide-react";
import { api } from "@todo/backend/api";
import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { CheckControl, EmptyState, formatDay } from "../components/ui";
import { useTaskActions, type Task } from "./task-context";

export function TaskList({
  tasks,
  showArea = false,
  sortable = true,
  emptyTitle = "Hier ist Platz für deinen nächsten Schritt.",
  emptyText = "Halte oben fest, was du angehen möchtest.",
}: {
  tasks: Task[];
  showArea?: boolean;
  sortable?: boolean;
  emptyTitle?: string;
  emptyText?: string;
}) {
  const parents = tasks.filter((task) => !task.parentId);
  if (!parents.length)
    return (
      <EmptyState icon={<CheckCheck size={28} />} title={emptyTitle}>
        {emptyText}
      </EmptyState>
    );
  return (
    <div className="task-list" role="list">
      {parents.map((task) => (
        <TaskRow
          key={task._id}
          task={task}
          siblings={parents}
          childrenTasks={tasks.filter((child) => child.parentId === task._id)}
          showArea={showArea}
          sortable={sortable}
        />
      ))}
    </div>
  );
}

function TaskRow({
  task,
  siblings,
  childrenTasks,
  showArea,
  sortable,
  child = false,
}: {
  task: Task;
  siblings: Task[];
  childrenTasks: Task[];
  showArea?: boolean;
  sortable: boolean;
  child?: boolean;
}) {
  const actions = useTaskActions();
  const [expanded, setExpanded] = useState(false);
  const [newChild, setNewChild] = useState("");
  const [editing, setEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const update = useMutation(api.tasks.update);
  const completedChildren = childrenTasks.filter((entry) => entry.state === "done").length;
  const done = task.state === "done";
  const index = siblings.findIndex((entry) => entry._id === task._id);
  const pending = actions.pending.has(task._id);
  const mayReorder = sortable;
  const sortedSibling = (offset: number) => siblings[index + offset];

  async function onAddChild(event: FormEvent) {
    event.preventDefault();
    if (newChild.trim() && (await actions.addSubtask(task._id, newChild.trim()))) setNewChild("");
  }

  async function saveTitle(event: FormEvent) {
    event.preventDefault();
    if (editedTitle.trim() === task.title) {
      setEditing(false);
      return;
    }
    const saved = await actions.run(
      task._id,
      async () => {
        await update({ taskId: task._id, title: editedTitle.trim() });
        return true;
      },
      "Titel gespeichert.",
    );
    if (saved) setEditing(false);
  }

  return (
    <div role="listitem" className={`task-group ${child ? "child-group" : ""}`}>
      <div
        className={`task-row ${done ? "task-done" : ""} ${pending ? "task-pending" : ""}`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (
            event.altKey &&
            mayReorder &&
            (event.key === "ArrowUp" || event.key === "ArrowDown")
          ) {
            event.preventDefault();
            actions.reorder(siblings, task, event.key === "ArrowUp" ? -1 : 1);
          }
          if (event.key === "Enter" && event.target === event.currentTarget) actions.edit(task);
          if (event.key === "F2" && event.target === event.currentTarget) {
            event.preventDefault();
            setEditedTitle(task.title);
            setEditing(true);
          }
        }}
      >
        <CheckControl
          done={done}
          pending={pending}
          disabled={!actions.connected}
          onClick={() => actions.complete(task)}
          title={`${task.title} als erledigt markieren`}
        />
        {editing ? (
          <form className="inline-title-form" onSubmit={(event) => void saveTitle(event)}>
            <input
              autoFocus
              aria-label="Aufgabentitel"
              value={editedTitle}
              maxLength={500}
              required
              onChange={(event) => setEditedTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setEditing(false);
                }
              }}
            />
            <button
              className="icon-button small"
              aria-label="Titel speichern"
              disabled={!editedTitle.trim() || !actions.connected || pending}
            >
              <CheckCheck size={15} />
            </button>
          </form>
        ) : (
          <button className="task-main" type="button" onClick={() => actions.edit(task)}>
            <span className="task-title">{task.title}</span>
            <span className="task-metadata">
              {showArea && task.area && (
                <span className={`area-tag ${task.area}`}>{task.area}</span>
              )}
              {!child && task.kind !== "habit" && task.area !== "me" && (
                <span className={!task.projectName ? "missing-project" : ""}>
                  {task.projectName || "Projekt ergänzen"}
                </span>
              )}
              {task.dueOn && (
                <span className={task.isOverdue ? "overdue" : task.isDue ? "due" : ""}>
                  <CalendarDays size={12} />
                  {task.isOverdue ? "Überfällig · " : "Fällig · "}
                  {formatDay(task.dueOn)}
                </span>
              )}
              {task.plannedFor && !task.dueOn && (
                <span>
                  <CalendarDays size={12} />
                  {formatDay(task.plannedFor)}
                </span>
              )}
              {task.snoozedUntil && (
                <span>
                  <Clock3 size={12} />
                  {new Intl.DateTimeFormat("de-DE", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(task.snoozedUntil)}
                </span>
              )}
              {task.recurrenceId && task.kind !== "habit" && (
                <span>
                  <Repeat2 size={12} />
                  Wiederkehrend
                </span>
              )}
            </span>
          </button>
        )}
        <div className="task-badges">
          {task.isInbox && (
            <button
              className="badge inbox-badge"
              title="Inbox-Markierung entfernen. Die Position bleibt gleich."
              aria-label={`Inbox-Markierung von ${task.title} entfernen`}
              disabled={!actions.connected || pending}
              onClick={() => actions.clearInbox(task)}
            >
              <Inbox size={12} />
              <span>Inbox</span>
            </button>
          )}
          {task.isAi && (
            <button
              className="badge ai-badge"
              title="KI-Markierung entfernen"
              disabled={!actions.connected || pending}
              onClick={() => actions.toggleAi(task)}
            >
              <Sparkles size={12} />
              KI
            </button>
          )}
          {!child && task.highPriority && (
            <button
              className="priority-star"
              title="Hohe Priorität zurücknehmen"
              disabled={!actions.connected || pending}
              onClick={() => actions.togglePriority(task)}
            >
              <Star size={15} fill="currentColor" />
            </button>
          )}
        </div>
        {!child && childrenTasks.length > 0 && (
          <button
            className={`subtask-count ${expanded ? "expanded" : ""}`}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={`Unteraufgaben ${expanded ? "schließen" : "öffnen"}`}
          >
            <span>
              {completedChildren}/{childrenTasks.length}
            </span>
            <ChevronDown size={14} />
          </button>
        )}
        <div className="row-actions">
          {mayReorder && (
            <>
              <button
                type="button"
                className="icon-button small"
                title="Nach oben · Alt+↑"
                aria-label={`${task.title} nach oben`}
                disabled={
                  !actions.connected ||
                  pending ||
                  !sortedSibling(-1) ||
                  sortedSibling(-1)?.state !== task.state
                }
                onClick={() => actions.reorder(siblings, task, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                className="icon-button small"
                title="Nach unten · Alt+↓"
                aria-label={`${task.title} nach unten`}
                disabled={
                  !actions.connected ||
                  pending ||
                  !sortedSibling(1) ||
                  sortedSibling(1)?.state !== task.state
                }
                onClick={() => actions.reorder(siblings, task, 1)}
              >
                <ArrowDown size={14} />
              </button>
            </>
          )}
          <button
            type="button"
            className="icon-button small"
            title="Titel direkt bearbeiten · F2"
            aria-label={`${task.title} direkt bearbeiten`}
            disabled={!actions.connected || pending}
            onClick={() => {
              setEditedTitle(task.title);
              setEditing(!editing);
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            className="icon-button small"
            title="Aufgabe bearbeiten"
            aria-label={`${task.title} bearbeiten`}
            onClick={() => actions.edit(task)}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>
      {!child && expanded && (
        <div className="subtasks">
          <div role="list">
            {childrenTasks.map((entry) => (
              <TaskRow
                key={entry._id}
                task={entry}
                siblings={childrenTasks}
                childrenTasks={[]}
                child
                sortable
              />
            ))}
          </div>
          {!done && (
            <form className="add-subtask" onSubmit={(event) => void onAddChild(event)}>
              <Plus size={15} />
              <input
                aria-label={`Unteraufgabe zu ${task.title}`}
                placeholder="Unteraufgabe hinzufügen …"
                value={newChild}
                onChange={(event) => setNewChild(event.target.value)}
                disabled={!actions.connected || pending}
                maxLength={500}
              />
              <button
                type="submit"
                className="icon-button small"
                disabled={!newChild.trim() || !actions.connected || pending}
                aria-label="Unteraufgabe speichern"
              >
                <ChevronRight size={17} />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
