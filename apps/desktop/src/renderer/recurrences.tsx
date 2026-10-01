import { api } from "@todo/backend/api";
import type { Doc } from "@todo/backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { areaSymbols, useTasks } from "./task-context";

type Recurrence = Doc<"recurrences">;
const weekdays = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

// Short German rule, e.g. "täglich", "jeden Montag", "monatlich am 31.". Weekday 1 is Monday.
export function ruleLabel(rule: Recurrence["rule"]) {
  if (rule.frequency === "daily") return "täglich";
  if (rule.frequency === "weekly") return `jeden ${weekdays[rule.weekday - 1]}`;
  return `monatlich am ${rule.dayOfMonth}.`;
}

// Daily, then weekly by weekday, then monthly by day.
function ruleOrder(rule: Recurrence["rule"]) {
  if (rule.frequency === "daily") return 0;
  return rule.frequency === "weekly" ? rule.weekday : 10 + rule.dayOfMonth;
}

// Wiederholungen view: habits and recurring tasks, paused ones collapsed at the end. Titles
// rename inline; rule, area and project are read-only here.
export function RecurrencesView() {
  const recurrences = useQuery(api.recurrences.list, {});
  if (!recurrences) return <div className="loading">Wiederholungen laden …</div>;
  // Stable sort: habits keep their creation order.
  const sorted = recurrences.toSorted(
    (a, b) =>
      Number(a.kind === "task") - Number(b.kind === "task") ||
      ruleOrder(a.rule) - ruleOrder(b.rule),
  );
  const habits = sorted.filter((item) => item.enabled && item.kind === "habit");
  const tasks = sorted.filter((item) => item.enabled && item.kind === "task");
  const paused = sorted.filter((item) => !item.enabled);
  return (
    <>
      <RecurrenceSection title="Habits" items={habits} empty="Keine aktiven Habits." />
      <RecurrenceSection title="Aufgaben" items={tasks} empty="Keine wiederkehrenden Aufgaben." />
      {paused.length > 0 && (
        <details className="deferred">
          <summary>
            <Pause size={12} />
            Pausiert<span>{paused.length}</span>
            <ChevronDown size={12} />
          </summary>
          <div className="paused-list" role="list">
            {paused.map((item) => (
              <RecurrenceRow key={item._id} item={item} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function RecurrenceSection({
  title,
  items,
  empty,
}: {
  title: string;
  items: Recurrence[];
  empty: string;
}) {
  return (
    <section className="task-section">
      <h2>
        {title}
        <span>{items.length}</span>
      </h2>
      {items.length ? (
        <div role="list">
          {items.map((item) => (
            <RecurrenceRow key={item._id} item={item} />
          ))}
        </div>
      ) : (
        <p className="empty-section">{empty}</p>
      )}
    </section>
  );
}

// One recurrence. Habits show no rule (always daily) unless paused, where "Habit" tells them
// apart. Pause sits in the row tools (hover or focus), Fortsetzen on paused rows.
function RecurrenceRow({ item }: { item: Recurrence }) {
  const { run, pending, connected } = useTasks();
  const update = useMutation(api.recurrences.update);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = !connected || pending.has(item._id);
  const area = item.kind === "task" ? item.area : undefined;
  useEffect(() => {
    if (!editing) setTitle(item.title);
  }, [item.title, editing]);
  useEffect(() => {
    if (editing && input.current) {
      input.current.style.height = "auto";
      input.current.style.height = `${input.current.scrollHeight}px`;
    }
  }, [editing, title]);
  async function saveTitle() {
    const next = title.trim();
    if (!next) return;
    if (next === item.title) {
      setEditing(false);
      return;
    }
    if (await run(item._id, () => update({ recurrenceId: item._id, title: next })))
      setEditing(false);
  }
  function setEnabled(enabled: boolean) {
    void run(
      item._id,
      () => update({ recurrenceId: item._id, enabled }),
      enabled ? "Fortgesetzt." : "Pausiert.",
    );
  }
  return (
    <div className={`recurrence-row ${item.enabled ? "" : "paused"}`} role="listitem">
      <span className={`glyph ${area ?? "habit"}`} aria-hidden="true">
        {area ? areaSymbols[area] : "↻"}
      </span>
      <div className="task-body">
        {editing ? (
          <textarea
            ref={input}
            className="inline-title"
            rows={1}
            autoFocus
            value={title}
            aria-label="Titel der Wiederholung"
            maxLength={500}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setTitle(item.title);
                setEditing(false);
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void saveTitle();
              }
            }}
          />
        ) : (
          <button
            className="task-title"
            title="Titel direkt bearbeiten"
            onClick={() => setEditing(true)}
          >
            {item.title}
          </button>
        )}
        {(item.kind === "task" || !item.enabled) && (
          <div className="metadata">
            {item.kind === "habit" ? (
              <span>Habit</span>
            ) : (
              <>
                <span>{ruleLabel(item.rule)}</span>
                {item.area && <span className={`area-pill ${item.area}`}>{item.area}</span>}
                {item.projectName && <span className="project">{item.projectName}</span>}
              </>
            )}
          </div>
        )}
      </div>
      {item.enabled ? (
        <div className="task-tools">
          <button
            className="icon"
            title="Pausieren"
            aria-label={`${item.title} pausieren`}
            disabled={busy}
            onClick={() => setEnabled(false)}
          >
            <Pause size={13} />
          </button>
        </div>
      ) : (
        <button
          className="text-button"
          aria-label={`${item.title} fortsetzen`}
          disabled={busy}
          onClick={() => setEnabled(true)}
        >
          <Play size={11} />
          Fortsetzen
        </button>
      )}
    </div>
  );
}
