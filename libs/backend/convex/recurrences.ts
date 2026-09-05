import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwner } from "./auth";
import { createRecurrence, fail, materializeRecurrence } from "./domain";
import { area, kind, recurrenceRule } from "./validators";
import { localDate } from "./time";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    return ctx.db
      .query("recurrences")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
  },
});
export const create = mutation({
  args: {
    title: v.string(),
    kind,
    rule: recurrenceRule,
    area: v.optional(area),
    projectName: v.optional(v.string()),
    isAi: v.optional(v.boolean()),
    highPriority: v.optional(v.boolean()),
    startOn: v.optional(v.string()),
  },
  handler: async (ctx, args) => createRecurrence(ctx, await requireOwner(ctx), args),
});
export const update = mutation({
  args: {
    recurrenceId: v.id("recurrences"),
    title: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, { recurrenceId, ...input }) => {
    const ownerId = await requireOwner(ctx);
    const recurrence = await ctx.db.get(recurrenceId);
    if (!recurrence || recurrence.ownerId !== ownerId)
      fail("NOT_FOUND", "Wiederholung nicht gefunden.");
    if (input.title !== undefined && (!input.title.trim() || input.title.trim().length > 500))
      fail("INVALID_INPUT", "Bitte einen kurzen Titel eingeben.");
    await ctx.db.patch(recurrenceId, {
      ...input,
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    });
    if (recurrence.currentTaskId) {
      const current = await ctx.db.get(recurrence.currentTaskId);
      if (current && current.state === "open") {
        if (input.enabled === false && recurrence.kind === "habit")
          await ctx.db.patch(current._id, { archivedAt: Date.now(), updatedAt: Date.now() });
        else if (
          input.enabled === true &&
          recurrence.kind === "habit" &&
          current.occurrenceKey === localDate(Date.now(), recurrence.timeZone)
        )
          await ctx.db.patch(current._id, {
            archivedAt: undefined,
            updatedAt: Date.now(),
            ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          });
        else if (input.title !== undefined)
          await ctx.db.patch(current._id, { title: input.title.trim(), updatedAt: Date.now() });
      }
    }
    if (input.enabled) await materializeRecurrence(ctx, (await ctx.db.get(recurrenceId))!);
    return recurrenceId;
  },
});
