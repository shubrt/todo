import { describe, expect, it } from "vite-plus/test";
import {
  addDays,
  addMonths,
  clockLabel,
  dateSuggestions,
  dayLabel,
  daysBetween,
  formatTime,
  localDate,
  parseDateInput,
  relativeDays,
  shortDate,
  snoozeEnd,
  snoozeLabel,
  timeLabel,
  weekdayDate,
  weekdayLabel,
  zonedTime,
} from "../src/dates";

// A Thursday, like the approved mocks.
const today = "2026-10-08";
const berlin = "Europe/Berlin";

describe("Kalendertage", () => {
  it("rechnet Tage und Monate ohne Zeitzonensprünge", () => {
    expect(addDays(today, 1)).toBe("2026-10-09");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-29", -1)).toBe("2026-03-28");
    expect(daysBetween(today, "2026-10-12")).toBe(4);
    expect(daysBetween(today, "2026-10-01")).toBe(-7);
    expect(addMonths(today, 1)).toBe("2026-11-08");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 2)).toBe("2027-02-15");
  });
});

describe("Datumstexte", () => {
  it("schreibt Wochentag und kurzes Datum", () => {
    expect(weekdayLabel(today)).toBe("Do.");
    expect(weekdayLabel("2026-10-11")).toBe("So.");
    expect(shortDate("2026-10-16", today)).toBe("16. Okt.");
    expect(shortDate("2026-03-01", today)).toBe("1. März");
    expect(shortDate("2027-01-05", today)).toBe("5. Jan. 2027");
    expect(weekdayDate(today, today)).toBe("Do., 8. Okt.");
    expect(weekdayDate("2026-10-22", today)).toBe("Do., 22. Okt.");
  });

  it("zeigt Tage relativ: heute, morgen, gestern, Wochentag, sonst Datum", () => {
    expect(dayLabel(today, today)).toBe("heute");
    expect(dayLabel("2026-10-09", today)).toBe("morgen");
    expect(dayLabel("2026-10-07", today)).toBe("gestern");
    expect(dayLabel("2026-10-13", today)).toBe("Di.");
    expect(dayLabel("2026-10-14", today)).toBe("Mi.");
    expect(dayLabel("2026-10-15", today)).toBe("15. Okt.");
    expect(dayLabel("2026-10-06", today)).toBe("Di.");
    expect(dayLabel("2026-10-01", today)).toBe("1. Okt.");
  });

  it("nennt den Abstand im Datumspanel", () => {
    expect(relativeDays(today, today)).toBe("heute");
    expect(relativeDays("2026-10-09", today)).toBe("morgen");
    expect(relativeDays("2026-10-07", today)).toBe("gestern");
    expect(relativeDays("2026-10-12", today)).toBe("in 4 Tagen");
    expect(relativeDays("2026-10-05", today)).toBe("vor 3 Tagen");
  });

  it("liest Zeitpunkte in der Zeitzone des Kontos", () => {
    // 22:30 UTC is already the next day in Berlin, still the same day in New York.
    const late = Date.parse("2026-10-08T22:30:00Z");
    expect(localDate(late, berlin)).toBe("2026-10-09");
    expect(localDate(late, "America/New_York")).toBe("2026-10-08");
    expect(timeLabel(Date.parse("2026-10-09T07:00:00Z"), berlin)).toBe("9:00");
    expect(clockLabel(Date.parse("2026-10-09T07:05:00Z"), berlin)).toBe("09:05");
    expect(snoozeLabel(Date.parse("2026-10-13T07:00:00Z"), today, berlin)).toBe("Di., 9:00");
    expect(snoozeLabel(Date.parse("2026-10-09T07:00:00Z"), today, berlin)).toBe("morgen, 9:00");
    expect(formatTime({ hour: 9, minute: 5 })).toBe("9:05");
  });
});

