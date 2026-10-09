import { v } from "convex/values";
import { createListSchema, listColors, updateListSchema } from "@todo/contracts";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireApiKeyByHash, requireOwner } from "./auth";
import {
  allTasks,
  ensureOwner,
  fail,
  isCurrent,
  listOverview,
  ownedList,
  ownerLists,
  parse,
} from "./domain";

/** All lists in sidebar order, each with `openCount`. Empty until the owner is bootstrapped. */
export const list = query({
  args: {},
  handler: async (ctx) => listOverview(ctx, await requireOwner(ctx)),
});

/** Seeds the default lists and migrates legacy data; the desktop calls it after sign-in. */
export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureOwner(ctx, await requireOwner(ctx));
    return null;
  },
});

/** The same for the HTTP API, which runs it before reads (queries cannot write). */
export const ensureOwnerInternal = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const key = await requireApiKeyByHash(ctx, tokenHash);
    await ensureOwner(ctx, key.ownerId);
    return null;
  },
});

/** A new normal list, appended and not a favorite. Without color it takes the next palette color. */
export const create = mutation({
  args: { name: v.string(), color: v.optional(v.string()), emoji: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const input = parse(createListSchema, args);
    await ensureOwner(ctx, ownerId);
    const lists = await ownerLists(ctx, ownerId);
    const created = lists.filter((list) => list.kind === "tasks" && !list.legacyArea).length;
    return ctx.db.insert("lists", {
      ownerId,
      name: input.name,
      color: input.color ?? listColors[created % listColors.length] ?? listColors[0],
      ...(input.emoji ? { emoji: input.emoji } : {}),
      kind: "tasks",
      favorite: false,
      position: Math.max(0, ...lists.map((list) => list.position)) + 1,
      createdAt: Date.now(),
    });
  },
});

/** Special lists and Habits only accept `favorite`. An empty or null emoji clears it. */
export const update = mutation({
  args: {
    listId: v.id("lists"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    emoji: v.optional(v.union(v.string(), v.null())),
    favorite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const { listId, emoji, ...patch } = parse(updateListSchema, args);
    await ensureOwner(ctx, ownerId);
    const list = await ownedList(ctx, ownerId, listId);
    if (
      list.kind !== "tasks" &&
      (patch.name !== undefined || patch.color !== undefined || emoji !== undefined)
    )
      fail("INVALID_INPUT", "Diese Liste lässt sich nur als Favorit markieren.");
    await ctx.db.patch(list._id, {
      ...patch,
      ...(emoji !== undefined ? { emoji: emoji || undefined } : {}),
    });
    return null;
  },
});

/** Named lists take positions 0..n in that order; the others follow in their current order. */
export const reorder = mutation({
  args: { listIds: v.array(v.id("lists")) },
  handler: async (ctx, { listIds }) => {
    const ownerId = await requireOwner(ctx);
    await ensureOwner(ctx, ownerId);
    if (new Set(listIds).size !== listIds.length)
      fail("INVALID_INPUT", "Eine Liste darf nur einmal in der Reihenfolge stehen.");
    const selected = await Promise.all(listIds.map((id) => ownedList(ctx, ownerId, id)));
    const rest = (await ownerLists(ctx, ownerId)).filter((list) => !listIds.includes(list._id));
    for (const [position, list] of [...selected, ...rest].entries())
      if (list.position !== position) await ctx.db.patch(list._id, { position });
    return null;
  },
});

/**
 * Deletes a normal list that is not the default list and that no current task or recurrence
 * (paused ones included) uses; `recurrences.remove` frees a list from its recurrences.
 * History keeps its list snapshot.
 */
export const remove = mutation({
  args: { listId: v.id("lists") },
  handler: async (ctx, { listId }) => {
    const ownerId = await requireOwner(ctx);
    const settings = await ensureOwner(ctx, ownerId);
    const list = await ownedList(ctx, ownerId, listId);
    if (list.kind !== "tasks") fail("INVALID_INPUT", "Diese Liste lässt sich nicht löschen.");
    if (list._id === settings.defaultListId)
      fail("CONFLICT", "Die Standardliste lässt sich nicht löschen.");
    if ((await allTasks(ctx, ownerId)).some((task) => isCurrent(task) && task.listId === list._id))
      fail("CONFLICT", "Die Liste ist nicht leer.");
    const recurrence = (
      await ctx.db
        .query("recurrences")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    ).find((item) => item.listId === list._id);
    if (recurrence)
      fail("CONFLICT", `Die Wiederholung „${recurrence.title}“ gehört noch zu dieser Liste.`);
    await ctx.db.delete(list._id);
    return null;
  },
});
