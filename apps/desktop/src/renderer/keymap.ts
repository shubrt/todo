import { useEffect, useLayoutEffect, useRef } from "react";
import { favoritesOf, type List, type Settings } from "./data";
import { useApp } from "./store";
import { abilities, useTaskActions, type TaskActions } from "./task-actions";

// Combos are "+"-joined modifiers and a key: "mod" (⌘), "ctrl" (⌃), "alt" (⌥), "shift" (⇧),
// then a character or one of enter, backspace, tab, space, escape, up, down, left, right.
// Examples: "mod+k", "shift+mod+k", "alt+up", "ctrl+mod+space", "enter".

const modifiers = ["ctrl", "alt", "shift", "mod"] as const;
const keyNames: Record<string, string> = {
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
  " ": "space",
};
const glyphs: Record<string, string> = {
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  mod: "⌘",
  enter: "↵",
  backspace: "⌫",
  tab: "⇥",
  space: "␣",
  escape: "esc",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

type KeyEventLike = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** Puts the modifiers of a combo in their canonical order (⌃⌥⇧⌘). */
function normalize(combo: string) {
  const parts = combo.toLowerCase().split("+");
  const key = parts.at(-1) ?? "";
  return [...modifiers.filter((modifier) => parts.includes(modifier)), key].join("+");
}

/** The combo of a key event, e.g. "shift+mod+k". */
export function comboOf(event: KeyEventLike) {
  const key = event.key.toLowerCase();
  const pressed = {
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    mod: event.metaKey,
  };
  return [...modifiers.filter((modifier) => pressed[modifier]), keyNames[key] ?? key].join("+");
}

export function matches(event: KeyEventLike, combo: string) {
  return comboOf(event) === normalize(combo);
}

/** True when the combo has a modifier; bare keys must not fire while typing a search. */
export function hasModifier(combo: string) {
  return normalize(combo).includes("+");
}

/** Keycap labels in macOS order, e.g. "shift+mod+k" → ["⇧", "⌘", "K"]. */
export function keycaps(combo: string) {
  return normalize(combo)
    .split("+")
    .map((part) => glyphs[part] ?? part.toUpperCase());
}

/** Text fields keep their keys; the list keymap only acts outside of them. */
function isTextField(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * Window-wide keys, active in every state (also before sign-in): Escape closes the topmost
 * panel or else hides the window (an edit field or panel handles its own Escape first and
 * prevents the default), ⌘W hides, ⌘, opens settings. Also routes tray navigation.
 */
export function useGlobalKeys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const state = useApp.getState();
      const combo = comboOf(event);
      if (combo === "escape") {
        event.preventDefault();
        // Editing without focus in the field (e.g. after a click elsewhere): just stop editing.
        if (state.editing) state.edit(null);
        else if (state.panels.length) state.closePanel();
        else void window.desktop?.hide();
      } else if (combo === "mod+w") {
        event.preventDefault();
        void window.desktop?.hide();
      } else if (combo === "mod+,") {
        event.preventDefault();
        // Settings replaces any other panel; its pickers (Zeitzone, …) stay open on top of it.
        if (!state.panels.some((panel) => panel.type === "settings")) {
          state.closePanels();
          state.openPanel({ type: "settings" });
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const stop = window.desktop?.onNavigate((target) => {
      const state = useApp.getState();
      if (target === "switcher" || target === "settings") {
        state.closePanels();
        state.openPanel({ type: target });
      } else state.open({ kind: target });
    });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      stop?.();
    };
  }, []);
}

type WorkspaceContext = {
  lists: List[] | undefined;
  list: List | undefined;
  settings: Settings | undefined;
};

/**
 * Keys of the signed-in window while no panel is open and nothing is being edited:
 * navigation, selection and all task shortcuts of SPEC §8.
 */
