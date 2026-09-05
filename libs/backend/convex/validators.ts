import { v } from "convex/values";

export const area = v.union(v.literal("me"), v.literal("agency"), v.literal("work"));
export const taskList = v.union(v.literal("active"), v.literal("backlog"));
export const kind = v.union(v.literal("task"), v.literal("habit"));
export const recurrenceRule = v.union(
  v.object({ frequency: v.literal("daily") }),
  v.object({ frequency: v.literal("weekly"), weekday: v.number() }),
  v.object({ frequency: v.literal("monthly"), dayOfMonth: v.number() }),
);
