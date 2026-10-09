import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { apiKeyKind, area, kind, listKind, recurrenceRule, section } from "./validators";

// Fields marked legacy are kept optional so existing documents stay valid. They are never
// written again; domain.ensureOwner migrates each owner to lists lazily.
export default defineSchema({
  lists: defineTable({
    ownerId: v.string(),
    name: v.string(),
    color: v.string(),
    emoji: v.optional(v.string()),
    kind: listKind,
    favorite: v.boolean(),
    position: v.number(),
    // The fixed area this seeded list replaces; resolves the deprecated `area` API field.
    legacyArea: v.optional(area),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  tasks: defineTable({
    ownerId: v.string(),
    title: v.string(),
    parentId: v.optional(v.id("tasks")),
    kind,
    // Only roots carry list and section; subtasks inherit them from their root.
    listId: v.optional(v.id("lists")),
    section: v.optional(section),
    area: v.optional(area), // legacy
    list: v.optional(section), // legacy name of `section`
    projectName: v.optional(v.string()), // legacy
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
    .index("by_wake", ["wakeAt"])
    .index("by_recurrence", ["recurrenceId", "state"]),
  completions: defineTable({
    ownerId: v.string(),
    taskId: v.id("tasks"),
    parentTaskId: v.optional(v.id("tasks")),
    titleSnapshot: v.string(),
    parentTitleSnapshot: v.optional(v.string()),
    listId: v.optional(v.id("lists")),
    listNameSnapshot: v.optional(v.string()),
    listEmojiSnapshot: v.optional(v.string()),
    // Set for habit and recurring instances; feeds the habit history dots.
    recurrenceId: v.optional(v.id("recurrences")),
    areaSnapshot: v.optional(area), // legacy
    projectNameSnapshot: v.optional(v.string()), // legacy
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
    defaultListId: v.optional(v.id("lists")),
    timeZone: v.string(),
    currentLocalDate: v.string(),
    lastProcessedDate: v.optional(v.string()),
    // Set once the owner's data has been migrated to lists.
    listsMigratedAt: v.optional(v.number()),
    defaultArea: v.optional(area), // legacy
    habitsInitialized: v.optional(v.boolean()), // legacy
  }).index("by_owner", ["ownerId"]),
  recurrences: defineTable({
    ownerId: v.string(),
    title: v.string(),
    kind,
    listId: v.optional(v.id("lists")),
    // Manual order of habits; each day's instance starts at this position.
    position: v.optional(v.number()),
    area: v.optional(area), // legacy
    projectName: v.optional(v.string()), // legacy
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
