import { z } from "zod";
export type { Connection, HabitSnapshot } from "./native";

/** Legacy fixed areas. Accepted as an alias for the seeded list with that `legacyArea`. */
export const areaSchema = z.enum(["me", "agency", "work"]);
/** Section inside a normal list: Tasks (`active`) or Backlog. */
export const sectionSchema = z.enum(["active", "backlog"]);
export const listKindSchema = z.enum(["tasks", "habits", "important", "history", "recurrences"]);
/** Colors offered for lists; new lists cycle through them in this order. */
export const listColors = [
  "#ff453a",
  "#ff9f0a",
  "#ffd60a",
  "#30d158",
  "#64d2ff",
  "#0a84ff",
  "#5e5ce6",
  "#bf5af2",
  "#ff375f",
  "#ac8e68",
] as const;
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Ungültiger Kalendertag.");
export const titleSchema = z
  .string()
  .trim()
  .min(1, "Bitte einen Titel eingeben.")
  .max(500, "Der Titel darf höchstens 500 Zeichen haben.");
export const idSchema = z.string().min(1).max(128);
export const listNameSchema = z
  .string()
  .trim()
  .min(1, "Bitte einen Namen eingeben.")
  .max(80, "Der Name darf höchstens 80 Zeichen haben.");
export const listColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Ungültige Farbe.")
  .transform((value) => value.toLowerCase());
/** Empty clears the emoji. */
export const listEmojiSchema = z.string().trim().max(16, "Das Emoji ist zu lang.");
export const createListSchema = z.strictObject({
  name: listNameSchema,
  color: listColorSchema.optional(),
  emoji: listEmojiSchema.optional(),
});
export const updateListSchema = z.strictObject({
  listId: idSchema,
  name: listNameSchema.optional(),
  color: listColorSchema.optional(),
  emoji: listEmojiSchema.nullable().optional(),
  favorite: z.boolean().optional(),
});
/** The deprecated `area` and `list` never combine with the `listId` and `section` replacing them. */
function withoutMixedAliases(value: {
  listId?: string;
  area?: Area;
  section?: Section;
  list?: Section;
}) {
  return !(value.listId && value.area) && !(value.section && value.list);
}
const mixedAliasesMessage =
  "Die veralteten Felder area und list nicht zusammen mit listId oder section senden.";
export const subtaskInputSchema = z.strictObject({
  title: titleSchema,
  isAi: z.boolean().optional(),
});
/**
 * Without `listId` a task lands in the owner's default list. Deprecated: `area` (resolved to
 * the list with that legacy area), `list` (alias for `section`) and `projectName` (ignored).
 */
export const createTaskSchema = z
  .strictObject({
    title: titleSchema,
    listId: idSchema.optional(),
    section: sectionSchema.optional(),
    area: areaSchema.optional(),
    list: sectionSchema.optional(),
    projectName: z.string().trim().max(120).optional(),
    isInbox: z.boolean().optional(),
    isAi: z.boolean().optional(),
    highPriority: z.boolean().optional(),
    plannedFor: dateSchema.optional(),
    dueOn: dateSchema.optional(),
    subtasks: z.array(subtaskInputSchema).max(100).optional(),
  })
  .refine(withoutMixedAliases, mixedAliasesMessage);
/** `projectName` is deprecated and ignored. */
export const updateTaskSchema = z.strictObject({
  title: titleSchema.optional(),
  projectName: z.string().trim().max(120).nullable().optional(),
  isAi: z.boolean().optional(),
  highPriority: z.boolean().optional(),
});
/**
 * Views: `list` (one list, deferred tasks hidden unless due), `important` (Wichtig across all
 * lists) and `all` (everything current). Deprecated aliases: `priority` → important,
 * `area` → list, `habits` → the Habits list; `area` filter → list, `list` filter → section.
 */
