import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOwner } from "./auth";
import { executeCommand, getTask, listTasks } from "./domain";
import { section } from "./validators";

/** Views: `list` (needs listId, else the default list), `important` (Wichtig), `all`. */
export const list = query({
  args: {
    view: v.optional(
      v.union(
        v.literal("list"),
        v.literal("important"),
        v.literal("all"),
        // Deprecated aliases: priority → important, area → list, habits → the Habits list.
        v.literal("priority"),
        v.literal("area"),
        v.literal("habits"),
      ),
    ),
    listId: v.optional(v.id("lists")),
    section: v.optional(section),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => listTasks(ctx, await requireOwner(ctx), args),
});
export const get = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => getTask(ctx, await requireOwner(ctx), args.taskId),
});
/** "Für später": deferred roots of the list that are not due yet, with their subtasks. */
export const deferred = query({
  args: { listId: v.id("lists") },
  handler: async (ctx, args) => {
    const tasks = await listTasks(ctx, await requireOwner(ctx), { view: "all", ...args });
    return tasks.filter((task) => task.isDeferred && !task.isDue && task.kind === "task");
  },
});

/** Without listId the task lands in the default list. Habits are created as recurrences. */
export const create = mutation({
  args: {
    title: v.string(),
    listId: v.optional(v.id("lists")),
    section: v.optional(section),
    isInbox: v.optional(v.boolean()),
    isAi: v.optional(v.boolean()),
    highPriority: v.optional(v.boolean()),
    plannedFor: v.optional(v.string()),
    dueOn: v.optional(v.string()),
    subtasks: v.optional(v.array(v.object({ title: v.string(), isAi: v.optional(v.boolean()) }))),
  },
  handler: async (ctx, input) =>
    (await executeCommand(ctx, await requireOwner(ctx), { type: "create", input })) as Id<"tasks">,
});
/** Renaming a habit or recurring instance also renames its recurrence. */
export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    isAi: v.optional(v.boolean()),
    highPriority: v.optional(v.boolean()),
  },
  handler: async (ctx, { taskId, ...input }) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "update", taskId, input }),
});
/** Moves a root (its subtasks follow) to the top of its block in another list and/or section. */
export const move = mutation({
  args: { taskId: v.id("tasks"), listId: v.optional(v.id("lists")), section: v.optional(section) },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "move", ...args }),
});
/**
 * Named tasks first, the rest of their group keeps its order. In the Habits list the order
 * among open and among done habits is also stored on the recurrences for the coming days.
 */
export const reorder = mutation({
  args: {
    taskIds: v.array(v.id("tasks")),
    parentId: v.optional(v.id("tasks")),
    listId: v.optional(v.id("lists")),
    section: v.optional(section),
  },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "reorder", ...args }),
});
export const addSubtask = mutation({
  args: { taskId: v.id("tasks"), title: v.string(), isAi: v.optional(v.boolean()) },
  handler: async (ctx, args) =>
    (await executeCommand(ctx, await requireOwner(ctx), {
      type: "addSubtask",
      ...args,
    })) as Id<"tasks">,
});
export const complete = mutation({
  args: { taskId: v.id("tasks"), occurrenceKey: v.optional(v.string()) },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "complete", ...args }),
});
/** Same local day only; deletes the completion. A no-op on open tasks. */
export const reopen = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "reopen", ...args }),
});
export const discard = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "discard", ...args }),
});
/**
 * The app selected the task: clears its inbox dot and the alarm clock of an ended snooze. A
 * no-op when both are already cleared.
 */
export const markSeen = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "markSeen", ...args }),
});
export const normalizeUrgency = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "normalizeUrgency", ...args }),
});
export const plan = mutation({
  args: {
    taskId: v.id("tasks"),
    plannedFor: v.optional(v.union(v.string(), v.null())),
    dueOn: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "plan", ...args }),
});
export const snooze = mutation({
  args: { taskId: v.id("tasks"), snoozedUntil: v.union(v.number(), v.null()) },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "snooze", ...args }),
});
/** Makes the root the last subtask of the nearest open root above it. */
export const indent = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "indent", ...args }),
});
/** Makes the subtask a root directly after its former parent. */
export const outdent = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "outdent", ...args }),
});