describe("Uhrzeit in einer Zeitzone", () => {
  it("findet den Zeitpunkt einer Uhrzeit, auch um die Zeitumstellung", () => {
    const nine = { hour: 9, minute: 0 };
    expect(zonedTime("2026-10-12", nine, berlin)).toBe(Date.parse("2026-10-12T07:00:00Z"));
    expect(zonedTime("2026-10-26", nine, berlin)).toBe(Date.parse("2026-10-26T08:00:00Z"));
    // Both switch days: spring forward and fall back happen before 9:00.
    expect(zonedTime("2026-03-29", nine, berlin)).toBe(Date.parse("2026-03-29T07:00:00Z"));
    expect(zonedTime("2026-10-25", nine, berlin)).toBe(Date.parse("2026-10-25T08:00:00Z"));
    expect(zonedTime("2026-10-12", { hour: 18, minute: 30 }, "America/New_York")).toBe(
      Date.parse("2026-10-12T22:30:00Z"),
    );
    expect(zonedTime("2026-10-12", nine, "UTC")).toBe(Date.parse("2026-10-12T09:00:00Z"));
    expect(zonedTime("2026-10-12", nine, "Asia/Kolkata")).toBe(Date.parse("2026-10-12T03:30:00Z"));
  });
});

describe("Vorschläge im Datumspanel", () => {
  const dates = (day: string) => dateSuggestions(day).map((entry) => entry.date);

  it("löst die festen Vorschläge auf", () => {
    expect(dateSuggestions(today).map(({ label, date }) => [label, date])).toEqual([
      ["Heute", "2026-10-08"],
      ["Morgen", "2026-10-09"],
      ["Am Wochenende", "2026-10-10"],
      ["Nächste Woche", "2026-10-12"],
      ["In zwei Wochen", "2026-10-22"],
    ]);
  });

  it("rechnet Wochenende und nächste Woche von jedem Wochentag aus", () => {
    // Saturday: the weekend is today. Sunday: the next Saturday. Monday: next week's Monday.
    expect(dates("2026-10-10").slice(2, 4)).toEqual(["2026-10-10", "2026-10-12"]);
    expect(dates("2026-10-11").slice(2, 4)).toEqual(["2026-10-17", "2026-10-12"]);
    expect(dates("2026-10-12").slice(2, 4)).toEqual(["2026-10-17", "2026-10-19"]);
  });
});

