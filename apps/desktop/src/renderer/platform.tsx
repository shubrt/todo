import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import type { PublicDesktopState } from "../shared/contracts";

type PlatformState = {
  state: PublicDesktopState | null;
  error: string | null;
  update: (value: PublicDesktopState) => void;
  reconnect: () => void;
};
const PlatformContext = createContext<PlatformState | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PublicDesktopState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (!window.desktop) {
      setError("Öffne todo als Desktop-App, um deine Aufgaben zu verbinden.");
      return;
    }
    const unsubscribe = window.desktop.onState((next) => {
      if (active) setState(next);
    });
    void window.desktop
      .getState()
      .then((next) => {
        if (active) {
          setState(next);
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError("Das Fenster konnte nicht verbunden werden. Starte todo erneut.");
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [retry]);
  return (
    <PlatformContext.Provider
      value={{ state, error, update: setState, reconnect: () => setRetry((value) => value + 1) }}
    >
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  const context = useContext(PlatformContext);
  if (!context) throw new Error("Desktop-Provider fehlt.");
  return context;
}

/** Setter for the outcome of the last token fetch, provided by ConnectedProvider. */
const TokenRejectedContext = createContext<{
  rejected: boolean;
  setRejected: (rejected: boolean) => void;
} | null>(null);

/**
 * Whether the main process refused the device key on the last token fetch (no token, as
 * opposed to an unreachable server). Signed out for that reason, the window asks for a new
 * login; for any other failure it offers to reconnect.
 */
export function useTokenRejected() {
  return useContext(TokenRejectedContext)?.rejected ?? false;
}

function useDeviceAuth() {
  const { state } = usePlatform();
  const setRejected = useContext(TokenRejectedContext)?.setRejected;
  const fetchAccessToken = useCallback(
    async (options: { forceRefreshToken: boolean }) => {
      try {
        const token = await window.desktop.fetchAccessToken(options);
        setRejected?.(token === null);
        return token;
      } catch {
        // Offline or the server is down: the key may still be fine.
        setRejected?.(false);
        return null;
      }
    },
    [setRejected],
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
