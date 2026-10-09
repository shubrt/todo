import type { Id } from "@todo/backend/dataModel";
import { Calendar, Check, ChevronDown, ChevronRight, Clock, Flag, Repeat } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { Day, Task } from "./data";
import { dayLabel, snoozeLabel } from "./dates";
import { comboOf } from "./keymap";
import { sameEdit, useApp, type Selectable } from "./store";
import { useTaskActions, type CreateTarget } from "./task-actions";
import { cx } from "./ui";

/** Publishes the open view's selectable rows (in display order) for the keymap. */
export function useSelectables(items: Selectable[]) {
  const setItems = useApp((state) => state.setItems);
  useEffect(() => setItems(items), [items, setItems]);
  useEffect(() => () => setItems([]), [setItems]);
}

/** Whether the row with `id` is selected; the returned ref scrolls it into view when it is. */
export function useSelectedRow<T extends HTMLElement = HTMLDivElement>(id: string) {
  const selected = useApp((state) => state.selection === id);
  const ref = useRef<T>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
  return { selected, ref };
}

/** Roots and their subtasks from a decorated, display-ordered task list. */
export function groupTasks(tasks: Task[]) {
  const roots: Task[] = [];
  const subtasks = new Map<Id<"tasks">, Task[]>();
  for (const task of tasks) {
    if (!task.parentId) roots.push(task);
    else subtasks.set(task.parentId, [...(subtasks.get(task.parentId) ?? []), task]);
  }
  return { roots, subtasks };
}

/** Selectables for roots and the subtasks of expanded roots, matching TaskTree's rows. */
export function taskSelectables(
  roots: Task[],
  subtasksOf: Map<Id<"tasks">, Task[]>,
  expanded: Record<string, boolean>,
  sortable = true,
): Selectable[] {
  return roots.flatMap((root) => {
    const subtasks = subtasksOf.get(root._id) ?? [];
    const own: Selectable = {
      type: "task",
      id: root._id,
      task: root,
      siblings: roots,
      subtasks: subtasks.length,
      sortable,
    };
    if (!expanded[root._id]) return [own];
    return [
      own,
      ...subtasks.map(
        (task): Selectable => ({
          type: "task",
          id: task._id,
          task,
          siblings: subtasks,
          subtasks: 0,
          parent: root,
          sortable,
        }),
      ),
    ];
  });
}

/**
 * Section header: optional list mark, label (truncated) and count. With `onToggle` it is
 * collapsible (chevron, click toggles, a button with aria-expanded for assistive tech); with
 * `id` it can be selected.
 */