export const taskFiltersSchema = z
  .strictObject({
    view: z.enum(["list", "important", "all", "priority", "area", "habits"]).optional(),
    listId: idSchema.optional(),
    section: sectionSchema.optional(),
    area: areaSchema.optional(),
    list: sectionSchema.optional(),
    search: z.string().max(200).optional(),
    isAi: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).optional(),
    cursor: z.string().max(200).optional(),
  })
  .refine(withoutMixedAliases, mixedAliasesMessage);
/** `area` is deprecated and filters like the list with that legacy area. */
export const completionFiltersSchema = z
  .strictObject({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    listId: idSchema.optional(),
    area: areaSchema.optional(),
    limit: z.number().int().min(1).max(500).optional(),
    cursor: z.string().max(8192).optional(),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    "Der Zeitraum ist ungültig.",
  )
  .refine(withoutMixedAliases, mixedAliasesMessage);
export const recurrenceRuleSchema = z.discriminatedUnion("frequency", [
  z.strictObject({ frequency: z.literal("daily") }),
  z.strictObject({ frequency: z.literal("weekly"), weekday: z.number().int().min(1).max(7) }),
  z.strictObject({ frequency: z.literal("monthly"), dayOfMonth: z.number().int().min(1).max(31) }),
]);
/** Habits always land in the Habits list; tasks in `listId` or the default list. */
export const recurrenceInputSchema = z.strictObject({
  title: titleSchema,
  kind: z.enum(["task", "habit"]),
  rule: recurrenceRuleSchema,
  listId: idSchema.optional(),
  isAi: z.boolean().optional(),
  highPriority: z.boolean().optional(),
  startOn: dateSchema.optional(),
});
export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("create"), input: createTaskSchema }),
  z.strictObject({ type: z.literal("update"), taskId: idSchema, input: updateTaskSchema }),
  z
    .strictObject({
      type: z.literal("move"),
      taskId: idSchema,
      listId: idSchema.optional(),
      section: sectionSchema.optional(),
      area: areaSchema.optional(),
      list: sectionSchema.optional(),
    })
    .refine(withoutMixedAliases, mixedAliasesMessage),
  z.strictObject({
    type: z.literal("addSubtask"),
    taskId: idSchema,
    title: titleSchema,
    isAi: z.boolean().optional(),
  }),
  z
    .strictObject({
      type: z.literal("reorder"),
      taskIds: z.array(idSchema).min(1).max(500),
      parentId: idSchema.optional(),
      listId: idSchema.optional(),
      section: sectionSchema.optional(),
      area: areaSchema.optional(),
      list: sectionSchema.optional(),
      kind: z.enum(["task", "habit"]).optional(),
    })
    .refine(withoutMixedAliases, mixedAliasesMessage),
  z.strictObject({
    type: z.literal("complete"),
    taskId: idSchema,
    occurrenceKey: dateSchema.optional(),
  }),
  ...(["reopen", "discard", "clearInbox", "normalizeUrgency", "indent", "outdent"] as const).map(
    (type) => z.strictObject({ type: z.literal(type), taskId: idSchema }),
  ),
  z.strictObject({
    type: z.literal("plan"),
    taskId: idSchema,
    plannedFor: dateSchema.nullable().optional(),
    dueOn: dateSchema.nullable().optional(),
  }),
  z.strictObject({
    type: z.literal("snooze"),
    taskId: idSchema,
    snoozedUntil: z.number().finite().nullable(),
  }),
]);
export type Area = z.infer<typeof areaSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type ListKind = z.infer<typeof listKindSchema>;
export type CreateListInput = z.input<typeof createListSchema>;
export type UpdateListInput = z.input<typeof updateListSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskFilters = z.infer<typeof taskFiltersSchema>;
export type CompletionFilters = z.infer<typeof completionFiltersSchema>;
export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;
export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;
export type Command = z.infer<typeof commandSchema>;

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "NOT_CONFIGURED"
  | "INTERNAL_ERROR";
export interface ApiError {
  error: { code: ErrorCode; message: string };
  requestId: string;
}
