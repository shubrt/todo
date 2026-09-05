import type { FunctionReturnType } from "convex/server";
import type { api } from "@todo/backend/api";
import { dateSchema, type Area } from "@todo/contracts";

export type Task = FunctionReturnType<typeof api.tasks.list>[number];
export type Completion = FunctionReturnType<typeof api.completions.list>["items"][number];
export type Settings = FunctionReturnType<typeof api.settings.get>;
export type Screen = "priority" | "area" | "habits" | "history" | "settings";
export const areas: Area[] = ["me", "agency", "work"];

export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function localDate(timestamp = Date.now(), timeZone = "Europe/Berlin"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatDay(value: string, today?: string): string {
  if (value === today) return "Heute";
  if (today && value === shiftDate(today, 1)) return "Morgen";
  if (today && value === shiftDate(today, -1)) return "Gestern";
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function validateDate(value: string): boolean {
  return !value || dateSchema.safeParse(value).success;
}

export function orderedMove<T extends { _id: string; state: string }>(
  tasks: T[],
  taskId: string,
  offset: -1 | 1,
): string[] | null {
  const index = tasks.findIndex((task) => task._id === taskId);
  const destination = index + offset;
  if (
    index < 0 ||
    destination < 0 ||
    destination >= tasks.length ||
    tasks[index]!.state !== tasks[destination]!.state
  )
    return null;
  const result = [...tasks];
  [result[index], result[destination]] = [result[destination]!, result[index]!];
  return result.map((task) => task._id);
}

export function readableError(error: unknown): string {
  const data = error && typeof error === "object" && "data" in error ? error.data : undefined;
  if (data && typeof data === "object" && "message" in data && typeof data.message === "string")
    return data.message;
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {
      /* Use the safe fallback below. */
    }
  }
  if (error instanceof Error && error.name === "NativeApiError") return error.message;
  return "Das hat gerade nicht geklappt. Prüfe deine Verbindung und versuche es erneut.";
}

export function snapshotIsNewer(
  incoming: { generatedAt: number; localDate: string },
  previous: { generatedAt: number; localDate: string } | null,
): boolean {
  return !previous || incoming.generatedAt >= previous.generatedAt;
}