export function SectionHeader({
  id = "",
  label,
  count,
  mark,
  open,
  onToggle,
}: {
  id?: string;
  label: ReactNode;
  count?: ReactNode;
  mark?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  const { selected, ref } = useSelectedRow(id);
  return (
    <div
      ref={ref}
      className={cx("sec", selected && "sel")}
      role={onToggle ? "button" : undefined}
      aria-expanded={onToggle ? Boolean(open) : undefined}
      aria-current={selected || undefined}
      onClick={() => {
        if (id) useApp.getState().select(id);
        onToggle?.();
      }}
    >
      {mark}
      <span className="lbl">{label}</span>
      {count !== undefined && <span className="n">{count}</span>}
      {onToggle && (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
    </div>
  );
}

/**
 * Roots in order, each followed by its subtasks while expanded, plus the new-subtask editor.
 * `color` is the list color of the rows; `weekOf` adds habit dots.
 */
export function TaskTree({
  roots,
  subtasks: subtasksOf,
  color,
  day,
  weekOf,
}: {
  roots: Task[];
  subtasks: Map<Id<"tasks">, Task[]>;
  color: string;
  day: Day;
  weekOf?: (task: Task) => boolean[] | undefined;
}) {
  const expanded = useApp((state) => state.expanded);
  const creatingUnder = useApp((state) =>
    state.editing?.type === "create" ? state.editing.parentId : undefined,
  );
  return roots.map((root) => {
    const subtasks = subtasksOf.get(root._id) ?? [];
    const creating = creatingUnder === root._id;
    const done = subtasks.filter((task) => task.state === "done").length;
    return (
      <Fragment key={root._id}>
        <TaskRow
          task={root}
          color={color}
          day={day}
          subtasks={subtasks.length ? { done, total: subtasks.length } : undefined}
          week={weekOf?.(root)}
        />
        {((expanded[root._id] && subtasks.length > 0) || creating) && (
          <div className="subs">
            {expanded[root._id] &&
              subtasks.map((task) => (
                <TaskRow key={task._id} task={task} color={color} day={day} />
              ))}
            {creating && <EditRow color={color} target={{ parentId: root._id }} />}
          </div>
        )}
      </Fragment>
    );
  });
}

/**
 * A double click on the row itself starts a rename; one inside the title field (selecting a
 * word) or on the checkbox and other buttons is theirs.
 */
export function startsRename(event: MouseEvent, editing: boolean) {
  return !editing && !(event.target instanceof Element && event.target.closest("input, button"));
}

/**
 * One task: checkbox in the list color, title, details in fixed order (⚡️, subtasks, ↻, due,
 * planned, snooze, ‼️) and optional habit dots. Click selects, double click renames, right
 * click opens ⌘K. Done rows show no details.
 */
export function TaskRow({
  task,
  color,
  day,
  subtasks,
  week,
}: {
  task: Task;
  color: string;
  day: Day;
  subtasks?: { done: number; total: number };
  week?: boolean[];
}) {
  const { selected, ref } = useSelectedRow(task._id);
  const editing = useApp(
    (state) => state.editing?.type === "rename" && state.editing.id === task._id,
  );
  const expanded = useApp((state) => Boolean(state.expanded[task._id]));
  const actions = useTaskActions();
  const done = task.state === "done";
  const select = () => useApp.getState().select(task._id);
  return (
    <div
      ref={ref}
      className={cx("row", done && "done", selected && "sel", editing && "edit")}
      style={{ "--acc": color }}
      role="option"
      aria-selected={selected}
      onMouseDown={(event) => {
        if (event.button === 0) select();
      }}
      onDoubleClick={(event) => {
        if (startsRename(event, editing)) actions.rename(task._id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        select();
        useApp.getState().openPanel({ type: "actions", taskId: task._id });
      }}
    >
      {task.isInbox && !selected && <i className="inb" />}
      <button
        className="cb"
        role="checkbox"
        aria-checked={done}
        aria-label={`${task.title} ${done ? "wieder öffnen" : "erledigen"}`}
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void actions.toggleDone(task)}
      >
        {done && <Check size={10} />}
      </button>
      <div className="b">
        <div className="l1">
          {editing ? (
            <TitleInput
              initial={task.title}
              onSave={(title) => actions.saveTitle(task, title)}
              onComplete={() => void actions.toggleDone(task)}
            />
          ) : (
            <span className="t">{task.title}</span>
          )}
        </div>
      </div>
      <Details task={task} day={day} subtasks={subtasks} expanded={expanded} week={week} />
    </div>
  );
}

function Details({
  task,
  day,
  subtasks,
  expanded,
  week,
}: {
  task: Task;
  day: Day;
  subtasks?: { done: number; total: number };
  expanded: boolean;
  week?: boolean[];
}) {
  const open = task.state !== "done";
  const tone =
    task.dueOn && (task.dueOn < day.today ? "late" : task.dueOn === day.today && "today");
  const snoozed =
    task.snoozedUntil && task.snoozedUntil > Date.now() ? task.snoozedUntil : undefined;
  const parts = open && [
    task.isAi && (
      <span key="ai" className="a">
        <span className="emo-s">⚡️</span>
      </span>
    ),
    subtasks && (
      <button
        key="subtasks"
        className="a"
        tabIndex={-1}
        aria-label={`Unteraufgaben ${expanded ? "zuklappen" : "aufklappen"}`}
        aria-expanded={expanded}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => useApp.getState().setExpanded(task._id, !expanded)}
      >
        {subtasks.done}/{subtasks.total}
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
    ),
    task.recurrenceId && task.kind === "task" && (
      <span key="repeat" className="a">
        <Repeat size={12} />
      </span>
    ),
    task.dueOn && (
      <span key="due" className={cx("a", tone)}>
        <Flag size={12} />
        {dayLabel(task.dueOn, day.today)}
      </span>
    ),
    task.plannedFor && (
      <span key="planned" className="a">
        <Calendar size={12} />
        {dayLabel(task.plannedFor, day.today)}
      </span>
    ),
    snoozed && (
      <span key="snoozed" className="a">
        <Clock size={12} />
        {snoozeLabel(snoozed, day.today, day.timeZone)}
      </span>
    ),
    task.highPriority && (
      <span key="important" className="a">
        <span className="emo-s">‼️</span>
      </span>
    ),
  ];
  const shown = parts ? parts.filter(Boolean) : [];
  if (!shown.length && !week) return null;
  return (
    <span className="acc">
      {shown}
      {week && <HabitDots week={week} />}
    </span>
  );
}

/** One dot per previous day, oldest first, filled in the list color when done that day. */
export function HabitDots({ week }: { week: boolean[] }) {
  const count = week.filter(Boolean).length;
  return (
    <span className="a">
      <span className="wk" role="img" aria-label={`${count} von ${week.length} Tagen`}>
        {week.map((done, index) => (
          <i key={index} className={done ? "on" : undefined} />
        ))}
      </span>
    </span>
  );
}

/**
 * The new-row editor (⌘N, ⇧⌘N): an empty checkbox and a title field. ↵ creates the task,
 * habit or subtask (see TaskActions.create), esc discards.
 */
export function EditRow({
  color,
  target,
  placeholder = "Neue Aufgabe",
}: {
  color: string;
  target: CreateTarget;
  placeholder?: string;
}) {
  const actions = useTaskActions();
  return (
    <div className="row sel edit" style={{ "--acc": color }} role="option" aria-selected>
      <i className="cb" />
      <div className="b">
        <div className="l1">
          <TitleInput
            initial=""
            placeholder={placeholder}
            onSave={(title) => actions.create(target, title)}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Inline title field of the current edit (store.editing). ↵ saves through `onSave` and ends
 * the edit when it succeeds (a failed save keeps the draft), esc ends it without saving, an
 * empty or unchanged title just ends it. ⌘↵ saves, then calls `onComplete`. Leaving the field
 * inside the window saves too; switching apps keeps the edit open.
 */
export function TitleInput({
  initial,
  placeholder,
  onSave,
  onComplete,
}: {
  initial: string;
  placeholder?: string;
  onSave: (title: string) => Promise<boolean>;
  onComplete?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [session] = useState(() => useApp.getState().editing);
  const busy = useRef(false);
  // Compared by value: starting the same edit again (a double click) keeps this field in charge.
  const finish = () => {
    const state = useApp.getState();
    if (sameEdit(state.editing, session)) state.edit(null);
  };
  async function save(then?: () => void) {
    if (busy.current) return;
    const title = value.trim();
    if (title && title !== initial) {
      busy.current = true;
      const saved = await onSave(title);
      busy.current = false;
      if (!saved) return;
    }
    finish();
    then?.();
  }
  return (
    <input
      className="ti"
      autoFocus
      value={value}
      placeholder={placeholder}
      aria-label={placeholder ?? "Titel"}
      maxLength={500}
      spellCheck={false}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (document.hasFocus()) void save();
      }}
      onKeyDown={(event) => {
        const combo = comboOf(event);
        if (combo === "enter" || combo === "mod+enter") {
          event.preventDefault();
          void save(combo === "mod+enter" ? onComplete : undefined);
        } else if (combo === "escape") {
          event.preventDefault();
          finish();
        } else if (combo === "tab" || combo === "shift+tab") event.preventDefault();
      }}
    />
  );
}

/** "Nichts offen. ⌘N legt eine Aufgabe an." under an empty Tasks section. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