export function useWorkspaceKeys(context: WorkspaceContext) {
  const actions = useTaskActions();
  const latest = useRef({ ...context, actions });
  useLayoutEffect(() => {
    latest.current = { ...context, actions };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextField(event.target)) return;
      const state = useApp.getState();
      if (state.editing || state.panels.length) return;
      if (handleKey(comboOf(event), latest.current)) event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Runs the workspace action of a combo; returns whether the key was used. */
function handleKey(
  combo: string,
  { lists, list, settings, actions }: WorkspaceContext & { actions: TaskActions },
): boolean {
  const state = useApp.getState();
  const favorite = /^mod\+([1-9])$/.exec(combo);
  if (favorite) {
    const target = favoritesOf(lists ?? [])[Number(favorite[1]) - 1];
    if (target) state.open({ id: target._id });
    return true;
  }
  if (combo === "mod+p") {
    state.openPanel({ type: "switcher" });
    return true;
  }
  if (combo === "mod+n") {
    // Wichtig, Verlauf and Wiederholungen have no new row: switch to the default list.
    const target =
      list?.kind === "tasks" || list?.kind === "habits"
        ? list
        : lists?.find((entry) => entry._id === settings?.defaultListId);
    if (!target) return true;
    if (target !== list) state.open({ id: target._id });
    if (target.kind === "tasks") state.setSectionOpen(target._id, "active", true);
    actions.startCreate();
    return true;
  }
  if (combo === "up" || combo === "down") {
    state.moveSelection(combo === "up" ? -1 : 1);
    return true;
  }

  const item = state.items.find((entry) => entry.id === state.selection);
  if (!item) return false;
  if (item.type === "section") {
    const open =
      combo === "right"
        ? true
        : combo === "left"
          ? false
          : combo === "enter"
            ? !item.open
            : undefined;
    if (open === undefined) return false;
    state.setSectionOpen(item.scope, item.section, open);
    return true;
  }
  if (item.type === "row") {
    const run = combo === "enter" ? item.enter : combo === "mod+k" ? item.actions : undefined;
    run?.();
    return Boolean(run);
  }

  const { task } = item;
  const can = abilities(item);
  const dateFields = {
    "mod+e": "plannedFor",
    "shift+mod+e": "dueOn",
    "mod+l": "snoozedUntil",
  } as const;
  switch (combo) {
    case "right":
    case "left": {
      const expand = combo === "right";
      if (task.parentId) {
        if (expand) return false;
        // ← on a subtask goes back to its parent and folds it.
        state.setExpanded(task.parentId, false);
        state.select(task.parentId);
      } else if (item.subtasks) state.setExpanded(task._id, expand);
      return true;
    }
    case "enter":
      actions.rename(task._id);
      return true;
    case "mod+enter":
      void actions.toggleDone(task);
      return true;
    case "tab":
      if (can.indent) void actions.indent(task);
      return true;
    case "shift+tab":
      if (can.outdent) void actions.outdent(task);
      return true;
    case "alt+up":
    case "alt+down":
      void actions.reorder(task._id, combo === "alt+up" ? -1 : 1);
      return true;
    case "shift+mod+n":
      if (can.subtask) actions.startCreate(task.parentId ?? task._id);
      return true;
    case "mod+k":
      state.openPanel({ type: "actions", taskId: task._id });
      return true;
    case "mod+e":
    case "shift+mod+e":
    case "mod+l":
      if (can.schedule)
        state.openPanel({ type: "date", taskId: task._id, field: dateFields[combo] });
      return true;
    case "shift+mod+m":
      if (can.move) state.openPanel({ type: "move", taskId: task._id });
      return true;
    case "mod+i":
      if (can.important) void actions.toggleImportant(task);
      return true;
    case "shift+mod+k":
      if (can.ai) void actions.toggleAi(task);
      return true;
    case "mod+b":
      if (can.section) void actions.toggleSection(task);
      return true;
    case "shift+mod+i":
      if (can.normalize) void actions.normalize(task);
      return true;
    case "mod+backspace":
      void actions.discard(task);
      return true;
    default:
      return false;
  }
}
