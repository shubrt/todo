import { createContext, useContext, type ReactNode } from "react";
import type { Doc, Id } from "@todo/backend/dataModel";

export type Area = "me" | "agency" | "work";
export type Task = Doc<"tasks"> & { isDeferred?: boolean; isDue?: boolean; isOverdue?: boolean };
export type View = "priority" | Area | "habits" | "history" | "settings";
export const areas: Area[] = ["me", "agency", "work"];
export const areaLabels: Record<Area, string> = {
  me: "Für mich",
  agency: "Meine Firma",
  work: "Mein Job",
};

type TaskActions = {
  connected: boolean;
  pending: Set<string>;
  run: <T>(key: string, operation: () => Promise<T>, success?: string) => Promise<T | undefined>;
  complete: (task: Task) => void;
  clearInbox: (task: Task) => void;
  reorder: (tasks: Task[], task: Task, direction: -1 | 1) => void;
  edit: (task: Task) => void;
  addSubtask: (taskId: Id<"tasks">, title: string) => Promise<boolean>;
  toggleAi: (task: Task) => void;
  togglePriority: (task: Task) => void;
};
const TaskContext = createContext<TaskActions | null>(null);
export function TaskActionsProvider({
  value,
  children,
}: {
  value: TaskActions;
  children: ReactNode;
}) {
  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}
export function useTaskActions() {
  const value = useContext(TaskContext);
  if (!value) throw new Error("Aufgabenaktionen fehlen.");
  return value;
}
