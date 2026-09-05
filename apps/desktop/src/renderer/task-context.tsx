import { createContext, useContext } from "react";
import type { Doc } from "@todo/backend/dataModel";

export type Area = "me" | "agency" | "work";
export type Task = Doc<"tasks"> & { isDue: boolean; isOverdue: boolean; isDeferred: boolean };
export type Actions = {
  connected: boolean;
  pending: Set<string>;
  run: (key: string, action: () => Promise<unknown>, message?: string) => Promise<boolean>;
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
