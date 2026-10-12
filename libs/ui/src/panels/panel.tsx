import { Check, ChevronRight, Search } from "lucide-react";
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import { useDay, useLists, type Task } from "../data";
import { comboOf, hasModifier, matches } from "../keymap";
import { dateDetails } from "../rows";
import { useApp } from "../store";
import { isTouch, longPress, pullDown } from "../touch";
import { cx, Keycaps } from "../ui";
import "./panels.css";

/**
 * A panel row: icon slot, label, then keycaps (`keys`) or a value on the right. Rows with
 * `run` can be highlighted and run (↵, click, or their `keys` combo while the panel is open);
 * `info` rows are smaller read-only lines.
 */
export type PanelItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Right side when there are no keys; a function gets whether the row is highlighted. */
  value?: ReactNode | ((highlighted: boolean) => ReactNode);
  /** Combo shown as keycaps and run while the panel is open, e.g. "shift+mod+k". */
  keys?: string;
  /** Extra words the search matches besides the label. */
  keywords?: string;
  tone?: "danger";
  /** Dimmed, e.g. the current list in Verschieben. */
  dim?: boolean;
  info?: boolean;
  run?: () => void;
  /** Touch: what a long press on the row does, e.g. the list actions in the switcher. */
  hold?: () => void;
  /** Touch: the label as a tile (see PanelSection `columns`), e.g. Später for Zurückstellen …. */
  tile?: string;
  /** Touch: a toggle tile that is set (Wichtig, KI), ringed; its label already says so. */
  on?: boolean;
  /** Touch: the current list's tile, ringed like `on` and named with "aktuell". */
  current?: boolean;
};

/**
 * A group of rows; sections are separated by a line and may have a label (Settings). On touch,
 * `columns` lays the rows out as tiles in that many columns: 4 for task actions, 3 for lists.
 */
export type PanelSection = { id: string; label?: string; items: PanelItem[]; columns?: 3 | 4 };

export type PanelProps = {
  sections: PanelSection[];
  placeholder: string;
  /** Breadcrumb before the search field, e.g. "Einplanen". */
  crumb?: string;
  /** Controlled search text; uncontrolled without it. */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** Hides rows whose label and keywords miss the search (default). Off when the panel builds rows from the query itself. */
  filter?: boolean;
  /** Width in px: 340 (actions, default) or 330 (switcher). Touch drawers span the window. */
  width?: number;
  /** Denser rows, used by Settings. */
  compact?: boolean;
  /** Small text under the rows. */
  hint?: ReactNode;
  /** Shown when no row is left. */
  empty?: ReactNode;
  /**
   * Touch: what the drawer acts on, in the line under the grabber: a task (checkbox in its list
   * color, title and dates) or a plain title (a list, a recurrence, Einstellungen).
   */
  head?: string | Task;
  /** Touch: false drops the search field of a drawer that is tapped, not searched (Settings). */
  search?: boolean;
  /** Touch: the search field takes focus on open, for panels that are typed into. */
  typing?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /**
   * Runs before the built-in keys (but after ⌘⌫ clears a filled search); return true when the
   * key was handled. The highlighted row then stays highlighted.
   */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>, highlighted?: PanelItem) => boolean;
};

/** A row `run` that closes the whole panel stack, then runs `action` (e.g. a task write). */
export const closeThen = (action: () => unknown) => () => {
  useApp.getState().closePanels();
  void action();
};

/** A row `run` that closes only this panel, back to the one below, then runs `action`. */
export const backThen = (action: () => unknown) => () => {
  useApp.getState().closePanel();
  void action();
};

/**
 * Closes the calling panel (the topmost) once its target is gone, e.g. a task moved or a list
 * deleted elsewhere, instead of leaving an empty layer that swallows the keys. Pass false while
 * the target is still loading.
 */
export function useCloseWhenGone(gone: boolean) {
  useEffect(() => {
    if (gone) useApp.getState().closePanel();
  }, [gone]);
}

/** Drops the rows that do not apply, written as `condition && row`. */
export const applicable = (rows: (PanelItem | false | undefined | "")[]) =>
  rows.filter((row): row is PanelItem => Boolean(row));

const runnable = (item: PanelItem) => Boolean(item.run) && !item.info;
const normalize = (text: string) => text.toLocaleLowerCase("de-DE").trim();

