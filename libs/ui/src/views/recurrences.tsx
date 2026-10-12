import { api } from "@todo/backend/api";
import type { Id } from "@todo/backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Repeat } from "lucide-react";
import { Fragment, useMemo } from "react";
import { useLists, useWrite, type List, type Recurrence } from "../data";
import { rowHold } from "../drag";
import {
  EmptyLine,
  SectionHeader,
  startsRename,
  TitleInput,
  useRowTap,
  useSelectables,
  useSelectedRow,
} from "../rows";
import { useApp, type Selectable } from "../store";
import { useTaskActions } from "../task-actions";
import { isTouch } from "../touch";
import { cx } from "../ui";
import { byList } from "./by-list";
import "./views.css";

/** Rule weekdays run from 1 (Monday) to 7 (Sunday). */
const weekdays = ["Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa.", "So."];

/** "täglich", "jeden Fr.", "monatlich am 1."; nothing for habits, which are always daily. */
function ruleLabel({ kind, rule }: Recurrence) {
  switch (rule.frequency) {
    case "daily":
      return kind === "habit" ? undefined : "täglich";
    case "weekly":
      return `jeden ${weekdays[rule.weekday - 1] ?? ""}`;
    case "monthly":
      return `monatlich am ${rule.dayOfMonth}.`;
  }
}

const openActions = (recurrenceId: Id<"recurrences">) =>
  useApp.getState().openPanel({ type: "recurrenceActions", recurrenceId });

/**
 * Wiederholungen: recurring tasks and habits in one section per list (no emoji in the
 * header), habits in their Habits order. Paused ones stay in place, dimmed. ↵ and a tap on
 * touch rename; ⌘K, right click and a long press on touch open the recurrence actions
 * (panels/actions.tsx).
 */
export function RecurrencesView(_props: { list: List }) {
  const recurrences = useQuery(api.recurrences.list, {});
  const lists = useLists();
  const actions = useTaskActions();
  const sections = useMemo(
    () => recurrences && lists && byList(lists, recurrences, (item) => item.listId),
    [recurrences, lists],
  );
  const items = useMemo(
    () =>
      sections?.flatMap((section) =>
        section.items.map(
          (item): Selectable => ({
            type: "row",
            id: item._id,
            enter: () => actions.rename(item._id),
            actions: () => openActions(item._id),
          }),
        ),
      ) ?? [],
    [sections, actions],
  );
  useSelectables(items);

  if (!sections) return null;
  if (!sections.length) return <EmptyLine>Keine Wiederholungen.</EmptyLine>;
  return sections.map((section) => (
    <Fragment key={section.list._id}>
      <SectionHeader label={section.list.name} count={section.items.length} />
      {section.items.map((item) => (
        <RecurrenceRow key={item._id} item={item} color={section.list.color} />
      ))}
    </Fragment>
  ));
}

/** ↻ in the list color, title (a text field while renaming), rule and "pausiert" on the right. */
function RecurrenceRow({ item, color }: { item: Recurrence; color: string }) {
  const { selected, ref } = useSelectedRow(item._id);
  const editing = useApp(
    (state) => state.editing?.type === "rename" && state.editing.id === item._id,
  );
  const actions = useTaskActions();
  const update = useMutation(api.recurrences.update);
  const write = useWrite();
  const rule = ruleLabel(item);
  const select = () => useApp.getState().select(item._id);
  const tap = useRowTap(item._id);
  const hold = rowHold(() => {
    select();
    openActions(item._id);
  });
  return (
    <div
      ref={ref}
      className={cx("row", selected && "sel", editing && "edit", !item.enabled && "dim")}
      style={{ "--acc": color }}
      role="option"
      aria-selected={selected}
      onMouseDown={(event) => {
        if (event.button === 0) select();
      }}
      onPointerDown={(event) => {
        tap.onPointerDown();
        hold(event);
      }}
      onClick={tap.onClick}
      onDoubleClick={(event) => {
        if (startsRename(event, editing)) actions.rename(item._id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        // A long press on touch can fire this too; the hold opens the sheet there.
        if (isTouch()) return;
        select();
        openActions(item._id);
      }}
    >
      <span className="rl">
        <Repeat size={13} />
      </span>
      <div className="b">
        <div className="l1">
          {editing ? (
            <TitleInput
              initial={item.title}
              onSave={async (title) =>
                (await write(item._id, () => update({ recurrenceId: item._id, title }))).ok
              }
            />
          ) : (
            <span className="t">{item.title}</span>
          )}
        </div>
      </div>
      {(rule || !item.enabled) && (
        <span className="acc">
          {rule && <span className="a">{rule}</span>}
          {!item.enabled && <span className="a">pausiert</span>}
        </span>
      )}
    </div>
  );
}
