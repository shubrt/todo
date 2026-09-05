import { ConvexError, v } from "convex/values";
import { commandSchema, completionFiltersSchema, taskFiltersSchema } from "@todo/contracts";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { executeCommand, getTask, listCompletions, listTasks } from "./domain";

async function requireKey(ctx: QueryCtx | MutationCtx, tokenHash: string) {
  const key = await ctx.db
    .query("apiKeys")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (
    !key ||
    !process.env.TODO_OWNER_ID ||
    key.ownerId !== process.env.TODO_OWNER_ID ||
    key.revokedAt !== undefined ||
    (key.expiresAt !== undefined && key.expiresAt <= Date.now())
  ) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Der API-Schlüssel ist ungültig oder wurde widerrufen.",
    });
  }
  return key;
}

export const read = internalQuery({
  args: {
    tokenHash: v.string(),
    resource: v.union(v.literal("tasks"), v.literal("task"), v.literal("completions")),
    taskId: v.optional(v.string()),
    filters: v.any(),
  },
  handler: async (ctx, args) => {
    const key = await requireKey(ctx, args.tokenHash);
    if (args.resource === "task") return getTask(ctx, key.ownerId, args.taskId ?? "");
    if (args.resource === "completions") {
      const parsed = completionFiltersSchema.safeParse(args.filters);
      if (!parsed.success)
        throw new ConvexError({ code: "INVALID_INPUT", message: "Ungültige Verlaufsfilter." });
      return listCompletions(ctx, key.ownerId, parsed.data);
    }
    const parsed = taskFiltersSchema.safeParse(args.filters);
    if (!parsed.success)
      throw new ConvexError({ code: "INVALID_INPUT", message: "Ungültige Aufgabenfilter." });
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

/** Authentication, receipt lookup, domain write and receipt commit are one transaction. */
export const write = internalMutation({
  args: {
    tokenHash: v.string(),
    idempotencyKey: v.string(),
    payloadHash: v.string(),
    command: v.any(),
  },
  handler: async (ctx, args) => {
    const key = await requireKey(ctx, args.tokenHash);
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
    await ctx.db.patch(key._id, { lastUsedAt: Date.now() });
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
