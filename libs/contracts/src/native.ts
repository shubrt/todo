import { z } from "zod";

export interface Connection {
  siteUrl: string;
  apiKey: string;
}

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

export const habitSnapshotItemSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  title: z.string().min(1).max(500),
  completed: z.boolean(),
  occurrenceKey: calendarDate,
});

export const habitSnapshotSchema = z
  .object({
    generatedAt: z.number().finite(),
    localDate: calendarDate,
    timeZone: z.string().min(1).max(100),
    nextResetAt: z.number().finite(),
    habits: z.array(habitSnapshotItemSchema),
    completedCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
  })
  .refine(
    (snapshot) =>
      snapshot.nextResetAt > snapshot.generatedAt &&
      snapshot.totalCount === snapshot.habits.length &&
      snapshot.completedCount === snapshot.habits.filter((habit) => habit.completed).length &&
      snapshot.habits.every((habit) => habit.occurrenceKey === snapshot.localDate) &&
      new Set(snapshot.habits.map((habit) => habit.id)).size === snapshot.habits.length,
  );

export type HabitSnapshotItem = z.infer<typeof habitSnapshotItemSchema>;
export type HabitSnapshot = z.infer<typeof habitSnapshotSchema>;
