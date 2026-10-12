import { api } from "@todo/backend/api";
import type { Id } from "@todo/backend/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
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

/**
 * Optimistic tasks.reorder: in every loaded list that shows all the named tasks, they take
 * each other's places in the new order. The others stay put, and so does done before open.
 */
function showOrder(
  store: OptimisticLocalStore,
  { taskIds }: FunctionArgs<typeof api.tasks.reorder>,
) {
  const reordered = (tasks: Task[]) => {
    const byId = new Map(tasks.map((task) => [task._id, task]));
    const named = taskIds.flatMap((id) => byId.get(id) ?? []);
    if (named.length < taskIds.length) return;
    const ids = new Set<string>(taskIds);
    let next = 0;
    return tasks.map((task) => (ids.has(task._id) ? named[next++]! : task));
  };
  for (const { args, value } of store.getAllQueries(api.tasks.list)) {
    const tasks = value && reordered(value);
    if (tasks) store.setQuery(api.tasks.list, args, tasks);
  }
  for (const { args, value } of store.getAllQueries(api.tasks.deferred)) {
    const tasks = value && reordered(value);
    if (tasks) store.setQuery(api.tasks.deferred, args, tasks);
  }
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

  // Drag only: ⌥↑/⌥↓ stay as they were, without an optimistic update.
  const reorderNow = useMemo(() => reorder.withOptimisticUpdate(showOrder), [reorder]);

  return useMemo(() => {
    const store = useApp.getState;
    /** The tasks.reorder arguments that move the task `steps` places; none at either end. */
    const orderAfter = (taskId: Id<"tasks">, steps: number) => {
      const item = findTask(store().items, taskId);
      if (!item?.sortable) return;
      const { task } = item;
      // Für später mixes both sections, but each section is its own order on the server.
      const group = item.siblings.filter(
        (sibling) => task.parentId !== undefined || sibling.section === task.section,
      );
      const isPeer = (sibling: Task) => sibling.state === task.state;
      const peers = group.filter(isPeer);
      const from = peers.findIndex((sibling) => sibling._id === taskId);
      const to = Math.max(0, Math.min(peers.length - 1, from + steps));
      if (to === from) return;
      const moved = peers.toSpliced(from, 1).toSpliced(to, 0, task);
      let next = 0;
      return {
        taskIds: group.map((sibling) => (isPeer(sibling) ? moved[next++]! : sibling)._id),
        ...(task.parentId
          ? { parentId: task.parentId }
          : { ...(task.listId ? { listId: task.listId } : {}), section: task.section }),
      };
    };
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
       * Moves the task `steps` places among its peers of the same state (open or done) and
       * saves the whole group order; in Habits that order also becomes the order of the coming
       * days. ⌥↑/⌥↓ move one place and wait for the server.
       */
      reorder: (taskId: Id<"tasks">, steps: number) => {
        const order = orderAfter(taskId, steps);
        return order && write(taskId, () => reorder(order));
      },
      /** The same for a dragged row's drop, shown at once so the row stays where it landed. */
      drop: (taskId: Id<"tasks">, steps: number) => {
        const order = orderAfter(taskId, steps);
        return order && write(taskId, () => reorderNow(order));
      },
    };
  }, [
    write,
    complete,
    reopen,
    update,
    move,
    reorder,
    reorderNow,
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
