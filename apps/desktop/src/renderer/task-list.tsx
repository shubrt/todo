import { api } from "@todo/backend/api";
import { useMutation } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Inbox,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Sparkles,
  Star,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { dayLabel } from "./ui";
import { useTasks, type Task } from "./task-context";

export function TaskSection({
  title,
  tasks,
  showArea = false,
  sortable = true,
  children,
}: {
  title: string;
  tasks: Task[];
  showArea?: boolean;
  sortable?: boolean;
  children?: React.ReactNode;
}) {
  const roots = tasks.filter((task) => !task.parentId);
  return (
    <section className="task-section">
      <h2>
        {title}
        <span>{roots.filter((task) => task.state === "open").length}</span>
      </h2>
      {roots.length ? (
        <div role="list">
          {roots.map((task) => (
            <TaskRow
              key={task._id}
              task={task}
              siblings={roots}
              childrenTasks={tasks.filter((child) => child.parentId === task._id)}
              showArea={showArea}
              sortable={sortable}
            />
          ))}
        </div>
      ) : (
        <p className="empty-section">{children ?? "Noch keine Aufgaben."}</p>
      )}
    </section>
  );
}

function TaskRow({
  task,
  siblings,
  childrenTasks = [],
  showArea = false,
  sortable = true,
}: {
  task: Task;
  siblings: Task[];
  childrenTasks?: Task[];
  showArea?: boolean;
  sortable?: boolean;
}) {
  const actions = useTasks();
  const update = useMutation(api.tasks.update);
  const clearInbox = useMutation(api.tasks.clearInbox);
  const addSubtask = useMutation(api.tasks.addSubtask);
  const [expanded, setExpanded] = useState(false);
  const [childTitle, setChildTitle] = useState("");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const input = useRef<HTMLTextAreaElement>(null);
  const done = task.state === "done";
  const busy = actions.pending.has(task._id);
  const child = Boolean(task.parentId);
  const group = siblings.filter((item) => item.state === task.state);
  const index = group.findIndex((item) => item._id === task._id);
  const doneChildren = childrenTasks.filter((item) => item.state === "done").length;

  useEffect(() => {
    if (!editing) setTitle(task.title);
  }, [task.title, editing]);
  useEffect(() => {
    if (editing && input.current) {
      input.current.style.height = "auto";
      input.current.style.height = `${input.current.scrollHeight}px`;
    }
  }, [editing, title]);
  async function saveTitle() {
    if (!title.trim()) return;
    if (title.trim() === task.title) {
      setEditing(false);
      return;
    }
    if (await actions.run(task._id, () => update({ taskId: task._id, title: title.trim() })))
      setEditing(false);
  }
  async function finish() {
    if (editing && title.trim() !== task.title) {
      if (
        !title.trim() ||
        !(await actions.run(task._id, () => update({ taskId: task._id, title: title.trim() })))
      )
        return;
      setEditing(false);
    }
    actions.complete(task);
  }
  async function createChild(event: FormEvent) {
    event.preventDefault();
    if (
      childTitle.trim() &&
      (await actions.run(task._id, () =>
        addSubtask({ taskId: task._id, title: childTitle.trim() }),
      ))
    )
      setChildTitle("");
  }

  return (
    <div className={`task-block ${child ? "subtask-block" : ""}`} role="listitem">
      <div
        className={`task-row ${done ? "done" : ""}`}
        tabIndex={0}
        onFocus={() => actions.focus(task, siblings)}
        onKeyDown={(event) => {
          if (event.altKey && sortable && ["ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            actions.reorder(siblings, task, event.key === "ArrowUp" ? -1 : 1);
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (!done) void finish();
          }
          if (
            (event.key === "Enter" || event.key === "F2") &&
            event.target === event.currentTarget
          ) {
            event.preventDefault();
            setEditing(true);
          }
        }}
      >
        <button
          className={`checkbox ${done ? "checked" : ""}`}
          role="checkbox"
          aria-checked={done}
          aria-label={`${task.title} erledigen`}
          disabled={done || busy || !actions.connected}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void finish()}
        >
          {busy ? (
            <LoaderCircle size={11} className="spin" />
          ) : done ? (
            <Check size={11} strokeWidth={3} />
          ) : null}
        </button>
        <div className="task-body">
          {editing ? (
            <textarea
              ref={input}
              className="inline-title"
              rows={1}
              autoFocus
              value={title}
              aria-label="Aufgabentitel"
              maxLength={500}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setTitle(task.title);
                  setEditing(false);
                }
                if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
                  event.preventDefault();
                  void saveTitle();
                }
              }}
            />
          ) : (
            <button
              className="task-title"
              onClick={() => setEditing(true)}
              title="Titel direkt bearbeiten"
            >
              {task.title}
            </button>
          )}
          <div className="metadata">
            {showArea && task.area && <span className={`area-pill ${task.area}`}>{task.area}</span>}
            {!child && task.kind === "task" && task.area !== "me" && (
              <button className="project" onClick={() => actions.edit(task)}>
                {task.projectName || "Projekt ergänzen"}
              </button>
            )}
            {task.isInbox && (
              <button
                className="inbox-tag"
                disabled={!actions.connected || busy}
                onClick={() => {
                  void actions.run(
                    task._id,
                    () => clearInbox({ taskId: task._id }),
                    "Inbox-Markierung entfernt.",
                  );
                }}
                title="Inbox-Markierung entfernen. Die Position bleibt gleich."
              >
                <Inbox size={11} />
                Inbox
              </button>
            )}
            {task.isAi && (
              <button
                className="ai-tag"
                title="KI-Markierung entfernen"
                disabled={!actions.connected || busy}
                onClick={() => {
                  void actions.run(task._id, () => update({ taskId: task._id, isAi: false }));
                }}
              >
                <Sparkles size={10} />
                KI
              </button>
            )}
            {task.dueOn && !child && (
              <span className={task.isOverdue ? "overdue" : ""}>
                {task.isOverdue ? "Überfällig · " : "Fällig · "}
                {dayLabel(task.dueOn)}
              </span>
            )}
            {task.plannedFor && !task.dueOn && !child && <span>{dayLabel(task.plannedFor)}</span>}
            {task.snoozedUntil && !child && (
              <span>
                <Clock3 size={10} />
                {new Intl.DateTimeFormat("de-DE", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(task.snoozedUntil)}
              </span>
            )}
          </div>
        </div>
        <div className="task-tools">
          {!child && task.highPriority && (
            <button
              className="icon priority"
              title="Hohe Priorität zurücknehmen"
              disabled={!actions.connected || busy}
              onClick={() => {
                void actions.run(task._id, () => update({ taskId: task._id, highPriority: false }));
              }}
            >
              <Star size={13} fill="currentColor" />
            </button>
          )}
          <button
            className="icon more"
            title="Aufgabendetails"
            aria-label={`${task.title} bearbeiten`}
            onClick={() => actions.edit(task)}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
      <div className="task-secondary-tools">
        {!child && task.kind !== "habit" && (
          <button
            className="disclosure"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            aria-label={`Unteraufgaben von ${task.title} ${expanded ? "schließen" : "öffnen"}`}
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {childrenTasks.length ? `${doneChildren}/${childrenTasks.length}` : "Unteraufgabe"}
          </button>
        )}
        {sortable && (
          <span className="reorder-tools">
            <button
              className="icon"
              disabled={busy || !actions.connected || index < 1}
              onClick={() => actions.reorder(siblings, task, -1)}
              aria-label={`${task.title} nach oben`}
              title="Nach oben · ⌥↑"
            >
              <ArrowUp size={12} />
            </button>
            <button
              className="icon"
              disabled={busy || !actions.connected || index >= group.length - 1}
              onClick={() => actions.reorder(siblings, task, 1)}
              aria-label={`${task.title} nach unten`}
              title="Nach unten · ⌥↓"
            >
              <ArrowDown size={12} />
            </button>
          </span>
        )}
      </div>
      {!child && expanded && (
        <div className="subtask-list">
          <div role="list">
            {childrenTasks.map((entry) => (
              <TaskRow key={entry._id} task={entry} siblings={childrenTasks} />
            ))}
          </div>
          {!done && (
            <form className="subtask-capture" onSubmit={(event) => void createChild(event)}>
              <Plus size={12} />
              <input
                value={childTitle}
                onChange={(event) => setChildTitle(event.target.value)}
                placeholder="Nächster kleiner Schritt …"
                aria-label="Neue Unteraufgabe"
                maxLength={500}
                disabled={!actions.connected || busy}
              />
              <button
                className="icon"
                disabled={!childTitle.trim() || !actions.connected || busy}
                aria-label="Unteraufgabe hinzufügen"
              >
                <ChevronRight size={14} />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
