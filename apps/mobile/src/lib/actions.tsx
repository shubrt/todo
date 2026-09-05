import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useConvexConnectionState, useMutation } from "convex/react";
import { api } from "@todo/backend/api";
import type { Id } from "@todo/backend/dataModel";
import { orderedMove, readableError, type Task } from "./model";

type Actions = {
  connected: boolean;
  pending: ReadonlySet<string>;
  message: string;
  clearMessage: () => void;
  run: <T>(
    key: string,
    operation: () => Promise<T>,
  ) => Promise<{ ok: true; value: T } | { ok: false }>;
  complete: (task: Task) => Promise<void>;
  moveOrder: (siblings: Task[], task: Task, offset: -1 | 1) => Promise<void>;
};
const Context = createContext<Actions | null>(null);

export function ActionsProvider({ children }: { children: ReactNode }) {
  const connection = useConvexConnectionState();
  const completeTask = useMutation(api.tasks.complete);
  const reorder = useMutation(api.tasks.reorder);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const active = useRef(new Set<string>());
  const [message, setMessage] = useState("");
  const run = useCallback(
    async <T,>(
      key: string,
      operation: () => Promise<T>,
    ): Promise<{ ok: true; value: T } | { ok: false }> => {
      if (active.current.has(key)) return { ok: false };
      if (!connection.isWebSocketConnected) {
        setMessage("Die Verbindung wird wiederhergestellt. Versuche es gleich noch einmal.");
        return { ok: false };
      }
      active.current.add(key);
      setPending(new Set(active.current));
      setMessage("");
      try {
        return { ok: true, value: await operation() };
      } catch (error) {
        setMessage(readableError(error));
        return { ok: false };
      } finally {
        active.current.delete(key);
        setPending(new Set(active.current));
      }
    },
    [connection.isWebSocketConnected],
  );
  const complete = useCallback(
    async (task: Task) => {
      if (task.state !== "open") return;
      await run(task._id, () =>
        completeTask({
          taskId: task._id,
          ...(task.occurrenceKey ? { occurrenceKey: task.occurrenceKey } : {}),
        }),
      );
    },
    [completeTask, run],
  );
  const moveOrder = useCallback(
    async (siblings: Task[], task: Task, offset: -1 | 1) => {
      const ids = orderedMove(siblings, task._id, offset);
      if (ids)
        await run(task._id, () =>
          reorder({
            taskIds: ids as Id<"tasks">[],
            ...(task.parentId
              ? { parentId: task.parentId }
              : { kind: task.kind, area: task.area, list: task.list }),
          }),
        );
    },
    [reorder, run],
  );
  return (
    <Context.Provider
      value={{
        connected: connection.isWebSocketConnected,
        pending,
        run,
        complete,
        moveOrder,
        message,
        clearMessage: () => setMessage(""),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useActions(): Actions {
  const value = useContext(Context);
  if (!value) throw new Error("ActionsProvider missing");
  return value;
}
