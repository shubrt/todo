import { api } from "@todo/backend/api";
import type { Id } from "@todo/backend/dataModel";
import { useMutation } from "convex/react";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useWrite, type List, type Task } from "./data";
import { findTask, useApp, type TaskItem } from "./store";

/**
 * Which actions apply to a task row. The ⌘K panel shows only these and shortcuts ignore the
 * others: subtasks get no Wichtig, scheduling, moving or backlog; habits only KI-free basics.
 * Rows that show only part of their list (Wichtig, `sortable` false) cannot be reordered or
 * nested, since the server's neighbor may not be on screen; indent needs a root without subtasks.
 * New subtasks need an open root (the task itself, or the parent of a subtask).
 */
export function abilities({ task, subtasks, parent, sortable }: TaskItem) {
  const root = !task.parentId;
  const habit = task.kind === "habit";
  const plain = root && !habit;
  const open = task.state === "open";
  return {
    important: plain,
    ai: !habit,
    schedule: plain && open,
    move: plain,
    section: plain,
    normalize: plain && open && task.isOverdue,
    subtask: !habit && (parent ?? task).state === "open",
    indent: plain && open && !task.recurrenceId && !subtasks && sortable,
    outdent: !root && sortable,
    reorder: sortable,
  };
}

/** Where a new row lands: a list (a habit in Habits, else Tasks of that list) or a parent. */
export type CreateTarget = { list: List } | { parentId: Id<"tasks"> };

