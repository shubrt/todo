import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwner } from "./auth";
import {
  createRecurrence,
  ensureOwner,
  executeCommand,
  fail,
  habitHistory,
  isCurrent,
  materializeRecurrence,
} from "./domain";
import { kind, recurrenceRule } from "./validators";
import { localDate } from "./time";

/** All recurrences of the owner by `position` (habit order), then creation. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const recurrences = await ctx.db
      .query("recurrences")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    return recurrences.sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt - b.createdAt,
    );
  },
});
/** Habits (daily only) land on top of the Habits list; tasks in `listId` or the default list. */
export const create = mutation({
  args: {
    title: v.string(),
    kind,
    rule: recurrenceRule,
    listId: v.optional(v.id("lists")),
    isAi: v.optional(v.boolean()),
    highPriority: v.optional(v.boolean()),
    startOn: v.optional(v.string()),
  },
  handler: async (ctx, args) => createRecurrence(ctx, await requireOwner(ctx), args),
});
/**
 * Renames (the current instance too) and pauses or resumes. Pausing a habit hides today's
 * open instance, resuming the same day brings it back at the habit's manual place.
 */
export const update = mutation({
  args: {
    recurrenceId: v.id("recurrences"),
    title: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, { recurrenceId, ...input }) => {
    const ownerId = await requireOwner(ctx);
    await ensureOwner(ctx, ownerId);
    const recurrence = await ctx.db.get(recurrenceId);
    if (!recurrence || recurrence.ownerId !== ownerId)
      fail("NOT_FOUND", "Wiederholung nicht gefunden.");
    const title = input.title?.trim();
    if (title !== undefined && (!title || title.length > 500))
      fail("INVALID_INPUT", "Bitte einen kurzen Titel eingeben.");
    await ctx.db.patch(recurrenceId, {
      ...input,
      ...(title !== undefined ? { title } : {}),
    });
    const current = recurrence.currentTaskId ? await ctx.db.get(recurrence.currentTaskId) : null;
    const now = Date.now();
    if (current?.state === "open" && recurrence.kind === "habit" && input.enabled === false)
      await ctx.db.patch(current._id, { archivedAt: now, updatedAt: now });
    else if (
      current?.state === "open" &&
      recurrence.kind === "habit" &&
      input.enabled === true &&
      current.occurrenceKey === localDate(now, recurrence.timeZone)
    )
      await ctx.db.patch(current._id, {
        archivedAt: undefined,
        // Reorders while paused moved the habit's place; an instance hidden before the list
        // migration has no list yet.
        listId: recurrence.listId,
        section: "active",
        position: recurrence.position ?? current.position,
        updatedAt: now,
        ...(title !== undefined ? { title } : {}),
      });
    else if (current && isCurrent(current) && title !== undefined)
      await ctx.db.patch(current._id, { title, updatedAt: now });
    if (input.enabled) await materializeRecurrence(ctx, (await ctx.db.get(recurrenceId))!);
    return recurrenceId;
  },
});
/**
 * Deletes a recurrence (paused or not) so it no longer holds its list. Its open instances are
 * discarded without a completion; completions and an instance already done today stay.
 */
export const remove = mutation({
  args: { recurrenceId: v.id("recurrences") },
  handler: async (ctx, { recurrenceId }) => {
    const ownerId = await requireOwner(ctx);
    await ensureOwner(ctx, ownerId);
    const recurrence = await ctx.db.get(recurrenceId);
    if (!recurrence || recurrence.ownerId !== ownerId)
      fail("NOT_FOUND", "Wiederholung nicht gefunden.");
    const open = await ctx.db
      .query("tasks")
      .withIndex("by_recurrence", (q) => q.eq("recurrenceId", recurrenceId).eq("state", "open"))
      .collect();
    for (const task of open.filter(isCurrent))
      await executeCommand(ctx, ownerId, { type: "discard", taskId: task._id });
    await ctx.db.delete(recurrenceId);
    return null;
  },
});
/**
 * Habit dots: per habit recurrence id, one boolean per previous local day (today excluded),
 * oldest first; true when the habit was completed that day.
 */
export const history = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days = 6 }) => {
    const ownerId = await requireOwner(ctx);
    if (!Number.isInteger(days) || days < 1 || days > 31)
      fail("INVALID_INPUT", "Bitte zwischen 1 und 31 Tagen wählen.");
    return habitHistory(ctx, ownerId, days);
  },
});
