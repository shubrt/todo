import { v } from "convex/values";

/** Legacy fixed areas; only stored on documents written before lists existed. */
export const area = v.union(v.literal("me"), v.literal("agency"), v.literal("work"));
/** Section of a normal list: Tasks (`active`) or Backlog. */
export const section = v.union(v.literal("active"), v.literal("backlog"));
export const kind = v.union(v.literal("task"), v.literal("habit"));
/** `tasks` lists are user lists; the other kinds exist exactly once per owner. */
export const listKind = v.union(
  v.literal("tasks"),
  v.literal("habits"),
  v.literal("important"),
  v.literal("history"),
  v.literal("recurrences"),
);
export const recurrenceRule = v.union(
  v.object({ frequency: v.literal("daily") }),
  v.object({ frequency: v.literal("weekly"), weekday: v.number() }),
  v.object({ frequency: v.literal("monthly"), dayOfMonth: v.number() }),
);
/** Device keys belong to one app login; integration keys are created for tools like task-capture. */
export const apiKeyKind = v.union(v.literal("device"), v.literal("integration"));
