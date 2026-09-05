import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwner } from "./auth";
import {
  applySchedule,
  createRecurrence,
  ensureSettings,
  fail,
  processOwnerDay,
  readSettings,
} from "./domain";
import { localDate, startOfDate, validateTimeZone } from "./time";
import { area } from "./validators";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const settings = await readSettings(ctx, ownerId);
    return (
      settings ?? {
        ownerId,
        defaultArea: "me" as const,
        timeZone: "Europe/Berlin",
        currentLocalDate: localDate(Date.now(), "Europe/Berlin"),
        habitsInitialized: false,
      }
    );
  },
});

export const update = mutation({
  args: { defaultArea: v.optional(area), timeZone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    if (args.timeZone !== undefined && !validateTimeZone(args.timeZone))
      fail("INVALID_INPUT", "Bitte eine gültige IANA-Zeitzone wählen.");
    const settings = await ensureSettings(ctx, ownerId);
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

export const initializeHabits = mutation({
  args: { titles: v.array(v.string()) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const settings = await ensureSettings(ctx, ownerId);
    if (settings.habitsInitialized)
      fail("CONFLICT", "Die täglichen Habits wurden bereits eingerichtet.");
    if (args.titles.length !== 5) fail("INVALID_INPUT", "Bitte die ersten fünf Habits benennen.");
    for (const title of args.titles)
      await createRecurrence(ctx, ownerId, { title, kind: "habit", rule: { frequency: "daily" } });
    await ctx.db.patch(settings._id, { habitsInitialized: true });
    return null;
  },
});
