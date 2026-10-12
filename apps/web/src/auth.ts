// Shoo login from the browser. Shoo only knows the stable redirect on the Convex site
// (<site>/auth/desktop/callback); a state of "web.<43 base64url>" makes that endpoint bounce the
// browser to <web app>/auth/callback. The PKCE verifier waits in localStorage for the round trip.

export const SHOO_AUTHORIZE_URL = "https://shoo.dev/authorize";
/** The pending login, single use: written by beginLogin, removed by takeCallback or a cancel. */
export const LOGIN_KEY = "todo.login";
const LOGIN_TIMEOUT_MS = 10 * 60_000;

type PendingLogin = { state: string; codeVerifier: string; expiresAt: number };

/** Code and PKCE verifier from a finished Shoo login, ready for `loginDevice`. */
export type ShooProof = { code: string; codeVerifier: string };

/**
 * What came back on /auth/callback: the proof to exchange, or why there is none. `orphan` marks
 * a callback without a pending login: one started in another window or in Safari, or a back
 * swipe into Shoo after the login already finished.
 */
export type Callback = { proof: ShooProof } | { error: string; orphan?: true };

// Base64url without padding. Uint8Array.toBase64 needs Safari 18.2; the minimum is iOS 17.4.
function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const randomBase64url = (bytes: number) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

/** The S256 code challenge of a PKCE verifier (RFC 7636). */
export async function codeChallenge(codeVerifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  return base64url(new Uint8Array(digest));
}

/**
 * Stores a new pending login (replacing an older one) and returns the Shoo authorize URL. The
 * parameters match the desktop login, so Shoo sees the same client and the same account.
 */
export async function beginLogin(siteUrl: string): Promise<string> {
  const codeVerifier = randomBase64url(48);
  const state = `web.${randomBase64url(32)}`;
  const url = new URL(SHOO_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: `origin:${siteUrl}`,
    redirect_uri: `${siteUrl}/auth/desktop/callback`,
    response_type: "code",
    state,
    code_challenge: await codeChallenge(codeVerifier),
    code_challenge_method: "S256",
  }).toString();
  const pending: PendingLogin = { state, codeVerifier, expiresAt: Date.now() + LOGIN_TIMEOUT_MS };
  localStorage.setItem(LOGIN_KEY, JSON.stringify(pending));
  return url.toString();
}

function readPending(): PendingLogin | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LOGIN_KEY) ?? "null");
    if (!value || typeof value !== "object") return undefined;
    const { state, codeVerifier, expiresAt } = value as Record<string, unknown>;
    if (typeof state !== "string" || typeof codeVerifier !== "string") return undefined;
    if (typeof expiresAt !== "number") return undefined;
    return { state, codeVerifier, expiresAt };
  } catch {
    return undefined;
  }
}

/**
 * Reads the Shoo result on /auth/callback; undefined on any other page. Before anything else it
 * takes the code out of the address bar and history and consumes the pending login.
 */
export function takeCallback(
  location: Pick<Location, "pathname" | "search">,
): Callback | undefined {
  if (location.pathname !== "/auth/callback") return undefined;
  const params = new URLSearchParams(location.search);
  history.replaceState(null, "", "/");
  const pending = readPending();
  localStorage.removeItem(LOGIN_KEY);
  if (!pending)
    return {
      error: "Diese Anmeldung wurde in einem anderen Fenster gestartet. Starte sie in todo erneut.",
      orphan: true,
    };
  if (pending.expiresAt <= Date.now())
    return { error: "Die Anmeldung ist abgelaufen. Bitte versuche es erneut." };
  if (params.get("state") !== pending.state)
    return { error: "Diese Anmeldung gehört nicht zu todo." };
  const code = params.get("code");
  if (params.has("error") || !code)
    return { error: "Shoo hat die Anmeldung nicht bestätigt. Versuche es erneut." };
  return { proof: { code, codeVerifier: pending.codeVerifier } };
}
