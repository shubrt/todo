import { ConvexError, v } from "convex/values";
import {
  commandSchema,
  completionFiltersSchema,
  taskFiltersSchema,
  type HabitSnapshot,
} from "@todo/contracts";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  executeCommand,
  fail,
  getTask,
  listCompletions,
  listTasks,
  ownedList,
  ownerLists,
  processOwnerDay,
  readSettings,
} from "./domain";
import { requireApiKeyByHash, touchApiKey } from "./auth";
import { addDays, localDate, startOfDate } from "./time";

/** GET reads. The HTTP layer runs `lists.ensureOwnerInternal` first, so lists exist here. */
export const read = internalQuery({
  args: {
    tokenHash: v.string(),
    resource: v.union(
      v.literal("lists"),
      v.literal("tasks"),
      v.literal("task"),
      v.literal("completions"),
    ),
    taskId: v.optional(v.string()),
    filters: v.any(),
  },
  handler: async (ctx, args) => {
    const key = await requireApiKeyByHash(ctx, args.tokenHash);
    if (args.resource === "lists")
      return (await ownerLists(ctx, key.ownerId)).map((list) => ({
        id: list._id,
        name: list.name,
        emoji: list.emoji ?? null,
        color: list.color,
        kind: list.kind,
        favorite: list.favorite,
      }));
    if (args.resource === "task") return getTask(ctx, key.ownerId, args.taskId ?? "");
    if (args.resource === "completions") {
      const parsed = completionFiltersSchema.safeParse(args.filters);
      if (!parsed.success)
        throw new ConvexError({ code: "INVALID_INPUT", message: "Ungültige Verlaufsfilter." });
      // Deleted lists stay filterable, so only an id that cannot be a list is refused. A
      // foreign id reads as empty like a deleted one and does not reveal that it exists.
      if (parsed.data.listId && !ctx.db.normalizeId("lists", parsed.data.listId))
        fail("NOT_FOUND", "Liste nicht gefunden.");
      return listCompletions(ctx, key.ownerId, parsed.data);
    }
    const parsed = taskFiltersSchema.safeParse(args.filters);
    if (!parsed.success)
      throw new ConvexError({ code: "INVALID_INPUT", message: "Ungültige Aufgabenfilter." });
    // A stale or mistyped list would otherwise read as an empty list.
    const list = parsed.data.listId
      ? await ownedList(ctx, key.ownerId, parsed.data.listId)
      : parsed.data.area
        ? ((await ownerLists(ctx, key.ownerId)).find(
            (item) => item.legacyArea === parsed.data.area,
          ) ?? fail("NOT_FOUND", "Liste nicht gefunden."))
        : undefined;
    if (list && list.kind !== "tasks" && list.kind !== "habits")
      fail(
        "INVALID_INPUT",
        "Diese Liste hat keine eigenen Aufgaben. Wichtig liest view=important.",
      );
    const filters = { view: "all" as const, ...parsed.data };
    const tasks = await listTasks(ctx, key.ownerId, filters);
    const roots = tasks.filter((task) => !task.parentId);
    const start = filters.cursor ? roots.findIndex((task) => task._id === filters.cursor) + 1 : 0;
    if (filters.cursor && start === 0)
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Der Cursor ist ungültig. Bitte die erste Seite erneut abrufen.",
      });
    const limit = filters.limit ?? 100;
    const items = roots
      .slice(start, start + limit)
      .map((task) => ({ ...task, subtasks: tasks.filter((child) => child.parentId === task._id) }));
    return { items, nextCursor: start + limit < roots.length ? items.at(-1)!._id : null };
  },
});

/**
 * Today's instances in the Habits list. Brings scheduled day transitions (and the list
 * migration) up to date first.
 */
export const habitSnapshot = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }): Promise<HabitSnapshot> => {
    const key = await requireApiKeyByHash(ctx, tokenHash);
    await touchApiKey(ctx, key);
    await processOwnerDay(ctx, key.ownerId);
    const settings = await readSettings(ctx, key.ownerId);
    const generatedAt = Date.now();
    const timeZone = settings?.timeZone ?? "Europe/Berlin";
    const today = localDate(generatedAt, timeZone);
    const habits = (await listTasks(ctx, key.ownerId, { view: "habits" }))
      .filter((task) => !task.parentId && task.occurrenceKey === today)
      .map((task) => ({
        id: task._id,
        title: task.title,
        completed: task.state === "done",
        occurrenceKey: today,
      }));
    return {
      generatedAt,
      localDate: today,
      timeZone,
      nextResetAt: startOfDate(addDays(today, 1), timeZone),
      habits,
      completedCount: habits.filter((habit) => habit.completed).length,
      totalCount: habits.length,
    };
  },
});

/** Authentication, receipt lookup, domain write and receipt commit are one transaction. */
export const write = internalMutation({
  args: {
    tokenHash: v.string(),
    idempotencyKey: v.string(),
    payloadHash: v.string(),
    command: v.any(),
  },
  handler: async (ctx, args) => {
    const key = await requireApiKeyByHash(ctx, args.tokenHash);
    const parsed = commandSchema.safeParse(args.command);
    if (!parsed.success)
      throw new ConvexError({ code: "INVALID_INPUT", message: "Ungültiger Aufgabenbefehl." });
    if (!/^[\x21-\x7e]{1,128}$/.test(args.idempotencyKey))
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Idempotency-Key muss 1 bis 128 druckbare Zeichen enthalten.",
      });
    const receipt = await ctx.db
      .query("requestReceipts")
      .withIndex("by_key", (q) => q.eq("apiKeyId", key._id).eq("key", args.idempotencyKey))
      .unique();
    if (receipt && receipt.expiresAt > Date.now()) {
      if (receipt.payloadHash !== args.payloadHash)
        throw new ConvexError({
          code: "CONFLICT",
          message: "Dieser Idempotency-Key wurde bereits für eine andere Anfrage verwendet.",
        });
      return receipt.result;
    }
    if (receipt) await ctx.db.delete(receipt._id);
    const id = await executeCommand(ctx, key.ownerId, parsed.data);
    const result = { id: id ?? null };
    await ctx.db.insert("requestReceipts", {
      ownerId: key.ownerId,
      apiKeyId: key._id,
      key: args.idempotencyKey,
      payloadHash: args.payloadHash,
      result: result ?? null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    await touchApiKey(ctx, key);
    return result ?? null;
  },
});

export const cleanupReceipts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("requestReceipts")
      .withIndex("by_expiry", (q) => q.lte("expiresAt", Date.now()))
      .take(500);
    for (const receipt of expired) await ctx.db.delete(receipt._id);
    return expired.length;
  },
});