describe("Getippte Daten", () => {
  const day = (input: string) => parseDateInput(input, today)?.date;

  it("versteht relative Tage", () => {
    expect(day("heute")).toBe("2026-10-08");
    expect(day("Morgen")).toBe("2026-10-09");
    expect(day("übermorgen")).toBe("2026-10-10");
    expect(day("ubermorgen")).toBe("2026-10-10");
    expect(day("wochenende")).toBe("2026-10-10");
    expect(day("am Wochenende")).toBe("2026-10-10");
    expect(day("nächste woche")).toBe("2026-10-12");
    expect(day("Nächster  Woche")).toBe("2026-10-12");
    expect(day("nächsten monat")).toBe("2026-11-01");
    expect(parseDateInput("nächsten monat", "2026-12-20")?.date).toBe("2027-01-01");
  });

  it("versteht in N Tagen, Wochen und Monaten", () => {
    expect(day("in 3 tagen")).toBe("2026-10-11");
    expect(day("in 1 tag")).toBe("2026-10-09");
    expect(day("in 2 wochen")).toBe("2026-10-22");
    expect(day("in einer Woche")).toBe("2026-10-15");
    expect(day("in zwei wochen")).toBe("2026-10-22");
    expect(day("in einem monat")).toBe("2026-11-08");
    expect(day("in 3 monaten")).toBe("2027-01-08");
    expect(day("in 0 tagen")).toBeUndefined();
    expect(day("in viele tagen")).toBeUndefined();
  });

  it("versteht Wochentage als den nächsten solchen Tag nach heute", () => {
    expect(day("mo")).toBe("2026-10-12");
    expect(day("Mo.")).toBe("2026-10-12");
    expect(day("montag")).toBe("2026-10-12");
    expect(day("di")).toBe("2026-10-13");
    expect(day("Mittwoch")).toBe("2026-10-14");
    // Today is a Thursday, so "do" means next week.
    expect(day("do")).toBe("2026-10-15");
    expect(day("fr")).toBe("2026-10-09");
    expect(day("sa")).toBe("2026-10-10");
    expect(day("so")).toBe("2026-10-11");
    expect(day("am fr")).toBe("2026-10-09");
    expect(day("nächsten Montag")).toBe("2026-10-12");
    expect(day("m")).toBeUndefined();
    expect(day("mx")).toBeUndefined();
  });

  it("versteht Daten mit und ohne Jahr", () => {
    expect(day("15.10.")).toBe("2026-10-15");
    expect(day("15.10")).toBe("2026-10-15");
    expect(day("8.10.")).toBe("2026-10-08");
    expect(day("15.10.2026")).toBe("2026-10-15");
    expect(day("15.10.27")).toBe("2027-10-15");
    expect(day("1.3.2025")).toBe("2025-03-01");
    expect(day("2026-10-15")).toBe("2026-10-15");
    // A day that already passed this year means next year.
    expect(day("1.3.")).toBe("2027-03-01");
    expect(day("29.2.")).toBe("2028-02-29");
    expect(day("31.2.")).toBeUndefined();
    expect(day("32.1.")).toBeUndefined();
    expect(day("15.13.")).toBeUndefined();
    expect(day("15.10.202")).toBeUndefined();
  });

  it("versteht eine Uhrzeit nach dem Tag oder allein", () => {
    expect(parseDateInput("morgen 14", today)).toEqual({
      date: "2026-10-09",
      time: { hour: 14, minute: 0 },
    });
    expect(parseDateInput("fr 9:30", today)).toEqual({
      date: "2026-10-09",
      time: { hour: 9, minute: 30 },
    });
    expect(parseDateInput("morgen um 14 Uhr", today)?.time).toEqual({ hour: 14, minute: 0 });
    expect(parseDateInput("15.10. 9:30", today)).toEqual({
      date: "2026-10-15",
      time: { hour: 9, minute: 30 },
    });
    expect(parseDateInput("14", today)).toEqual({ time: { hour: 14, minute: 0 } });
    expect(parseDateInput("14 uhr", today)).toEqual({ time: { hour: 14, minute: 0 } });
    expect(parseDateInput("14uhr", today)).toEqual({ time: { hour: 14, minute: 0 } });
    expect(parseDateInput("um 9", today)).toEqual({ time: { hour: 9, minute: 0 } });
    expect(parseDateInput("mo 25", today)).toBeUndefined();
    expect(parseDateInput("9:75", today)).toBeUndefined();
  });

  it("lehnt alles andere ab", () => {
    for (const input of ["", "  ", "xyz", "in", "in 3", "morgen früh", "15", "15.", "1.2.3.4"])
      expect(parseDateInput(input, today)?.date, input).toBeUndefined();
  });
});

describe("Zurückstellen", () => {
  // 12:00 in Berlin.
  const now = Date.parse("2026-10-08T10:00:00Z");
  const end = (input: string) => snoozeEnd(parseDateInput(input, today)!, today, now, berlin);

  it("nimmt 9:00 als Standard, heute 18:00", () => {
    expect(end("morgen")).toEqual({
      date: "2026-10-09",
      time: { hour: 9, minute: 0 },
      at: Date.parse("2026-10-09T07:00:00Z"),
    });
    expect(end("heute").at).toBe(Date.parse("2026-10-08T16:00:00Z"));
  });

  it("nimmt die getippte Uhrzeit", () => {
    expect(end("morgen 14").at).toBe(Date.parse("2026-10-09T12:00:00Z"));
    expect(end("fr 9:30").at).toBe(Date.parse("2026-10-09T07:30:00Z"));
  });

  it("legt eine vergangene Uhrzeit ohne Tag auf morgen", () => {
    expect(end("14").date).toBe(today);
    expect(end("9")).toEqual({
      date: "2026-10-09",
      time: { hour: 9, minute: 0 },
      at: Date.parse("2026-10-09T07:00:00Z"),
    });
    // With a typed day it stays, even in the past; the panel refuses it then.
    expect(end("heute 9").at).toBeLessThan(now);
  });
});