/**
 * Raycast-style panel: search field with caret and placeholder on top, filterable rows below.
 * ↑/↓ move the highlight, ↵ runs it, esc closes this panel (the topmost) only. Rows decide
 * themselves whether running them closes the whole stack (store.closePanels).
 * ⌘⌫ in a filled search field clears it, as in any macOS text field, and keeps the highlighted
 * row; only a ⌘⌫ in the empty field reaches the rows (Verwerfen, Liste löschen, widerrufen).
 * On touch the panel is a drawer at the bottom: grabber, `head`, search field, then rows or
 * tiles to tap. Pulling the top part down closes it (pullDown). The field waits for a tap
 * (unless `typing`), and nothing is highlighted until there is a search, whose first row the
 * keyboard's return key then runs.
 */
export function Panel({
  sections,
  placeholder,
  crumb,
  query: controlled,
  onQueryChange,
  filter = true,
  width = 340,
  compact = false,
  hint,
  empty = "Keine Treffer",
  head,
  search = true,
  typing = false,
  inputRef,
  onKeyDown,
}: PanelProps) {
  const touch = isTouch();
  const [own, setOwn] = useState("");
  const query = controlled ?? own;
  const [highlightId, setHighlightId] = useState<string>();
  const listId = useId();
  const rows = useRef(new Map<string, HTMLElement>());
  const drawer = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const needle = filter ? normalize(query) : "";
    return sections
      .map((section) => ({
        ...section,
        items: needle
          ? section.items.filter((item) =>
              normalize(`${item.label} ${item.keywords ?? ""}`).includes(needle),
            )
          : section.items,
      }))
      .filter((section) => section.items.length);
  }, [sections, query, filter]);
  const candidates = visible.flatMap((section) => section.items).filter(runnable);
  const highlighted =
    candidates.find((item) => item.id === highlightId) ??
    (touch && !query.trim() ? undefined : candidates[0]);

  useEffect(() => {
    if (highlighted) rows.current.get(highlighted.id)?.scrollIntoView?.({ block: "nearest" });
  }, [highlighted]);

  function setQuery(next: string, keep?: PanelItem) {
    setHighlightId(keep?.id);
    if (onQueryChange) onQueryChange(next);
    else setOwn(next);
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (query && matches(event, "mod+backspace")) {
      event.preventDefault();
      setQuery("", highlighted);
      return;
    }
    if (onKeyDown?.(event, highlighted)) {
      event.preventDefault();
      // The row a key acted on stays highlighted, also when it moves (⌥↑ in ⌘P).
      setHighlightId(highlighted?.id);
      return;
    }
    const combo = comboOf(event);
    if (combo === "escape") {
      event.preventDefault();
      useApp.getState().closePanel();
    } else if (combo === "up" || combo === "down") {
      event.preventDefault();
      if (!candidates.length) return;
      const index = highlighted ? candidates.indexOf(highlighted) : -1;
      const step = combo === "down" ? 1 : -1;
      setHighlightId(candidates[(index + step + candidates.length) % candidates.length]!.id);
    } else if (combo === "enter") {
      event.preventDefault();
      highlighted?.run?.();
    } else {
      // Bare keys (⇥, ⌫) only act while the search is empty, so typing stays typing; ⌘⌫ too,
      // see above.
      const shortcut = sections
        .flatMap((section) => section.items)
        .find(
          (item) =>
            item.keys &&
            runnable(item) &&
            matches(event, item.keys) &&
            (hasModifier(item.keys) || !query),
        );
      if (shortcut) {
        event.preventDefault();
        shortcut.run?.();
      } else if (combo === "tab" || combo === "shift+tab") event.preventDefault();
    }
  }

  const field = (
    <div className="q">
      {crumb ? (
        <span className="crumb">
          {crumb}
          <ChevronRight size={12} />
        </span>
      ) : (
        touch && <Search size={15} />
      )}
      <input
        ref={inputRef}
        autoFocus={!touch || typing}
        value={query}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={highlighted ? `${listId}-${highlighted.id}` : undefined}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKey}
      />
    </div>
  );

  /** What rows and tiles share: their id and ref, the highlight, the press, hold and tap. */
  const target = (item: PanelItem) => ({
    id: `${listId}-${item.id}`,
    ref: (element: HTMLElement | null) => {
      if (element) rows.current.set(item.id, element);
      else rows.current.delete(item.id);
    },
    "aria-disabled": !runnable(item),
    onMouseMove: () => {
      // iOS sends one before each tap; a highlight then would show the row's extras (the ⌘P
      // star) and cost the tap.
      if (!touch && runnable(item) && item !== highlighted) setHighlightId(item.id);
    },
    onMouseDown: (event: MouseEvent) => {
      // Keeps the focus in the search field, except for a field in the row (Datum wählen),
      // which must take it to open its picker.
      if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
    },
    onPointerDown:
      item.hold &&
      longPress(() => {
        item.hold?.();
        return true;
      }),
    onClick: () => {
      if (runnable(item)) item.run?.();
    },
  });
  const valueOf = (item: PanelItem) =>
    typeof item.value === "function" ? item.value(item === highlighted) : item.value;

  const row = (item: PanelItem) => (
    <div
      key={item.id}
      {...target(item)}
      role="option"
      aria-selected={item === highlighted}
      className={cx(
        "pi",
        item === highlighted && "sel",
        item.dim && "off",
        item.tone === "danger" && "danger",
        item.info && "info",
      )}
    >
      {item.icon !== undefined && <span className="ic">{item.icon}</span>}
      <span className="pt">{item.label}</span>
      {item.keys ? (
        <Keycaps combo={item.keys} />
      ) : (
        item.value !== undefined && <span className="pacc">{valueOf(item)}</span>
      )}
    </div>
  );
  // An option named by its full label, which says what a toggle does ("Nicht mehr wichtig"),
  // then the current list's state and a text value: "work, aktuell, 4".
  const tile = (item: PanelItem) => {
    const value = valueOf(item);
    const text = typeof value === "string" || typeof value === "number" ? value : null;
    return (
      <button
        key={item.id}
        {...target(item)}
        role="option"
        aria-selected={item === highlighted}
        className={cx(
          "tile",
          item === highlighted && "sel",
          (item.on || item.current) && "on",
          item.dim && "off",
        )}
        aria-label={[item.label, item.current && "aktuell", text].filter(Boolean).join(", ")}
        tabIndex={-1}
      >
        {item.icon}
        <span className="tl">{item.tile ?? item.label}</span>
        {value != null && <span className="tv">{value}</span>}
      </button>
    );
  };

  return (
    <div
      ref={drawer}
      className={cx("pal", compact && "set")}
      style={{ "--pal-w": `${width}px` }}
      role="dialog"
      aria-label={
        touch && !search && head ? (typeof head === "string" ? head : head.title) : placeholder
      }
    >
      {touch ? (
        <div
          className="head"
          onPointerDown={pullDown(drawer, () => useApp.getState().closePanel())}
        >
          <i className="grab" />
          {typeof head === "string" ? (
            <div className="hd">
              <span className="ht">{head}</span>
            </div>
          ) : (
            head && <TaskHead task={head} />
          )}
          {search && field}
        </div>
      ) : (
        field
      )}
      <div className="pl" id={listId} role="listbox">
        {visible.length ? (
          visible.map((section, index) => (
            <Fragment key={section.id}>
              {index > 0 && <div className="sep" />}
              {section.label && <div className="ps">{section.label}</div>}
              {touch && section.columns ? (
                <div className={cx("tiles", `c${section.columns}`)}>{section.items.map(tile)}</div>
              ) : (
                section.items.map(row)
              )}
            </Fragment>
          ))
        ) : (
          <div className="pe">{empty}</div>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

/** Touch: the head of a task's drawer, as in its row: checkbox in the list color and dates. */
function TaskHead({ task }: { task: Task }) {
  const lists = useLists();
  const day = useDay();
  const done = task.state === "done";
  const dates = day && !done ? dateDetails(task, day).filter(Boolean) : [];
  return (
    <div
      className={cx("hd", done && "done")}
      style={{ "--acc": lists?.find((list) => list._id === task.listId)?.color }}
    >
      <i className="cb">{done && <Check size={10} />}</i>
      <span className="ht">{task.title}</span>
      {dates.length > 0 && <span className="hm">{dates}</span>}
    </div>
  );
}
