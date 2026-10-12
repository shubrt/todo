import { ChevronRight } from "lucide-react";
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { comboOf, hasModifier, matches } from "../keymap";
import { useApp } from "../store";
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
};

/** A group of rows; sections are separated by a line and may have a label (Settings). */
export type PanelSection = { id: string; label?: string; items: PanelItem[] };

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
  /** Width in px: 340 (actions, default) or 330 (switcher). */
  width?: number;
  /** Denser rows, used by Settings. */
  compact?: boolean;
  /** Small text under the rows. */
  hint?: ReactNode;
  /** Shown when no row is left. */
  empty?: ReactNode;
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
  inputRef,
  onKeyDown,
}: PanelProps) {
  const [own, setOwn] = useState("");
  const query = controlled ?? own;
  const [highlightId, setHighlightId] = useState<string>();
  const listId = useId();
  const rows = useRef(new Map<string, HTMLDivElement>());

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
  const highlighted = candidates.find((item) => item.id === highlightId) ?? candidates[0];

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

  return (
    <div
      className={cx("pal", compact && "set")}
      style={{ width }}
      role="dialog"
      aria-label={placeholder}
    >
      <div className="q">
        {crumb && (
          <span className="crumb">
            {crumb}
            <ChevronRight size={12} />
          </span>
        )}
        <input
          ref={inputRef}
          autoFocus
          value={query}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={highlighted ? `${listId}-${highlighted.id}` : undefined}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKey}
        />
      </div>
      <div className="pl" id={listId} role="listbox">
        {visible.length ? (
          visible.map((section, index) => (
            <Fragment key={section.id}>
              {index > 0 && <div className="sep" />}
              {section.label && <div className="ps">{section.label}</div>}
              {section.items.map((item) => {
                const isHighlighted = item === highlighted;
                return (
                  <div
                    key={item.id}
                    id={`${listId}-${item.id}`}
                    ref={(element) => {
                      if (element) rows.current.set(item.id, element);
                      else rows.current.delete(item.id);
                    }}
                    role="option"
                    aria-selected={isHighlighted}
                    aria-disabled={!runnable(item)}
                    className={cx(
                      "pi",
                      isHighlighted && "sel",
                      item.dim && "off",
                      item.tone === "danger" && "danger",
                      item.info && "info",
                    )}
                    onMouseMove={() => {
                      if (runnable(item) && !isHighlighted) setHighlightId(item.id);
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (runnable(item)) item.run?.();
                    }}
                  >
                    {item.icon !== undefined && <span className="ic">{item.icon}</span>}
                    <span className="pt">{item.label}</span>
                    {item.keys ? (
                      <Keycaps combo={item.keys} />
                    ) : (
                      item.value !== undefined && (
                        <span className="pacc">
                          {typeof item.value === "function"
                            ? item.value(isHighlighted)
                            : item.value}
                        </span>
                      )
                    )}
                  </div>
                );
              })}
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
