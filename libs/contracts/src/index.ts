import { z } from "zod";
export { habitSnapshotSchema, habitSnapshotItemSchema } from "./native";
export type { Connection, HabitSnapshot, HabitSnapshotItem } from "./native";

export const areaSchema = z.enum(["me", "agency", "work"]);
export const listSchema = z.enum(["active", "backlog"]);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Ungültiger Kalendertag.");
export const titleSchema = z.string().trim().min(1).max(500);
export const idSchema = z.string().min(1).max(128);
export const subtaskInputSchema = z.strictObject({
  title: titleSchema,
  isAi: z.boolean().optional(),
});
export const createTaskSchema = z.strictObject({
  title: titleSchema,
  area: areaSchema.optional(),
  list: listSchema.optional(),
  projectName: z.string().trim().max(120).optional(),
  isInbox: z.boolean().optional(),
  isAi: z.boolean().optional(),
  highPriority: z.boolean().optional(),
  plannedFor: dateSchema.optional(),
  dueOn: dateSchema.optional(),
  subtasks: z.array(subtaskInputSchema).max(100).optional(),
});
export const updateTaskSchema = z.strictObject({
  title: titleSchema.optional(),
  projectName: z.string().trim().max(120).nullable().optional(),
  isAi: z.boolean().optional(),
  highPriority: z.boolean().optional(),
});
export const taskFiltersSchema = z.strictObject({
  view: z.enum(["priority", "area", "habits", "all"]).optional(),
  area: areaSchema.optional(),
  list: listSchema.optional(),
  search: z.string().max(200).optional(),
  isAi: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  cursor: z.string().max(200).optional(),
});
export const completionFiltersSchema = z
  .strictObject({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    area: areaSchema.optional(),
    limit: z.number().int().min(1).max(500).optional(),
    cursor: z.string().max(8192).optional(),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    "Der Zeitraum ist ungültig.",
  );
export const recurrenceRuleSchema = z.discriminatedUnion("frequency", [
  z.strictObject({ frequency: z.literal("daily") }),
  z.strictObject({ frequency: z.literal("weekly"), weekday: z.number().int().min(1).max(7) }),
  z.strictObject({ frequency: z.literal("monthly"), dayOfMonth: z.number().int().min(1).max(31) }),
]);
export const recurrenceInputSchema = z.strictObject({
  title: titleSchema,
  kind: z.enum(["task", "habit"]),
  rule: recurrenceRuleSchema,
  area: areaSchema.optional(),
  projectName: z.string().trim().max(120).optional(),
  isAi: z.boolean().optional(),
  highPriority: z.boolean().optional(),
  startOn: dateSchema.optional(),
});
export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("create"), input: createTaskSchema }),
  z.strictObject({ type: z.literal("update"), taskId: idSchema, input: updateTaskSchema }),
  z.strictObject({
    type: z.literal("move"),
    taskId: idSchema,
    area: areaSchema.optional(),
    list: listSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("addSubtask"),
    taskId: idSchema,
    title: titleSchema,
    isAi: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("reorder"),
    taskIds: z.array(idSchema).min(1).max(500),
    parentId: idSchema.optional(),
    area: areaSchema.optional(),
    list: listSchema.optional(),
    kind: z.enum(["task", "habit"]).optional(),
  }),
  z.strictObject({
    type: z.literal("complete"),
    taskId: idSchema,
    occurrenceKey: dateSchema.optional(),
  }),
  ...(["discard", "clearInbox", "normalizeUrgency"] as const).map((type) =>
    z.strictObject({ type: z.literal(type), taskId: idSchema }),
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
export type TaskList = z.infer<typeof listSchema>;
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
  | "INTERNAL_ERROR";
export interface ApiError {
  error: { code: ErrorCode; message: string };
  requestId: string;
}
