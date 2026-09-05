import { AppState } from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@todo/backend/api";
import { fetchHabitSnapshot, type Connection, type HabitSnapshot } from "@todo/native-client";
import {
  configureSurfaces,
  getSurfaceCapabilities,
  publishSnapshot,
  type SurfaceCapabilities,
} from "../../modules/todo-habit-surfaces";
import { readableError, snapshotIsNewer } from "./model";
import { RefreshQueue } from "./refresh-queue";

type Surfaces = {
  capabilities: SurfaceCapabilities | null;
  snapshot: HabitSnapshot | null;
  error: string;
  refreshing: boolean;
  refresh: () => Promise<boolean>;
};
const Context = createContext<Surfaces | null>(null);
const activeQueues = new Set<RefreshQueue>();

/** App calls this before clearing native credentials, including during account replacement. */
export async function stopSurfaceSync(): Promise<void> {
  const draining = [...activeQueues].map((queue) => queue.stop());
  await Promise.all(draining);
}

export function SurfaceProvider({
  connection,
  children,
}: {
  connection: Connection;
  children: ReactNode;
}) {
  const habits = useQuery(api.tasks.list, { view: "habits" });
  const settings = useQuery(api.settings.get, {});
  const [capabilities, setCapabilities] = useState<SurfaceCapabilities | null>(null);
  const [snapshot, setSnapshot] = useState<HabitSnapshot | null>(null);
  const current = useRef<HabitSnapshot | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const queue = useRef<RefreshQueue | null>(null);

  useEffect(() => {
    const worker = new RefreshQueue(async (isActive) => {
      if (!isActive()) return false;
      setRefreshing(true);
      try {
        const available = await getSurfaceCapabilities();
        if (!isActive()) return false;
        setCapabilities(available);
        // Capture before fetching: native code rejects publication after logout or replacement.
        const generation = available.nativeAvailable ? await configureSurfaces(connection) : null;
        if (!isActive()) return false;
        const next = await fetchHabitSnapshot(connection);
        if (!isActive()) return false;
        if (snapshotIsNewer(next, current.current)) {
          current.current = next;
          setSnapshot(next);
          if (generation !== null) await publishSnapshot(next, generation);
        }
        if (!isActive()) return false;
        setError("");
        return true;
      } catch (failure) {
        if (isActive()) setError(readableError(failure));
        return false;
      } finally {
        if (isActive()) setRefreshing(false);
      }
    });
    queue.current = worker;
    activeQueues.add(worker);
    return () => {
      if (queue.current === worker) queue.current = null;
      void worker.stop().finally(() => activeQueues.delete(worker));
    };
  }, [connection]);

  const refresh = useCallback(async () => (await queue.current?.request()) ?? false, []);
  const version = habits?.map((habit) => `${habit._id}:${habit.updatedAt}`).join("|");
  useEffect(() => {
    if (version !== undefined) void refresh();
  }, [version, settings?.timeZone, settings?.currentLocalDate, refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  useEffect(() => {
    if (!snapshot) return;
    const delay = Math.max(1000, snapshot.nextResetAt - Date.now() + 1500);
    const timer = setTimeout(() => void refresh(), Math.min(delay, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [snapshot, refresh]);

  return (
    <Context.Provider value={{ capabilities, snapshot, error, refreshing, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function useSurfaces(): Surfaces {
  const value = useContext(Context);
  if (!value) throw new Error("SurfaceProvider missing");
  return value;
}
