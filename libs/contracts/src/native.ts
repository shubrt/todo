export interface Connection {
  siteUrl: string;
  apiKey: string;
}

/**
 * Today's main habits as served by GET /api/v1/habits/snapshot. Dates are `YYYY-MM-DD` in
 * `timeZone`, times are Unix milliseconds; every habit's `occurrenceKey` equals `localDate`.
 */
export interface HabitSnapshot {
  generatedAt: number;
  localDate: string;
  timeZone: string;
  nextResetAt: number;
  habits: { id: string; title: string; completed: boolean; occurrenceKey: string }[];
  completedCount: number;
  totalCount: number;
}
