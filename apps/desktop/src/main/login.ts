import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { normalizeSiteUrl } from "@todo/native-client";

// Shoo login through the system browser. Shoo only knows the stable HTTPS redirect on the Convex
// site (<site>/auth/desktop/callback); that endpoint bounces the browser to the loopback listener
// started here. The port travels in `state`, the PKCE verifier never leaves this process.

export const SHOO_AUTHORIZE_URL = "https://shoo.dev/authorize";
export const LOGIN_TIMEOUT_MS = 10 * 60_000;

/** Login failures whose German message is safe to show as is. */
export class LoginError extends Error {
  override name = "LoginError";
}

/** Validates the build-time CONVEX_SITE_URL. */
export function resolveSiteUrl(value: string): string {
  try {
    return normalizeSiteUrl(value);
  } catch {
    throw new LoginError(
      "CONVEX_SITE_URL fehlt oder ist ungültig. Trage die convex.site-Adresse in die .env im Repository ein und baue die App neu.",
    );
  }
}

export interface LoginRequest {
  state: string;
  codeVerifier: string;
  authorizeUrl: string;
}

/** PKCE values and the Shoo authorize URL for a loopback listener on `port`. */
export function createLoginRequest(siteUrl: string, port: number): LoginRequest {
  const codeVerifier = randomBytes(48).toString("base64url");
  const state = `${port}.${randomBytes(32).toString("base64url")}`;
  const url = new URL(SHOO_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: `origin:${siteUrl}`,
    redirect_uri: `${siteUrl}/auth/desktop/callback`,
    response_type: "code",
    state,
    code_challenge: createHash("sha256").update(codeVerifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return { state, codeVerifier, authorizeUrl: url.toString() };
}

/**
 * Starts a listener on 127.0.0.1, opens the authorize URL and waits for the matching callback.
 * `signal` cancels; the wait also ends after `timeoutMs`. The listener is always closed.
 */
export async function loopbackLogin({
  siteUrl,
  openBrowser,
  signal,
  timeoutMs = LOGIN_TIMEOUT_MS,
}: {
  siteUrl: string;
  openBrowser: (url: string) => Promise<void>;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<ShooProof> {
  const server = createServer();
  const done = new AbortController();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    const { port } = server.address() as AddressInfo;
    const request = createLoginRequest(siteUrl, port);
    const callback = waitForCallback(
      server,
      request.state,
      AbortSignal.any([signal, done.signal, AbortSignal.timeout(timeoutMs)]),
    );
    const [, code] = await Promise.all([
      openBrowser(request.authorizeUrl).catch(() => {
        throw new LoginError("Der Browser konnte nicht geöffnet werden.");
      }),
      callback,
    ]);
    return { code, codeVerifier: request.codeVerifier };
  } finally {
    done.abort();
    server.close();
    server.closeAllConnections();
  }
}

/** Code and PKCE verifier from a finished browser login, ready for `loginDevice`. */
export type ShooProof = { code: string; codeVerifier: string };

/**
 * Runs one Shoo browser login at a time. The app's own login and the creation of integration
 * keys share it, and with it one cancel. `cancel()` ends the wait for the browser. A cancel that
 * arrives after the browser came back does not cut off the code exchange, since the backend would
 * still mint a key nobody receives; `task` calls `checkCancelled` once it holds the result.
 */
export class ShooLogin {
  #abort: AbortController | null = null;
  readonly #openBrowser: (url: string) => Promise<void>;

  constructor(openBrowser: (url: string) => Promise<void>) {
    this.#openBrowser = openBrowser;
  }

  get active(): boolean {
    return this.#abort !== null;
  }

  cancel() {
    this.#abort?.abort();
  }

  async run<T>(
    siteUrl: string,
    task: (proof: ShooProof, checkCancelled: () => void) => Promise<T>,
  ): Promise<T> {
    if (this.#abort) throw new LoginError("Eine Anmeldung läuft bereits.");
    const abort = new AbortController();
    this.#abort = abort;
    const checkCancelled = () => {
      if (abort.signal.aborted) throw new LoginError("Die Anmeldung wurde abgebrochen.");
    };
    try {
      const proof = await loopbackLogin({
        siteUrl,
        openBrowser: this.#openBrowser,
        signal: abort.signal,
      });
      checkCancelled();
      return await task(proof, checkCancelled);
    } finally {
      this.#abort = null;
    }
  }
}

// Resolves with the authorization code from GET /callback?state=<state>&code=…
// Unparsable targets and foreign states get 400, other paths 404; all keep the wait going.
// The handler must never throw: it runs in the Electron main process, where an uncaught
// exception opens a blocking error dialog.
function waitForCallback(server: Server, state: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const expected = Buffer.from(state);
    const finish = (settle: () => void) => {
      signal.removeEventListener("abort", aborted);
      server.off("request", handle);
      settle();
    };
    const aborted = () =>
      finish(() =>
        reject(
          new LoginError(
            signal.reason instanceof DOMException && signal.reason.name === "TimeoutError"
              ? "Die Anmeldung ist abgelaufen. Bitte versuche es erneut."
              : "Die Anmeldung wurde abgebrochen.",
          ),
        ),
      );
    const handle = (request: IncomingMessage, response: ServerResponse) => {
      const url = URL.parse(request.url ?? "/", "http://127.0.0.1");
      if (!url) return reply(response, 400, "Ungültige Anfrage.");
      if (request.method !== "GET" || url.pathname !== "/callback")
        return reply(response, 404, "Nicht gefunden.");
      const received = Buffer.from(url.searchParams.get("state") ?? "");
      if (received.length !== expected.length || !timingSafeEqual(received, expected))
        return reply(response, 400, "Diese Anmeldung gehört nicht zu todo.");
      const code = url.searchParams.get("code");
      if (url.searchParams.has("error") || !code)
        return reply(
          response,
          400,
          "Die Anmeldung ist fehlgeschlagen. Du kannst diesen Tab schließen und es in todo erneut versuchen.",
          () =>
            finish(() =>
              reject(new LoginError("Shoo hat die Anmeldung nicht bestätigt. Versuche es erneut.")),
            ),
        );
      reply(response, 200, "Anmeldung abgeschlossen. Du kannst diesen Tab schließen.", () =>
        finish(() => resolve(code)),
      );
    };
    if (signal.aborted) return aborted();
    signal.addEventListener("abort", aborted, { once: true });
    server.on("request", handle);
  });
}

// Answers with a tiny self-contained page. `sent` runs once the response is done (or the browser
// dropped the connection), so closing the listener afterwards never cuts the page off.
function reply(response: ServerResponse, status: number, message: string, sent?: () => void) {
  if (sent) response.once("close", sent);
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    connection: "close",
  });
  response.end(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>todo</title><style>html{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fff;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}p{max-width:420px;margin:0;padding:24px}</style></head><body><p>${message}</p></body></html>`,
  );
}
