import type { Id } from "@todo/backend/dataModel";

/** Task field a date panel edits: Einplanen, Fällig am or Zurückstellen. */
export type DateField = "plannedFor" | "dueOn" | "snoozedUntil";

/**
 * One entry of the panel stack. Only the topmost entry is rendered (see PanelHost); Escape
 * pops it, so a nested panel (Einplanen from ⌘K, Umbenennen from list actions, Zeitzone from
 * Settings) goes back to the one below.
 */
export type Panel =
  | { type: "actions"; taskId: Id<"tasks"> }
  | { type: "recurrenceActions"; recurrenceId: Id<"recurrences"> }
  | { type: "date"; taskId: Id<"tasks">; field: DateField }
  | { type: "move"; taskId: Id<"tasks"> }
  | { type: "switcher" }
  | { type: "listActions"; listId: Id<"lists"> }
  | { type: "listRename"; listId: Id<"lists"> }
  | { type: "listEmoji"; listId: Id<"lists"> }
  | { type: "listColor"; listId: Id<"lists"> }
  | { type: "settings" }
  | { type: "defaultList" }
  | { type: "timeZone" }
  | { type: "newKey" };
