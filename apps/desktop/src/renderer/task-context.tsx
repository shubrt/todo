import { createContext, useContext } from "react";
import type { Doc } from "@todo/backend/dataModel";

export const areas = ["me", "agency", "work"] as const;
export type Area = (typeof areas)[number];
export const areaSymbols: Record<Area, string> = { me: "◌", agency: "❋", work: "▧" };
export type Task = Doc<"tasks"> & { isDue: boolean; isOverdue: boolean; isDeferred: boolean };
export type Actions = {
  connected: boolean;
  pending: Set<string>;
  /**
   * Runs a write once per key while connected. Errors go to the workspace toast, or to
   * `onError` where the toast would be hidden (e.g. behind a sheet).
   */
  run: (
    key: string,
    action: () => Promise<unknown>,
    message?: string,
    onError?: (message: string) => void,
  ) => Promise<boolean>;
  complete: (task: Task) => void;
  reorder: (siblings: Task[], task: Task, direction: -1 | 1) => void;
  edit: (task: Task) => void;
  focus: (task: Task, siblings: Task[]) => void;
};
export const TaskContext = createContext<Actions | null>(null);
export function useTasks() {
  const context = useContext(TaskContext);
  if (!context) throw new Error("Aufgabenaktionen fehlen.");
  return context;
}
