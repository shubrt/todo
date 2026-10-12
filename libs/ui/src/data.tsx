import { api } from "@todo/backend/api";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { safeError } from "./errors";
import { useApp, type ListRef } from "./store";

/** A list with its `openCount`, as returned by lists.list (sidebar order). */
export type List = FunctionReturnType<typeof api.lists.list>[number];
export type ListKind = List["kind"];
/** A decorated task row: list, section and urgency flags; subtasks inherit list and section. */
export type Task = FunctionReturnType<typeof api.tasks.list>[number];
export type Recurrence = FunctionReturnType<typeof api.recurrences.list>[number];
export type Completion = FunctionReturnType<typeof api.completions.list>["items"][number];
export type Settings = FunctionReturnType<typeof api.settings.get>;
/** The owner's day for date labels: `today` is the local date in the account time zone. */
export type Day = { today: string; timeZone: string };

export const useLists = () => useQuery(api.lists.list, {});
export const useSettings = () => useQuery(api.settings.get, {});

/** Today and time zone from settings.get; undefined while loading. */
export function useDay(): Day | undefined {
  const settings = useSettings();
  return settings && { today: settings.currentLocalDate, timeZone: settings.timeZone };
}

/** Lists shown in the sidebar, in their order; ⌘1..⌘9 open the first nine. */
export const favoritesOf = (lists: List[]) => lists.filter((list) => list.favorite);

/**
 * The list a ListRef points to, none before the start list; a deleted list falls back to the
 * first favorite.
 */
export function resolveList(lists: List[], ref: ListRef | null) {
  if (!ref) return undefined;
  if ("kind" in ref) return lists.find((list) => list.kind === ref.kind);
  return lists.find((list) => list._id === ref.id) ?? favoritesOf(lists)[0] ?? lists[0];
}

/**
 * The list the app starts on: the first favorite, else the default list, else Wichtig.
 * Undefined until lists, and without favorites the settings, are loaded.
 */
export function startList(
  lists: List[] | undefined,
  settings: Settings | undefined,
): ListRef | undefined {
  if (!lists) return undefined;
  const favorite = favoritesOf(lists)[0];
  if (favorite) return { id: favorite._id };
  if (!settings) return undefined;
  const fallback = lists.find((list) => list._id === settings.defaultListId);
  return fallback ? { id: fallback._id } : { kind: "important" };
}

/** The open list, once lists are loaded and the start list is known. */
export function useCurrentList() {
  const lists = useLists();
  const current = useApp((state) => state.current);
  return lists && resolveList(lists, current);
}

export type WriteResult<T> = { ok: true; value: T } | { ok: false };
/**
 * Runs a mutation unless a write with the same `key` is still in flight. Refuses while the
 * websocket is down. Failures show an error toast unless `silent`; there are no success toasts.
 */
export type Write = <T>(
  key: string,
  action: () => Promise<T>,
  options?: { silent?: boolean },
) => Promise<WriteResult<T>>;

const WriteContext = createContext<Write | null>(null);
export const offlineMessage = "Keine Verbindung. Warte kurz, bis sie wieder steht.";

export function useWrite() {
  const write = useContext(WriteContext);
  if (!write) throw new Error("Session fehlt.");
  return write;
}

/**
 * The signed-in session: provides useWrite and runs lists.bootstrap (seeds lists, migrates
 * legacy data) before rendering `children`; `loading` shows until then. A failed bootstrap
 * shows `failed` with the reason and a retry, and retries by itself on the next reconnect.
 * Writes in flight belong to this session's client: a new client starts with none.
 */
export function Session({
  children,
  loading,
  failed,
}: {
  children: ReactNode;
  loading: ReactNode;
  failed: (message: string, retry: () => void) => ReactNode;
}) {
  const connection = useConvexConnectionState();
  const connected = useRef(connection.isWebSocketConnected);
  useLayoutEffect(() => {
    connected.current = connection.isWebSocketConnected;
  }, [connection.isWebSocketConnected]);
  // A closed client never settles its writes, so this set must not outlive the session.
  const pending = useRef(new Set<string>());
  const write = useCallback<Write>(async (key, action, options = {}) => {
    const { showError } = useApp.getState();
    if (pending.current.has(key)) return { ok: false };
    if (!connected.current) {
      if (!options.silent) showError(offlineMessage);
      return { ok: false };
    }
    pending.current.add(key);
    try {
      return { ok: true, value: await action() };
    } catch (cause) {
      if (!options.silent) showError(safeError(cause));
      return { ok: false };
    } finally {
      pending.current.delete(key);
    }
  }, []);

  const bootstrap = useMutation(api.lists.bootstrap);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (ready) return;
    let active = true;
    void bootstrap({}).then(
      () => {
        if (active) setReady(true);
      },
      (cause: unknown) => {
        // The client queues mutations while offline, so a rejection is a server-side failure.
        if (active) setFailure(safeError(cause, bootstrapFailed));
      },
    );
    return () => {
      active = false;
    };
  }, [bootstrap, ready, connection.connectionCount, attempt]);
  const retry = () => {
    setFailure(undefined);
    setAttempt((count) => count + 1);
  };

  return (
    <WriteContext.Provider value={write}>
      {ready ? children : failure ? failed(failure, retry) : loading}
    </WriteContext.Provider>
  );
}

const bootstrapFailed = "Deine Listen konnten nicht geladen werden.";

export type SyncStatus = "ok" | "wait" | "off";
export const syncLabels: Record<SyncStatus, string> = {
  ok: "Synchronisiert",
  wait: "Wird gespeichert …",
  off: "Offline",
};

/**
 * The title bar dot: `wait` while a request has been in flight for more than 1s or the
 * websocket dropped less than 3s ago, `off` once it has been down for 3s. Writes are locked
 * as soon as the websocket drops (see Session), already while the dot is still yellow.
 */
export function useSyncStatus(): SyncStatus {
  const { isWebSocketConnected: connected, timeOfOldestInflightRequest: oldest } =
    useConvexConnectionState();
  const [droppedAt, setDroppedAt] = useState(() => (connected ? null : Date.now()));
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    setDroppedAt((previous) => (connected ? null : (previous ?? Date.now())));
  }, [connected]);
  const now = Date.now();
  const offFor = connected ? 0 : now - (droppedAt ?? now);
  const waitingFor = oldest ? now - oldest.getTime() : 0;
  const status: SyncStatus = !connected
    ? offFor >= 3000
      ? "off"
      : "wait"
    : waitingFor > 1000
      ? "wait"
      : "ok";
  // Nothing re-renders when time alone crosses a threshold, so schedule that render.
  const nextChange = !connected
    ? offFor < 3000
      ? 3000 - offFor
      : undefined
    : oldest && waitingFor <= 1000
      ? 1001 - waitingFor
      : undefined;
  useEffect(() => {
    if (nextChange === undefined) return;
    const timer = setTimeout(rerender, nextChange);
    return () => clearTimeout(timer);
  }, [nextChange]);
  return status;
}
