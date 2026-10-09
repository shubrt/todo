import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwner } from "./auth";
import {
  applySchedule,
  defaultTimeZone,
  ensureOwner,
  fail,
  ownedList,
  processOwnerDay,
  readSettings,
} from "./domain";
import { localDate, startOfDate, validateTimeZone } from "./time";

/** `defaultListId` is undefined until the owner is bootstrapped. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const settings = await readSettings(ctx, await requireOwner(ctx));
    return {
      defaultListId: settings?.defaultListId,
      timeZone: settings?.timeZone ?? defaultTimeZone,
      currentLocalDate: settings?.currentLocalDate ?? localDate(Date.now(), defaultTimeZone),
    };
  },
});

export const update = mutation({
  args: { defaultListId: v.optional(v.id("lists")), timeZone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    if (args.timeZone !== undefined && !validateTimeZone(args.timeZone))
      fail("INVALID_INPUT", "Bitte eine gültige IANA-Zeitzone wählen.");
    const settings = await ensureOwner(ctx, ownerId);
    if (
      args.defaultListId !== undefined &&
      (await ownedList(ctx, ownerId, args.defaultListId)).kind !== "tasks"
    )
      fail("INVALID_INPUT", "Nur normale Listen können Standardliste sein.");
    await ctx.db.patch(settings._id, {
      ...args,
      ...(args.timeZone ? { currentLocalDate: localDate(Date.now(), args.timeZone) } : {}),
    });
    if (args.timeZone && args.timeZone !== settings.timeZone) {
      const recurrences = await ctx.db
        .query("recurrences")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect();
      for (const recurrence of recurrences)
        await ctx.db.patch(recurrence._id, {
          timeZone: args.timeZone,
          nextRunAt: startOfDate(recurrence.nextDate, args.timeZone),
        });
      // Recompute pending calendar wake-ups in the new timezone without altering completion snapshots.
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect();
      for (const task of tasks)
        if (
          task.state === "open" &&
          task.archivedAt === undefined &&
          (task.plannedFor || task.dueOn || task.snoozedUntil)
        )
          await applySchedule(ctx, task);
    }
    await processOwnerDay(ctx, ownerId);
    return null;
  },
});
