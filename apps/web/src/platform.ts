import {
  cloudUrlFromSite,
  createTokenProvider,
  loginDevice,
  NativeApiError,
  parseConnection,
  revokeDevice,
  type Connection,
  type TokenProvider,
} from "@todo/native-client";
import { PlatformError, type Platform, type PlatformState } from "@todo/ui/platform";
import { beginLogin, LOGIN_KEY, type Callback, type ShooProof } from "./auth";

/** The device key and its backend, as JSON `{ siteUrl, apiKey }` (see parseConnection). */
export const CONNECTION_KEY = "todo.connection";

/** The browser's Platform. `busy` is true while a Shoo code is exchanged for a device key. */
export type WebPlatform = Platform & { readonly busy: boolean };

/**
 * The browser shell: what the desktop main process does for the Mac window, with the device key
 * in localStorage. `siteUrl` is the checked CONVEX_SITE_URL of the build, `callback` the result
 * of takeCallback, exchanged right away; getState waits for that exchange.
 */
export function createWebPlatform({
  siteUrl,
  version,
  variant,
  callback,
}: {
  siteUrl: string;
  version: string;
  variant?: string;
  callback?: Callback;
}): WebPlatform {
  const appName = variant ? `todo ${variant}` : "todo";
  const deviceName = `${appName} ${/iPhone/.test(navigator.userAgent) ? "auf iPhone" : "im Browser"}`;
  const listeners = new Set<(state: PlatformState) => void>();
  let connection: Connection | null = null;
  let tokenProvider: TokenProvider | null = null;
  let stateError: string | undefined;
  let busy = false;
  let rejectLogin: ((cause: PlatformError) => void) | undefined;

  function publicState(): PlatformState {
    return {
      configured: connection !== null,
      version,
      ...(variant ? { variant } : {}),
      ...(connection
        ? { siteUrl: connection.siteUrl, cloudUrl: cloudUrlFromSite(connection.siteUrl) }
        : {}),
      ...(stateError ? { error: stateError } : {}),
    };
  }

  function emit() {
    const state = publicState();
    for (const listener of listeners) listener(state);
  }

  // Asks the browser not to evict the key under storage pressure. Idempotent; Safari decides.
  function keepStorage() {
    void navigator.storage?.persist?.().catch(() => {});
  }

  // Same steps as the desktop login: exchange, check the new key, store it, then revoke the
  // replaced key. A key that is not stored is revoked, so it does not count toward the limit.
  async function exchange(proof: ShooProof) {
    busy = true;
    try {
      const device = await loginDevice(siteUrl, { ...proof, deviceName });
      const candidate: Connection = { siteUrl, apiKey: device.key };
      try {
        const provider = createTokenProvider(candidate);
        if (!(await provider({ forceRefreshToken: true })))
          throw new PlatformError(
            "Der neue Geräteschlüssel wurde nicht angenommen. Melde dich erneut an.",
          );
        try {
          localStorage.setItem(CONNECTION_KEY, JSON.stringify(candidate));
        } catch {
          throw new PlatformError(
            "Die Verbindung konnte auf diesem Gerät nicht gespeichert werden.",
          );
        }
        const previous = connection;
        connection = candidate;
        tokenProvider = provider;
        stateError = undefined;
        if (previous && previous.apiKey !== candidate.apiKey)
          void revokeDevice(previous).catch(() => {});
        keepStorage();
      } catch (cause) {
        if (connection !== candidate) void revokeDevice(candidate).catch(() => {});
        throw cause;
      }
    } catch (cause) {
      stateError = loginErrorMessage(cause);
    } finally {
      busy = false;
    }
  }

  const stored = localStorage.getItem(CONNECTION_KEY);
  if (stored) {
    try {
      const parsed = parseConnection(stored);
      // A key for another backend is useless here (and blocked by the CSP).
      if (parsed.siteUrl === siteUrl) {
        connection = parsed;
        tokenProvider = createTokenProvider(parsed);
        keepStorage();
      } else localStorage.removeItem(CONNECTION_KEY);
    } catch {
      localStorage.removeItem(CONNECTION_KEY);
      stateError =
        "Die gespeicherte Verbindung konnte nicht geöffnet werden. Melde dich erneut an.";
    }
  }
  let ready = Promise.resolve();
  if (callback && "proof" in callback) ready = exchange(callback.proof);
  // A stray callback while signed in is a back swipe into Shoo after the login: ignore it.
  else if (callback && !(callback.orphan && connection)) stateError = callback.error;

  async function cancelLogin() {
    localStorage.removeItem(LOGIN_KEY);
    rejectLogin?.(new PlatformError("Die Anmeldung wurde abgebrochen."));
    rejectLogin = undefined;
  }
  // Back from Shoo through the back-forward cache: the page that waited for the login returns
  // with its old state, while a callback page may have stored a new key and revoked the old one
  // since. Drop the pending login and reload, so the state comes fresh from storage.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    localStorage.removeItem(LOGIN_KEY);
    location.reload();
  });

  return {
    kind: "web",
    get busy() {
      return busy;
    },
    getState: async () => {
      await ready;
      return publicState();
    },
    onState: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // The page leaves for Shoo and comes back on /auth/callback as a new page load, so this only
    // ever settles through cancelLogin.
    login: async () => {
      let url: string;
      try {
        url = await beginLogin(siteUrl);
      } catch {
        throw new PlatformError("Die Anmeldung konnte nicht gestartet werden.");
      }
      const waiting = new Promise<PlatformState>((_, reject) => {
        rejectLogin = reject;
      });
      window.location.assign(url);
      return waiting;
    },
    cancelLogin,
    disconnect: async () => {
      if (busy) throw new PlatformError("Warte, bis die Anmeldung abgeschlossen ist.");
      // Best effort: an unreachable backend must not keep the key on this device.
      if (connection) await revokeDevice(connection).catch(() => {});
      localStorage.clear();
      connection = null;
      tokenProvider = null;
      stateError = undefined;
      emit();
      return publicState();
    },
    fetchAccessToken: async (options) => {
      if (!tokenProvider) return null;
      try {
        const token = await tokenProvider(options);
        stateError = token
          ? undefined
          : "Der Geräteschlüssel ist abgelaufen oder wurde widerrufen. Melde dich erneut an.";
        if (!token) emit();
        return token;
      } catch {
        throw new PlatformError(
          "Die Aufgaben sind gerade nicht erreichbar. Prüfe deine Verbindung.",
        );
      }
    },
  };
}

// Login errors shown on the login screen. NativeApiError messages are German and never echo a
// credential; for the exchange they are the backend's own text, e.g. the missing
// SHOO_OWNER_SUBJECTS entry (403) or the 30-active-keys limit (400).
function loginErrorMessage(cause: unknown) {
  if (cause instanceof PlatformError || cause instanceof NativeApiError) return cause.message;
  return "Die Anmeldung ist fehlgeschlagen. Prüfe deine Internetverbindung und versuche es erneut.";
}
