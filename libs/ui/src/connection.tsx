import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import type { Platform, PlatformState } from "./platform";

type PlatformContextValue = {
  platform: Platform;
  state: PlatformState | null;
  error: string | null;
  update: (value: PlatformState) => void;
  reconnect: () => void;
};
const PlatformContext = createContext<PlatformContextValue | null>(null);

/** Message when the first getState fails: the window or page could not reach its shell. */
const unreachable: Record<Platform["kind"], string> = {
  mac: "Das Fenster konnte nicht verbunden werden. Starte todo erneut.",
  web: "todo konnte nicht geladen werden. Lade die Seite neu.",
};

/** Holds the shell's Platform and its live state for everything below it. */
export function PlatformProvider({
  platform,
  children,
}: {
  platform: Platform;
  children: ReactNode;
}) {
  const [state, setState] = useState<PlatformState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const unsubscribe = platform.onState((next) => {
      if (active) setState(next);
    });
    void platform
      .getState()
      .then((next) => {
        if (active) {
          setState(next);
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError(unreachable[platform.kind]);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [platform, retry]);
  return (
    <PlatformContext.Provider
      value={{
        platform,
        state,
        error,
        update: setState,
        reconnect: () => setRetry((value) => value + 1),
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  const context = useContext(PlatformContext);
  if (!context) throw new Error("Platform-Provider fehlt.");
  return context;
}

/** Setter for the outcome of the last token fetch, provided by ConnectedProvider. */
const TokenRejectedContext = createContext<{
  rejected: boolean;
  setRejected: (rejected: boolean) => void;
} | null>(null);

/**
 * Whether the shell refused the device key on the last token fetch (no token, as
 * opposed to an unreachable server). Signed out for that reason, the window asks for a new
 * login; for any other failure it offers to reconnect.
 */
export function useTokenRejected() {
  return useContext(TokenRejectedContext)?.rejected ?? false;
}

function useDeviceAuth() {
  const { platform, state } = usePlatform();
  const setRejected = useContext(TokenRejectedContext)?.setRejected;
  const fetchAccessToken = useCallback(
    async (options: { forceRefreshToken: boolean }) => {
      try {
        const token = await platform.fetchAccessToken(options);
        setRejected?.(token === null);
        return token;
      } catch {
        // Offline or the server is down: the key may still be fine.
        setRejected?.(false);
        return null;
      }
    },
    [platform, setRejected],
  );
  return { isLoading: !state, isAuthenticated: Boolean(state?.configured), fetchAccessToken };
}

export function ConnectedProvider({
  cloudUrl,
  children,
}: {
  cloudUrl: string;
  children: ReactNode;
}) {
  const [client] = useState(() => new ConvexReactClient(cloudUrl));
  const [rejected, setRejected] = useState(false);
  useEffect(
    () => () => {
      // ConvexProviderWithAuth clears auth in its child cleanup. Let that finish
      // before closing the shared client when this provider is replaced.
      queueMicrotask(() => {
        void client.close();
      });
    },
    [client],
  );
  return (
    <TokenRejectedContext.Provider value={{ rejected, setRejected }}>
      <ConvexProviderWithAuth client={client} useAuth={useDeviceAuth}>
        {children}
      </ConvexProviderWithAuth>
    </TokenRejectedContext.Provider>
  );
}
