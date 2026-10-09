// Pure date helpers. Calendar days are "YYYY-MM-DD" strings in the account time zone; the
// arithmetic runs on UTC noon so DST never shifts a day.

const weekdays = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
const months = [
  "Jan.",
  "Feb.",
  "März",
  "Apr.",
  "Mai",
  "Juni",
  "Juli",
  "Aug.",
  "Sept.",
  "Okt.",
  "Nov.",
  "Dez.",
];
const dayMs = 86_400_000;

const toTime = (date: string) => Date.parse(`${date}T12:00:00Z`);
const pad = (value: number) => String(value).padStart(2, "0");
/** 0 = Sunday … 6 = Saturday. */
const weekdayOf = (date: string) => new Date(toTime(date)).getUTCDay();

export function addDays(date: string, days: number) {
  return new Date(toTime(date) + days * dayMs).toISOString().slice(0, 10);
}

/** The same day `count` months later, clamped to the end of shorter months (31.1. → 28.2.). */
export function addMonths(date: string, count: number) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year!, month! - 1 + count, 1, 12));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day!, last));
  return target.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` lies before `from`. */
export function daysBetween(from: string, to: string) {
  return Math.round((toTime(to) - toTime(from)) / dayMs);
}

/** "Mo.", "Di.", … */
export function weekdayLabel(date: string) {
  return weekdays[weekdayOf(date)]!;
}

/** "16. Okt.", with the year when it differs from `today`'s. */
export function shortDate(date: string, today: string) {
  const [year, month, day] = date.split("-").map(Number);
  const suffix = date.slice(0, 4) === today.slice(0, 4) ? "" : ` ${year}`;
  return `${day}. ${months[month! - 1]}${suffix}`;
}

/** "Do., 8. Okt.": the full day in panels and Verlauf headings. */
export function weekdayDate(date: string, today: string) {
  return `${weekdayLabel(date)}, ${shortDate(date, today)}`;
}

/**
 * Relative day for task rows: heute, morgen, gestern, the weekday within six days either
 * way, otherwise "16. Okt.".
 */
export function dayLabel(date: string, today: string) {
  const offset = daysBetween(today, date);
  if (offset === 0) return "heute";
  if (offset === 1) return "morgen";
  if (offset === -1) return "gestern";
  if (Math.abs(offset) <= 6) return weekdayLabel(date);
  return shortDate(date, today);
}

/** Distance hint in the date panel: "heute", "morgen", "in 4 Tagen", "vor 3 Tagen". */
export function relativeDays(date: string, today: string) {
  const offset = daysBetween(today, date);
  if (offset === 0) return "heute";
  if (offset === 1) return "morgen";
  if (offset === -1) return "gestern";
  return offset > 0 ? `in ${offset} Tagen` : `vor ${-offset} Tagen`;
}

/** The calendar day of a timestamp in `timeZone`. */
export function localDate(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}

/** "9:00" in `timeZone`. */
export function timeLabel(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("de-DE", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    timestamp,
  );
}

/** "09:12" in `timeZone`: completion times in Verlauf. */
export function clockLabel(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

/** Snooze end for task rows: "Di., 9:00", "morgen, 9:00". */
export function snoozeLabel(timestamp: number, today: string, timeZone: string) {
  return `${dayLabel(localDate(timestamp, timeZone), today)}, ${timeLabel(timestamp, timeZone)}`;
}

/** A wall-clock time in the account time zone. */
export type TimeOfDay = { hour: number; minute: number };

/** "9:00", "14:30". */
export const formatTime = ({ hour, minute }: TimeOfDay) => `${hour}:${pad(minute)}`;

/** How far the wall clock of `timeZone` is ahead of UTC at `timestamp`, in ms. */
function zoneOffset(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(timestamp);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const wall = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wall - Math.floor(timestamp / 1000) * 1000;
}

/** The timestamp of `time` on `date` in `timeZone`, e.g. a snooze end. */
export function zonedTime(date: string, time: TimeOfDay, timeZone: string) {
  const wall = Date.parse(`${date}T${pad(time.hour)}:${pad(time.minute)}:00Z`);
  // The offset at the first guess can differ from the offset at the result across DST.
  const guess = wall - zoneOffset(wall, timeZone);
  return wall - zoneOffset(guess, timeZone);
}

/** The fixed date panel suggestions with their day relative to `today`. */
export function dateSuggestions(today: string) {
  const weekday = weekdayOf(today);
  return [
    { id: "today", label: "Heute", date: today },
    { id: "tomorrow", label: "Morgen", date: addDays(today, 1) },
    // The coming Saturday; on a Saturday that is today.
    { id: "weekend", label: "Am Wochenende", date: addDays(today, (6 - weekday + 7) % 7) },
    // Next week's Monday; on a Monday that is in seven days.
    { id: "next-week", label: "Nächste Woche", date: addDays(today, (8 - weekday) % 7 || 7) },
    { id: "two-weeks", label: "In zwei Wochen", date: addDays(today, 14) },
  ];
}

/** Default snooze time: 18:00 on the same day, else 9:00 in the morning. */
export function snoozeTime(date: string, today: string): TimeOfDay {
  return date === today ? { hour: 18, minute: 0 } : { hour: 9, minute: 0 };
}

/**
 * What the date panel understood. `date` is missing when only a time was typed ("14"),
 * `time` when only a day was typed.
 */
export type DateInput = { date?: string; time?: TimeOfDay };

/** A snooze end: its day and wall-clock time in the account time zone, and the timestamp. */
export type SnoozeEnd = { date: string; time: TimeOfDay; at: number };

/**
 * The snooze end for date panel input: the typed day (default today) at the typed time
 * (default snoozeTime). A bare time that already passed today means tomorrow.
 */
export function snoozeEnd(
  input: DateInput,
  today: string,
  now: number,
  timeZone: string,
): SnoozeEnd {
  const end = (date: string) => {
    const time = input.time ?? snoozeTime(date, today);
    return { date, time, at: zonedTime(date, time, timeZone) };
  };
  const typed = end(input.date ?? today);
  return input.date || typed.at > now ? typed : end(addDays(today, 1));
}

/** Lowercase, single spaces, umlauts folded, so "Nächste  Woche" and "nachste woche" match. */
const fold = (text: string) =>
  text
    .toLocaleLowerCase("de-DE")
    .replaceAll("ä", "a")
    .replaceAll("ö", "o")
    .replaceAll("ü", "u")
    .replaceAll("ß", "ss")
    .replace(/\s+/g, " ")
    .trim();

// Folded, Sunday first like Date.getUTCDay.
const weekdayNames = [
  "sonntag",
  "montag",
  "dienstag",
  "mittwoch",
  "donnerstag",
  "freitag",
  "samstag",
];
const numberWords: Record<string, number> = {
  ein: 1,
  eine: 1,
  einem: 1,
  einen: 1,
  einer: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  funf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwolf: 12,
};

/** "YYYY-MM-DD" if the day exists, e.g. not 31.2. */
function calendarDate(year: number, month: number, day: number) {
  const date = `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
  const check = new Date(toTime(date));
  return check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? date : undefined;
}

