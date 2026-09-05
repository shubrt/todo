import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOwner } from "./auth";
import { executeCommand, getTask, listTasks, projectNames } from "./domain";
import { area, kind, taskList } from "./validators";

export const list = query({
  args: {
    view: v.optional(
      v.union(v.literal("priority"), v.literal("area"), v.literal("habits"), v.literal("all")),
    ),
    area: v.optional(area),
    list: v.optional(taskList),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => listTasks(ctx, await requireOwner(ctx), args),
});
export const get = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => getTask(ctx, await requireOwner(ctx), args.taskId),
});
export const deferred = query({
  args: { area: v.optional(area) },
  handler: async (ctx, args) => {
    const tasks = await listTasks(ctx, await requireOwner(ctx), { view: "all", ...args });
    return tasks.filter((task) => task.isDeferred && !task.isDue && task.kind === "task");
  },
});
export const projects = query({
  args: {},
  handler: async (ctx) => projectNames(ctx, await requireOwner(ctx)),
});
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const tasks = (await listTasks(ctx, ownerId, { view: "all" })).filter(
      (task) => !task.parentId && task.state === "open",
    );
    const countArea = (value: "me" | "agency" | "work") =>
      tasks.filter(
        (task) => task.area === value && task.list === "active" && (!task.isDeferred || task.isDue),
      ).length;
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    const todayCompleted = settings
      ? (
          await ctx.db
            .query("completions")
            .withIndex("by_owner_date", (q) =>
              q.eq("ownerId", ownerId).eq("completedLocalDate", settings.currentLocalDate),
            )
            .collect()
        ).length
      : 0;
    return {
      priority: tasks.filter(
        (task) =>
          task.kind === "task" &&
          (task.highPriority || task.isDue) &&
          (!task.isDeferred || task.isDue),
      ).length,
      me: countArea("me"),
      agency: countArea("agency"),
      work: countArea("work"),
      habits: tasks.filter((task) => task.kind === "habit").length,
      todayCompleted,
    };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    area: v.optional(area),
    list: v.optional(taskList),
    projectName: v.optional(v.string()),
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
export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    projectName: v.optional(v.union(v.string(), v.null())),
    isAi: v.optional(v.boolean()),
    highPriority: v.optional(v.boolean()),
  },
  handler: async (ctx, { taskId, ...input }) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "update", taskId, input }),
});
export const move = mutation({
  args: { taskId: v.id("tasks"), area: v.optional(area), list: v.optional(taskList) },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "move", ...args }),
});
export const reorder = mutation({
  args: {
    taskIds: v.array(v.id("tasks")),
    parentId: v.optional(v.id("tasks")),
    area: v.optional(area),
    list: v.optional(taskList),
    kind: v.optional(kind),
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
export const discard = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "discard", ...args }),
});
export const clearInbox = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) =>
    executeCommand(ctx, await requireOwner(ctx), { type: "clearInbox", ...args }),
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
