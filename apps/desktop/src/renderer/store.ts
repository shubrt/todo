import type { Id } from "@todo/backend/dataModel";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ListKind, Task } from "./data";
import type { Panel } from "./panels/types";

/** The open list: a list id, or a list kind that exists once per owner (Wichtig, Habits, …). */
export type ListRef = { id: Id<"lists"> } | { kind: Exclude<ListKind, "tasks"> };

/**
 * A row the keyboard can select, published by the open view in display order (see
 * useSelectables). The keymap acts on the selected item:
 * - `section`: a collapsible section header; ←/→/↵ toggle `scope`/`section` in the store.
 * - `task`: a task or subtask; all task shortcuts apply. `siblings` is its reorder group in
 *   display order (roots of the same section, or the parent's subtasks), `subtasks` the number
 *   of its subtasks (roots only), `parent` the root of a subtask, `sortable` false where a view
 *   shows only part of its list (Wichtig, see abilities).
 * - `row`: any other row; ↵ calls `enter`, ⌘K and right click call `actions`.
 */
export type Selectable =
  | { type: "section"; id: string; scope: string; section: string; open: boolean }
  | {
      type: "task";
      id: Id<"tasks">;
      task: Task;
      siblings: Task[];
      subtasks: number;
      parent?: Task;
      sortable: boolean;
    }
  | { type: "row"; id: string; enter?: () => void; actions?: () => void };

export type TaskItem = Extract<Selectable, { type: "task" }>;

/**
 * Inline editing: `rename` edits the title of the row with that id (task or recurrence);
 * `create` shows the new-row editor in the open list, or under `parentId` for a subtask.
 */
export type Editing = { type: "rename"; id: string } | { type: "create"; parentId?: Id<"tasks"> };

/** Whether two edits are the same: the same row renamed, or a new row in the same place. */
export function sameEdit(a: Editing | null, b: Editing | null) {
  if (!a || !b) return a === b;
  if (a.type === "rename") return b.type === "rename" && a.id === b.id;
  return b.type === "create" && a.parentId === b.parentId;
}

type AppState = {
  current: ListRef;
  /** Id of the selected Selectable. */
  selection: string | null;
  items: Selectable[];
  editing: Editing | null;
  /** Panel stack; the last entry is the visible one. */
  panels: Panel[];
  /** Root task ids whose subtasks are shown. */
  expanded: Record<string, boolean>;
  /** Persisted: per list id, per section key, whether the section is open. */
  sections: Record<string, Record<string, boolean>>;
  toast: { id: number; message: string } | null;

  /** Opens a list and drops selection, editing and panels. */
  open: (ref: ListRef) => void;
  select: (id: string | null) => void;
  /** Moves the selection by `step` rows; starts at the first or last row. */
  moveSelection: (step: 1 | -1) => void;
  setItems: (items: Selectable[]) => void;
  edit: (editing: Editing | null) => void;
  openPanel: (panel: Panel) => void;
  /** Closes the topmost panel. */
  closePanel: () => void;
  closePanels: () => void;
  setExpanded: (taskId: string, open: boolean) => void;
  setSectionOpen: (scope: string, section: string, open: boolean) => void;
  showError: (message: string) => void;
  dismissToast: () => void;
};

/** Tasks starts open; Backlog, Für später and any other section start collapsed. */
export function isSectionOpen(
  sections: AppState["sections"],
  scope: string,
  section: string,
): boolean {
  return sections[scope]?.[section] ?? section === "active";
}

let toastId = 0;

/** UI state of the window. Server data stays in Convex queries. */
export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      current: { kind: "important" },
      selection: null,
      items: [],
      editing: null,
      panels: [],
      expanded: {},
      sections: {},
      toast: null,

      open: (current) => set({ current, selection: null, editing: null, panels: [], items: [] }),
      select: (selection) => set({ selection }),
      moveSelection: (step) => {
        const { items, selection } = get();
        if (!items.length) return;
        const index = items.findIndex((item) => item.id === selection);
        const next =
          index < 0
            ? step > 0
              ? 0
              : items.length - 1
            : Math.max(0, Math.min(items.length - 1, index + step));
        set({ selection: items[next]!.id });
      },
      setItems: (items) => {
        const { items: previous, selection } = get();
        const index = previous.findIndex((item) => item.id === selection);
        // A selection that was not shown before either (a task just created) waits for its row.
        if (index < 0 || items.some((item) => item.id === selection)) {
          set({ items });
          return;
        }
        // The selected row is gone (discarded, moved, folded away): select its neighbor.
        set({ items, selection: items[Math.min(index, items.length - 1)]?.id ?? null });
      },
      edit: (editing) => set({ editing }),
      openPanel: (panel) => set((state) => ({ panels: [...state.panels, panel] })),
      closePanel: () => set((state) => ({ panels: state.panels.slice(0, -1) })),
      closePanels: () => set({ panels: [] }),
      setExpanded: (taskId, open) =>
        set((state) => ({ expanded: { ...state.expanded, [taskId]: open } })),
      setSectionOpen: (scope, section, open) =>
        set((state) => ({
          sections: { ...state.sections, [scope]: { ...state.sections[scope], [section]: open } },
        })),
      showError: (message) => set({ toast: { id: ++toastId, message } }),
      dismissToast: () => set({ toast: null }),
    }),
    {
      name: "todo.sections",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sections: state.sections }),
    },
  ),
);

/** The selected task row, if the selection is a task. */
export function selectedTask(state: Pick<AppState, "items" | "selection">): TaskItem | undefined {
  const item = state.items.find((entry) => entry.id === state.selection);
  return item?.type === "task" ? item : undefined;
}

/** The task row with that id in the open view, e.g. for a panel opened on it. */
export function findTask(items: Selectable[], taskId: string): TaskItem | undefined {
  const item = items.find((entry) => entry.id === taskId);
  return item?.type === "task" ? item : undefined;
}