/** The day part of the input, see parseDateInput. */
function parseDay(text: string, today: string): string | undefined {
  if (text === "heute") return today;
  if (text === "morgen") return addDays(today, 1);
  if (text === "ubermorgen") return addDays(today, 2);
  const weekday = weekdayOf(today);
  if (/^(?:am )?wochenende$/.test(text)) return addDays(today, (6 - weekday + 7) % 7);
  if (/^nachste[nr]? woche$/.test(text)) return addDays(today, (8 - weekday) % 7 || 7);
  if (/^nachste[nr]? monat$/.test(text)) return `${addMonths(today, 1).slice(0, 8)}01`;

  const relative = /^in (\d{1,3}|[a-z]+) (tag|tage|tagen|woche|wochen|monat|monate|monaten)$/.exec(
    text,
  );
  if (relative) {
    const count = numberWords[relative[1]!] ?? Number(relative[1]);
    if (!Number.isInteger(count) || count < 1) return undefined;
    const unit = relative[2]!;
    if (unit.startsWith("monat")) return addMonths(today, count);
    return addDays(today, unit.startsWith("woche") ? count * 7 : count);
  }

  // "mo", "fr.", "freitag", "am fr", "nächsten montag": the next such day after today.
  const named = /^(?:am |nachste[nmr]? )?([a-z]{2,})\.?$/.exec(text)?.[1];
  if (named) {
    const target = weekdayNames.findIndex((name) => name.startsWith(named));
    if (target >= 0) return addDays(today, (target - weekday + 7) % 7 || 7);
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // "15.10.", "15.10", "15.10.26", "15.10.2026". Without a year: the next such day.
  const numeric = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4})?)?$/.exec(text);
  if (numeric) {
    const [day, month] = [Number(numeric[1]), Number(numeric[2])];
    if (numeric[3]) {
      const year = Number(numeric[3]);
      return calendarDate(year < 100 ? 2000 + year : year, month, day);
    }
    const year = Number(today.slice(0, 4));
    const date = calendarDate(year, month, day);
    // 29.2. in a common year: try the next years up to the next leap year.
    if (!date || date < today) {
      for (let next = year + 1; next <= year + 4; next++) {
        const later = calendarDate(next, month, day);
        if (later) return later;
      }
      return undefined;
    }
    return date;
  }
  return undefined;
}

/**
 * Parses German date input relative to `today`, in the account's calendar:
 * - days: "heute", "morgen", "übermorgen", "15.10.", "15.10.2026", "2026-10-15",
 *   "mo" … "so" or full weekday names (the next such day after today), "in 3 tagen",
 *   "in 2 wochen", "in einem monat", "nächste woche" (next Monday), "nächsten monat" (the 1st),
 *   "wochenende" (the coming Saturday);
 * - an optional time after the day, or alone: "14", "9:30", "14 uhr", "um 9".
 * Returns undefined for anything else, including impossible days like "31.2.".
 */
export function parseDateInput(input: string, today: string): DateInput | undefined {
  const text = fold(input);
  if (!text) return undefined;
  // A time stands alone or after a space, so the "10" of "15.10" stays part of the day.
  const timed = /(?:^|\s)(?:um\s)?(\d{1,2})(?::(\d{2}))?(?:\s?uhr)?$/.exec(text);
  if (timed) {
    const time = { hour: Number(timed[1]), minute: Number(timed[2] ?? 0) };
    const rest = text.slice(0, timed.index).trim();
    const date = rest ? parseDay(rest, today) : undefined;
    if (time.hour <= 23 && time.minute <= 59 && (!rest || date))
      return date ? { date, time } : { time };
  }
  const date = parseDay(text, today);
  return date ? { date } : undefined;
}
