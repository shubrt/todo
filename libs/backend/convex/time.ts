import type { RecurrenceRule } from "@todo/contracts";

const formatters = new Map<string, Intl.DateTimeFormat>();
export function validateTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function localDate(timestamp: number, timeZone: string): string {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(timestamp);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Locate the actual local date boundary, including 23/25-hour DST days. */
export function startOfDate(date: string, timeZone: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`);
  let low = guess - 36 * 3_600_000;
  let high = guess + 36 * 3_600_000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localDate(middle, timeZone) < date) low = middle;
    else high = middle;
  }
  return high;
}

function monthlyDate(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay), 12)).toISOString().slice(0, 10);
}

/** Monthly dates such as the 31st clamp to the month's final calendar day. */
export function occurrenceOnOrAfter(date: string, rule: RecurrenceRule): string {
  if (rule.frequency === "daily") return date;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (rule.frequency === "weekly") {
    const weekday = parsed.getUTCDay() || 7;
    return addDays(date, (rule.weekday - weekday + 7) % 7);
  }
  const thisMonth = monthlyDate(parsed.getUTCFullYear(), parsed.getUTCMonth(), rule.dayOfMonth);
  return thisMonth >= date
    ? thisMonth
    : monthlyDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, rule.dayOfMonth);
}

export function latestOccurrence(date: string, rule: RecurrenceRule): string {
  if (rule.frequency === "daily") return date;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (rule.frequency === "weekly") {
    const weekday = parsed.getUTCDay() || 7;
    return addDays(date, -((weekday - rule.weekday + 7) % 7));
  }
  const thisMonth = monthlyDate(parsed.getUTCFullYear(), parsed.getUTCMonth(), rule.dayOfMonth);
  return thisMonth <= date
    ? thisMonth
    : monthlyDate(parsed.getUTCFullYear(), parsed.getUTCMonth() - 1, rule.dayOfMonth);
}
