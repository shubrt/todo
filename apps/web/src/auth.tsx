import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Session = { authenticated: boolean; csrfToken?: string; configured?: boolean; error?: string };
type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  configured: boolean;
  error: string | null;
  fetchAccessToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>;
  logout: () => Promise<void>;
  retry: () => void;
};
const AuthContext = createContext<AuthState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const token = useRef<{ token: string; expiresAt: number } | null>(null);
  const pending = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    token.current = null;
    setSession(null);
    setError(null);
    void fetch("/api/auth/session", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as Session;
        if (!response.ok && response.status !== 401 && response.status !== 503)
          throw new Error("Die Anmeldung konnte nicht geprüft werden.");
        setSession(result);
        if (result.error) setError(result.error);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setSession({ authenticated: false });
          setError(
            cause instanceof Error ? cause.message : "Die Anmeldung ist gerade nicht erreichbar.",
          );
        }
      });
    return () => controller.abort();
  }, [attempt]);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!session?.authenticated || !session.csrfToken) return null;
      if (!forceRefreshToken && token.current && token.current.expiresAt > Date.now() + 30_000)
        return token.current.token;
      if (pending.current) return pending.current;
      pending.current = (async () => {
        try {
          const response = await fetch("/api/auth/token", {
            method: "POST",
            credentials: "same-origin",
            headers: { "x-csrf-token": session.csrfToken! },
          });
          if (response.status === 401) {
            token.current = null;
            setSession({ authenticated: false });
            setError("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
            return null;
          }
          if (!response.ok) throw new Error("Die Verbindung konnte nicht authentifiziert werden.");
          token.current = (await response.json()) as { token: string; expiresAt: number };
          setError(null);
          return token.current.token;
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Die Verbindung ist gerade nicht erreichbar.",
          );
          return null;
        } finally {
          pending.current = null;
        }
      })();
      return pending.current;
    },
    [session],
  );

  const logout = useCallback(async () => {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-csrf-token": session?.csrfToken ?? "" },
    });
    if (!response.ok) throw new Error("Abmelden fehlgeschlagen. Bitte versuche es erneut.");
    token.current = null;
    setSession({ authenticated: false });
    window.location.assign("/");
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        isLoading: session === null,
        isAuthenticated: session?.authenticated ?? false,
        configured: session?.configured !== false,
        error,
        fetchAccessToken,
        logout,
        retry: () => setAttempt((value) => value + 1),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useSessionAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("SessionProvider fehlt.");
  return context;
}