function useActionsValue() {
  const write = useWrite();
  const complete = useMutation(api.tasks.complete);
  const reopen = useMutation(api.tasks.reopen);
  const update = useMutation(api.tasks.update);
  const move = useMutation(api.tasks.move);
  const reorder = useMutation(api.tasks.reorder);
  const discard = useMutation(api.tasks.discard);
  const clearInbox = useMutation(api.tasks.clearInbox);
  const normalizeUrgency = useMutation(api.tasks.normalizeUrgency);
  const plan = useMutation(api.tasks.plan);
  const snooze = useMutation(api.tasks.snooze);
  const indent = useMutation(api.tasks.indent);
  const outdent = useMutation(api.tasks.outdent);
  const addSubtask = useMutation(api.tasks.addSubtask);
  const create = useMutation(api.tasks.create);
  const createRecurrence = useMutation(api.recurrences.create);

  return useMemo(() => {
    const store = useApp.getState;
    return {
      /** Completes an open task; reopens a task completed today. */
      toggleDone: (task: Task) =>
        write(task._id, () =>
          task.state === "done"
            ? reopen({ taskId: task._id })
            : complete({
                taskId: task._id,
                ...(task.occurrenceKey ? { occurrenceKey: task.occurrenceKey } : {}),
              }),
        ),
      /** Selects the row and turns its title into a text field. */
      rename: (id: string) => {
        store().select(id);
        store().edit({ type: "rename", id });
      },
      saveTitle: async (task: Task, title: string) =>
        (await write(task._id, () => update({ taskId: task._id, title }))).ok,
      /** Opens the new-row editor: in the open list, or as the last subtask of `parentId`. */
      startCreate: (parentId?: Id<"tasks">) => {
        if (parentId) store().setExpanded(parentId, true);
        store().edit(parentId ? { type: "create", parentId } : { type: "create" });
      },
      /** Creates the task (habit in Habits, subtask under a parent) and selects it. */
      create: async (target: CreateTarget, title: string) => {
        // A new habit's instance id is not known here, so only tasks get selected.
        if ("list" in target && target.list.kind === "habits")
          return (
            await write("create", () =>
              createRecurrence({ title, kind: "habit", rule: { frequency: "daily" } }),
            )
          ).ok;
        const result = await write("create", () =>
          "parentId" in target
            ? addSubtask({ taskId: target.parentId, title })
            : create({ title, listId: target.list._id, section: "active", isInbox: false }),
        );
        if (result.ok) store().select(result.value);
        return result.ok;
      },
      toggleImportant: (task: Task) =>
        write(task._id, () => update({ taskId: task._id, highPriority: !task.highPriority })),
      toggleAi: (task: Task) =>
        write(task._id, () => update({ taskId: task._id, isAi: !task.isAi })),
      /** Tasks ↔ Backlog. */
      toggleSection: (task: Task) =>
        write(task._id, () =>
          move({ taskId: task._id, section: task.section === "backlog" ? "active" : "backlog" }),
        ),
      /** Into Tasks of another list. */
      moveTo: (task: Task, listId: Id<"lists">) =>
        write(task._id, () => move({ taskId: task._id, listId, section: "active" })),
      normalize: (task: Task) => write(task._id, () => normalizeUrgency({ taskId: task._id })),
      discard: (task: Task) => write(task._id, () => discard({ taskId: task._id })),
      /** `null` clears the date. */
      plan: (task: Task, plannedFor: string | null) =>
        write(task._id, () => plan({ taskId: task._id, plannedFor })),
      due: (task: Task, dueOn: string | null) =>
        write(task._id, () => plan({ taskId: task._id, dueOn })),
      snooze: (task: Task, snoozedUntil: number | null) =>
        write(task._id, () => snooze({ taskId: task._id, snoozedUntil })),
      /** Silent and keyed apart, so it never blocks or toasts over a ⌘↵ on the same row. */
      clearInbox: (taskId: Id<"tasks">) =>
        write(`inbox:${taskId}`, () => clearInbox({ taskId }), { silent: true }),
      /** Makes the task the last subtask of the open root above it, which gets expanded. */
      indent: (task: Task) => {
        const item = findTask(store().items, task._id);
        const index = item?.siblings.findIndex((sibling) => sibling._id === task._id) ?? -1;
        const parent = item?.siblings
          .slice(0, Math.max(0, index))
          .findLast((sibling) => sibling.state === "open");
        if (parent) store().setExpanded(parent._id, true);
        return write(task._id, () => indent({ taskId: task._id }));
      },
      outdent: (task: Task) => write(task._id, () => outdent({ taskId: task._id })),
      /**
       * Swaps the task with its neighbor of the same state (open or done) and saves the whole
       * group order; in Habits that order also becomes the order of the coming days.
       */
      reorder: (taskId: Id<"tasks">, direction: 1 | -1) => {
        const item = findTask(store().items, taskId);
        if (!item?.sortable) return;
        const { task } = item;
        // Für später mixes both sections, but each section is its own order on the server.
        const group = item.siblings.filter(
          (sibling) => task.parentId !== undefined || sibling.section === task.section,
        );
        const peers = group.filter((sibling) => sibling.state === task.state);
        const neighbor = peers[peers.findIndex((sibling) => sibling._id === taskId) + direction];
        if (!neighbor) return;
        const taskIds = group.map((sibling) =>
          sibling._id === taskId
            ? neighbor._id
            : sibling._id === neighbor._id
              ? taskId
              : sibling._id,
        );
        return write(taskId, () =>
          reorder({
            taskIds,
            ...(task.parentId
              ? { parentId: task.parentId }
              : { ...(task.listId ? { listId: task.listId } : {}), section: task.section }),
          }),
        );
      },
    };
  }, [
    write,
    complete,
    reopen,
    update,
    move,
    reorder,
    discard,
    clearInbox,
    normalizeUrgency,
    plan,
    snooze,
    indent,
    outdent,
    addSubtask,
    create,
    createRecurrence,
  ]);
}

export type TaskActions = ReturnType<typeof useActionsValue>;
const TaskActionsContext = createContext<TaskActions | null>(null);

/** Provides useTaskActions; lives inside the Session (needs useWrite and Convex). */
export function TaskActionsProvider({ children }: { children: ReactNode }) {
  return (
    <TaskActionsContext.Provider value={useActionsValue()}>{children}</TaskActionsContext.Provider>
  );
}

/** Task writes shared by rows, the keymap and the panels. */
export function useTaskActions() {
  const actions = useContext(TaskActionsContext);
  if (!actions) throw new Error("Aufgabenaktionen fehlen.");
  return actions;
}
