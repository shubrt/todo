import type { Id } from "@todo/backend/dataModel";
import { Calendar, CalendarDays } from "lucide-react";
import { useState } from "react";
import { useDay } from "../data";
import {
  clockLabel,
  dateSuggestions,
  formatTime,
  localDate,
  parseDateInput,
  relativeDays,
  snoozeEnd,
  weekdayDate,
  zonedTime,
} from "../dates";
import { findTask, useApp } from "../store";
import { useTaskActions } from "../task-actions";
import { isTouch } from "../touch";
import { closeThen, Panel, useCloseWhenGone, type PanelItem } from "./panel";
import type { DateField } from "./types";

const crumbs: Record<DateField, string> = {
  plannedFor: "Einplanen",
  dueOn: "Fällig am",
  snoozedUntil: "Zurückstellen",
};
const hints = {
  day: "Geht auch: 15.10., fr, in 2 wochen, nächsten monat",
  time: "Geht auch: morgen 14, fr 9:30, in 2 wochen",
};

/**
 * ⌘E Einplanen, ⇧⌘E Fällig am, ⌘L Zurückstellen for one task. The empty field shows fixed
 * suggestions with their resolved day; a typed day (dates.ts parseDateInput) comes first.
 * Zurückstellen picks a time too: 18:00 today, else 9:00, or the typed one. Touch adds
 * Datum wählen, the system's date (and time) picker.
 */
export function DatePanel({ taskId, field }: { taskId: Id<"tasks">; field: DateField }) {
  const item = useApp((state) => findTask(state.items, taskId));
  const actions = useTaskActions();
  const day = useDay();
  const [query, setQuery] = useState("");
  // Fixed while the panel is open, so the offered times do not shift under the cursor.
  const [now] = useState(Date.now);
  useCloseWhenGone(!item);
  if (!item || !day) return null;
  const { task } = item;
  const { today, timeZone } = day;
  const snooze = field === "snoozedUntil";
  const setDay = (date: string | null) =>
    closeThen(() => (field === "dueOn" ? actions.due(task, date) : actions.plan(task, date)));
  const snoozeUntil = (at: number | null) => closeThen(() => actions.snooze(task, at));

  const suggestions = dateSuggestions(today).flatMap(({ id, label, date }): PanelItem[] => {
    const value = weekdayDate(date, today);
    if (!snooze) return [{ id, label, value, keywords: value, run: setDay(date) }];
    const end = snoozeEnd({ date }, today, now, timeZone);
    if (end.at <= now) return [];
    const time = formatTime(end.time);
    return [{ id, label: `${label} ${time}`, value, keywords: value, run: snoozeUntil(end.at) }];
  });

  const pick = (value: string) => {
    const [, date, hour, minute] = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value) ?? [];
    if (!date) return;
    if (!snooze) return setDay(date)();
    if (!hour || !minute) return;
    const at = zonedTime(date, { hour: Number(hour), minute: Number(minute) }, timeZone);
    // A time already past does nothing, like a typed one.
    if (at > Date.now()) snoozeUntil(at)();
  };
  const picker: PanelItem[] = isTouch()
    ? [
        {
          id: "pick",
          icon: <CalendarDays size={15} />,
          label: "Datum wählen …",
          value: (
            <PickerField
              time={snooze}
              // datetime-local takes "YYYY-MM-DDTHH:MM"; both in the account's time zone.
              min={snooze ? `${localDate(now, timeZone)}T${clockLabel(now, timeZone)}` : today}
              onPick={pick}
            />
          ),
        },
      ]
    : [];

  const input = parseDateInput(query, today);
  let typed: PanelItem | undefined;
  if (input && snooze) {
    const end = snoozeEnd(input, today, now, timeZone);
    const past = end.at <= now;
    typed = {
      id: "typed",
      label: `${weekdayDate(end.date, today)}, ${formatTime(end.time)}`,
      value: past ? "vorbei" : relativeDays(end.date, today),
      dim: past,
      run: past ? undefined : snoozeUntil(end.at),
    };
  } else if (input?.date)
    typed = {
      id: "typed",
      label: weekdayDate(input.date, today),
      value: relativeDays(input.date, today),
      run: setDay(input.date),
    };

  return (
    <Panel
      crumb={crumbs[field]}
      head={task}
      placeholder="Tag oder Datum …"
      query={query}
      onQueryChange={setQuery}
      hint={query.trim() ? hints[snooze ? "time" : "day"] : undefined}
      sections={[
        // The panel filters by label and keywords; the query as keywords keeps this row.
        ...(typed
          ? [{ id: "typed", items: [{ ...typed, icon: <Calendar size={15} />, keywords: query }] }]
          : []),
        { id: "days", items: [...suggestions, ...picker] },
        {
          id: "clear",
          items: [
            {
              id: "clear",
              label: "Kein Datum",
              keys: "backspace",
              run: snooze ? snoozeUntil(null) : setDay(null),
            },
          ],
        },
      ]}
    />
  );
}

/**
 * Datum wählen on touch: the system's date picker (with `time`, date and time) in a transparent
 * field over the row, which itself has no `run`. A day counts once it is picked, since a tap
 * that closes the panel would unmount the field before any blur; a time counts when the picker
 * closes, since its wheels report every turn.
 */
function PickerField({
  time,
  min,
  onPick,
}: {
  time: boolean;
  min: string;
  onPick: (value: string) => void;
}) {
  return (
    <input
      className="pick"
      type={time ? "datetime-local" : "date"}
      min={min}
      aria-label="Datum wählen"
      onChange={time ? undefined : (event) => onPick(event.target.value)}
      onBlur={time ? (event) => onPick(event.target.value) : undefined}
    />
  );
}
