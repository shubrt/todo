import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { apiKeyKind, area, kind, recurrenceRule, taskList } from "./validators";

export default defineSchema({
  tasks: defineTable({
    ownerId: v.string(),
    title: v.string(),
    parentId: v.optional(v.id("tasks")),
    kind,
    area: v.optional(area),
    list: v.optional(taskList),
    projectName: v.optional(v.string()),
    position: v.number(),
    isInbox: v.boolean(),
    isAi: v.boolean(),
    highPriority: v.boolean(),
    state: v.union(v.literal("open"), v.literal("done"), v.literal("discarded")),
    plannedFor: v.optional(v.string()),
    dueOn: v.optional(v.string()),
    snoozedUntil: v.optional(v.number()),
    scheduleVersion: v.number(),
    wakeAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    completedLocalDate: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    recurrenceId: v.optional(v.id("recurrences")),
    occurrenceKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_archived", ["ownerId", "archivedAt"])
    .index("by_owner_parent", ["ownerId", "parentId"])
    .index("by_owner_list", ["ownerId", "area", "list"])
    .index("by_wake", ["wakeAt"])
    .index("by_recurrence", ["recurrenceId", "state"]),
  completions: defineTable({
    ownerId: v.string(),
    taskId: v.id("tasks"),
    parentTaskId: v.optional(v.id("tasks")),
    titleSnapshot: v.string(),
    parentTitleSnapshot: v.optional(v.string()),
    areaSnapshot: v.optional(area),
    projectNameSnapshot: v.optional(v.string()),
    completedAt: v.number(),
    completedLocalDate: v.string(),
    timeZoneSnapshot: v.string(),
    kind: v.union(v.literal("task"), v.literal("subtask"), v.literal("habit")),
    occurrenceKey: v.optional(v.string()),
  })
    .index("by_owner_date", ["ownerId", "completedLocalDate"])
    .index("by_owner_time", ["ownerId", "completedAt"])
    .index("by_task", ["taskId"]),
  settings: defineTable({
    ownerId: v.string(),
    defaultArea: area,
    timeZone: v.string(),
    currentLocalDate: v.string(),
    lastProcessedDate: v.optional(v.string()),
    habitsInitialized: v.boolean(),
  }).index("by_owner", ["ownerId"]),
  recurrences: defineTable({
    ownerId: v.string(),
    title: v.string(),
    kind,
    area: v.optional(area),
    projectName: v.optional(v.string()),
    isAi: v.boolean(),
    highPriority: v.boolean(),
    rule: recurrenceRule,
    timeZone: v.string(),
    enabled: v.boolean(),
    nextDate: v.string(),
    nextRunAt: v.number(),
    lastProcessedDate: v.optional(v.string()),
    currentTaskId: v.optional(v.id("tasks")),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_next_run", ["enabled", "nextRunAt"]),
  apiKeys: defineTable({
    ownerId: v.string(),
    name: v.string(),
    prefix: v.string(),
    tokenHash: v.string(),
    // Absent on keys created before kinds existed.
    kind: v.optional(apiKeyKind),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    expiryScheduledAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_owner", ["ownerId"]),
  requestReceipts: defineTable({
    ownerId: v.string(),
    apiKeyId: v.id("apiKeys"),
    key: v.string(),
    payloadHash: v.string(),
    result: v.any(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key", ["apiKeyId", "key"])
    .index("by_expiry", ["expiresAt"]),
});
