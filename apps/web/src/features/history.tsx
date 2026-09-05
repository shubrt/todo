import { useConvex, useQuery } from "convex/react";
import { api } from "@todo/backend/api";
import type { Doc } from "@todo/backend/dataModel";
import { useState } from "react";
import { Check, ChevronRight, Download, History } from "lucide-react";
import { downloadJson, EmptyState, formatDay, Spinner } from "../components/ui";
import { areas, useTaskActions, type Area } from "./task-context";

export function HistoryView({ today }: { today: string }) {
  const [from, setFrom] = useState(() => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() - 6);
    return date.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(today);
  const [area, setArea] = useState<Area | "">("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [previous, setPrevious] = useState<Doc<"completions">[]>([]);
  const filters = { from, to, ...(area ? { area } : {}), limit: 100 };
  const validRange =
    /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const result = useQuery(api.completions.list, validRange ? { ...filters, cursor } : "skip");
  const client = useConvex();
  const actions = useTaskActions();
  const items = [...previous, ...(result?.items ?? [])];
  const grouped = new Map<string, Doc<"completions">[]>();
  for (const item of items)
    grouped.set(item.completedLocalDate, [...(grouped.get(item.completedLocalDate) ?? []), item]);
  function reset() {
    setCursor(undefined);
    setPrevious([]);
  }

  async function exportHistory() {
    await actions.run(
      "history-export",
      async () => {
        let next: string | undefined;
        const all: Doc<"completions">[] = [];
        do {
          const page = await client.query(api.completions.list, {
            ...filters,
            limit: 500,
            cursor: next,
          });
          all.push(...page.items);
          next = page.nextCursor ?? undefined;
        } while (next);
        downloadJson(`todo-verlauf-${from}-${to}.json`, {
          from,
          to,
          area: area || "all",
          completions: all,
        });
      },
      "Verlauf exportiert.",
    );
  }

  return (
    <div className="history-view">
      <div className="history-filters">
        <label className="field">
          <span>Von</span>
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              reset();
            }}
          />
        </label>
        <label className="field">
          <span>Bis</span>
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              reset();
            }}
          />
        </label>
        <label className="field">
          <span>Bereich</span>
          <select
            value={area}
            onChange={(event) => {
              setArea(event.target.value as Area | "");
              reset();
            }}
          >
            <option value="">Alle Bereiche</option>
            {areas.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          disabled={!actions.connected || actions.pending.has("history-export") || !validRange}
          onClick={() => void exportHistory()}
        >
          <Download size={15} />
          Exportieren
        </button>
      </div>
      {!validRange ? (
        <p className="form-error">
          Wähle einen gültigen Zeitraum. Das Startdatum muss vor dem Enddatum liegen.
        </p>
      ) : !result ? (
        <Spinner />
      ) : !items.length ? (
        <EmptyState
          icon={<History size={26} />}
          title="Dein Rückblick beginnt mit dem ersten Haken."
        >
          In diesem Zeitraum wurde noch nichts erledigt.
        </EmptyState>
      ) : (
        <div className="history-days">
          {[...grouped].map(([day, completions]) => (
            <section className="history-day" key={day}>
              <div className="history-day-heading">
                <h2>
                  {day === today
                    ? "Heute"
                    : formatDay(day, { weekday: "long", day: "numeric", month: "long" })}
                </h2>
                <span>{completions.length} erledigt</span>
              </div>
              {completions.map((item) => (
                <div className="history-item" key={item._id}>
                  <span className="history-check">
                    <Check size={14} />
                  </span>
                  <div>
                    <span className="history-title">{item.titleSnapshot}</span>
                    <div className="task-metadata">
                      {item.parentTitleSnapshot && (
                        <span>
                          <ChevronRight size={12} />
                          {item.parentTitleSnapshot}
                        </span>
                      )}
                      {item.projectNameSnapshot && <span>{item.projectNameSnapshot}</span>}
                      <span className={`area-tag ${item.areaSnapshot ?? "habits"}`}>
                        {item.areaSnapshot ?? "Habits"}
                      </span>
                    </div>
                  </div>
                  <time>
                    {new Intl.DateTimeFormat("de-DE", {
                      timeZone: item.timeZoneSnapshot,
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(item.completedAt)}
                  </time>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      {result?.nextCursor && (
        <button
          className="button secondary load-more"
          onClick={() => {
            setPrevious(items);
            setCursor(result.nextCursor ?? undefined);
          }}
        >
          Weitere laden
        </button>
      )}
      <p className="history-note">
        Erledigungen bleiben mit ihrem damaligen Bereich, Projekt und Aufgabentitel erhalten.
      </p>
    </div>
  );
}
