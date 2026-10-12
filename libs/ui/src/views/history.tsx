import { api } from "@todo/backend/api";
import { useQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChevronRight } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useDay, useLists, type Completion, type Day, type List } from "../data";
import { addDays, clockLabel, weekdayDate } from "../dates";
import { EmptyLine, SectionHeader, useSelectables, useSelectedRow } from "../rows";
import { useApp, type Selectable } from "../store";
import { cx, ListMark } from "../ui";
import "./views.css";

type Page = FunctionReturnType<typeof api.completions.list>;
type Mark = { name: string; emoji?: string };

const pageSize = 100;
const moreId = "history:more";

/**
 * Verlauf: completions in one section per local day, newest day first, each day in the order
 * things were done. Older days load page by page once "Weitere laden" scrolls into view (or
 * on ↵ or click).
 */
export function HistoryView(_props: { list: List }) {
  const day = useDay();
  const lists = useLists();
  if (!day || !lists) return null;
  // The pages are cursors into the days before today, so a new day starts them over.
  return <History key={day.today} day={day} lists={lists} />;
}

/** A query result of useQueries: undefined while loading; errors throw like useQuery's. */
function loaded(value: unknown) {
  if (value instanceof Error) throw value;
  return value as Page | undefined;
}

function History({ day, lists }: { day: Day; lists: List[] }) {
  // Only today's completions change (new ones, reopened ones), so today has its own live
  // query and the cursors into the older days stay valid.
  const [cursors, setCursors] = useState<string[]>([]);
  const queries = useMemo(() => {
    const older = { to: addDays(day.today, -1), limit: pageSize };
    const pages = [older, ...cursors.map((cursor) => ({ ...older, cursor }))];
    return Object.fromEntries([
      ["today", { query: api.completions.list, args: { from: day.today, limit: 500 } }],
      ...pages.map((args, index) => [`page${index}`, { query: api.completions.list, args }]),
    ]);
  }, [day.today, cursors]);
  const results = useQueries(queries);

  const model = useMemo(() => {
    const today = loaded(results.today);
    const pages = Array.from({ length: cursors.length + 1 }, (_, index) =>
      loaded(results[`page${index}`]),
    ).filter((page) => page !== undefined);
    if (!today || !pages.length) return undefined;
    const next = pages.at(-1)?.nextCursor ?? undefined;
    const items = [today, ...pages].flatMap((page) => page.items);
    // Newest day first (the order of the pages), each day from its first completion on.
    const days = [...Map.groupBy(items, (item) => item.completedLocalDate)].map(
      ([date, entries]) => ({
        date,
        items: entries.toSorted((a, b) => a.completedAt - b.completedAt),
      }),
    );
    // The oldest day may continue on the next page; it shows once it is complete.
    if (next && days.length > 1) days.pop();
    return { days, next };
  }, [results, cursors]);

  const next = model?.next;
  const loadMore = useCallback(() => {
    if (next) setCursors((current) => (current.includes(next) ? current : [...current, next]));
  }, [next]);
  const items = useMemo((): Selectable[] => {
    const rows = (model?.days ?? []).flatMap(({ items }) =>
      items.map((item): Selectable => ({ type: "row", id: item._id })),
    );
    return next ? [...rows, { type: "row", id: moreId, enter: loadMore }] : rows;
  }, [model, next, loadMore]);
  useSelectables(items);

  if (!model) return null;
  if (!model.days.length && !next) return <EmptyLine>Noch nichts erledigt.</EmptyLine>;
  return (
    <>
      {model.days.map(({ date, items }) => (
        <Fragment key={date}>
          <SectionHeader label={dayHeading(date, day.today)} count={items.length} />
          {items.map((item) => (
            <HistoryRow key={item._id} item={item} mark={markOf(item, lists)} />
          ))}
        </Fragment>
      ))}
      {next && <MoreRow onLoad={loadMore} />}
    </>
  );
}

/** "Heute", "Gestern", then "Di., 6. Okt.". */
function dayHeading(date: string, today: string) {
  if (date === today) return "Heute";
  if (date === addDays(today, -1)) return "Gestern";
  return weekdayDate(date, today);
}

/**
 * The list a completion came from: the list as it is now, the snapshot when the list is gone,
 * or for rows from before lists the list that replaced their area.
 */
function markOf(item: Completion, lists: List[]): Mark | undefined {
  return (
    lists.find((list) => list._id === item.listId) ??
    (item.listNameSnapshot !== undefined
      ? { name: item.listNameSnapshot, emoji: item.listEmojiSnapshot }
      : lists.find((list) => item.areaSnapshot && list.legacyArea === item.areaSnapshot))
  );
}

/** Time in the zone it was done in, the parent's title before a subtask's, the list's mark. */
function HistoryRow({ item, mark }: { item: Completion; mark: Mark | undefined }) {
  const { selected, ref } = useSelectedRow(item._id);
  return (
    <div
      ref={ref}
      className={cx("row", selected && "sel")}
      role="option"
      aria-selected={selected}
      onMouseDown={() => useApp.getState().select(item._id)}
    >
      <span className="time">{clockLabel(item.completedAt, item.timeZoneSnapshot)}</span>
      <div className="b">
        <div className="l1">
          {item.parentTitleSnapshot && (
            <span className="pre">
              <span>{item.parentTitleSnapshot}</span>
              <ChevronRight size={11} />
            </span>
          )}
          <span className="t">{item.titleSnapshot}</span>
        </div>
      </div>
      {mark && (
        <span className="acc">
          <span className="a" title={mark.name}>
            <ListMark list={mark} />
          </span>
        </span>
      )}
    </div>
  );
}

/** Last row while older days exist; loads them once it scrolls into view, on ↵ or click. */
function MoreRow({ onLoad }: { onLoad: () => void }) {
  const { selected, ref } = useSelectedRow(moreId);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoad();
      },
      { root: element.closest(".list") },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [onLoad, ref]);
  return (
    <div
      ref={ref}
      className={cx("row", "more", selected && "sel")}
      role="option"
      aria-selected={selected}
      onMouseDown={() => useApp.getState().select(moreId)}
      onClick={onLoad}
    >
      <span className="time" />
      <div className="b">
        <div className="l1">
          <span className="t">Weitere laden</span>
        </div>
      </div>
    </div>
  );
}
