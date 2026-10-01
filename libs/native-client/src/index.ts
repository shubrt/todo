import type { Connection } from "@todo/contracts";

export type { Connection } from "@todo/contracts";

export interface TokenProviderOptions {
  forceRefreshToken: boolean;
}
export type TokenProvider = (options: TokenProviderOptions) => Promise<string | null>;

/**
 * Proof from the Shoo login that `loginDevice` exchanges for a key. `kind` defaults to
 * "device" (the app's own key); "integration" mints a key for a tool, named `deviceName`.
 */
export interface DeviceLogin {
  code: string;
  codeVerifier: string;
  deviceName: string;
  kind?: "device" | "integration";
}
/** A freshly created key. `key` is the secret and is only returned once. */
export interface DeviceKey {
  key: string;
  prefix: string;
  id: string;
}

export class NativeApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 0,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "NativeApiError";
  }
}

function invalidConnection(): never {
  throw new NativeApiError(
    "INVALID_CONNECTION",
    "Die Verbindungsdaten sind ungültig. Bitte melde dich erneut an.",
  );
}

export function normalizeSiteUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    invalidConnection();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.convex\.site$/.test(url.hostname) ||
    (input !== url.origin && input !== `${url.origin}/`)
  )
    invalidConnection();
  return url.origin;
}

export function cloudUrlFromSite(siteUrl: string): string {
  return normalizeSiteUrl(siteUrl).replace(/\.site$/, ".cloud");
}

const apiKeyPattern = /^todo_[A-Za-z0-9_-]{43}$/;

function validateConnection(value: unknown): Connection {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidConnection();
  const input = value as Record<string, unknown>;
  if (
    typeof input.siteUrl !== "string" ||
    typeof input.apiKey !== "string" ||
    !apiKeyPattern.test(input.apiKey) ||
    Object.keys(input).some((key) => !["siteUrl", "apiKey", "version"].includes(key)) ||
    (input.version !== undefined && input.version !== 1)
  )
    invalidConnection();
  return { siteUrl: normalizeSiteUrl(input.siteUrl), apiKey: input.apiKey };
}

/** Parses a stored connection, i.e. the JSON `{ siteUrl, apiKey }` kept in connection.enc. */
export function parseConnection(input: string): Connection {
  if (typeof input !== "string" || input.length > 4096) invalidConnection();
  try {
    return validateConnection(JSON.parse(input.trim()));
  } catch {
    invalidConnection();
  }
}

const messages: Record<string, string> = {
  UNAUTHENTICATED:
    "Der Geräteschlüssel ist abgelaufen oder wurde widerrufen. Bitte melde dich erneut an.",
  FORBIDDEN: "Diese Geräteverbindung hat keinen Zugriff.",
  CONFLICT: "Der angezeigte Stand ist veraltet. Bitte aktualisieren.",
  INVALID_INPUT: "Die Anfrage ist ungültig.",
  NOT_FOUND: "Der Eintrag ist nicht mehr verfügbar.",
  NOT_CONFIGURED: "Die Anmeldung ist im Backend noch nicht eingerichtet.",
};

interface RequestOptions {
  /** Sent as `Authorization: Bearer <apiKey>`. */
  apiKey?: string;
  timeoutMs?: number;
  /**
   * Keep the backend's own error message instead of the generic one. Only for requests that
   * carry no credential the backend could echo back (the login exchange).
   */
  serverMessages?: boolean;
}

// Calls the Convex HTTP site. Errors become NativeApiError with a known code and a German message.
async function request(
  siteUrl: string,
  path: string,
  init: RequestInit = {},
  { apiKey, timeoutMs = 15_000, serverMessages = false }: RequestOptions = {},
): Promise<unknown> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);
    if (init.body) headers.set("content-type", "application/json");
    const response = await fetch(`${siteUrl}${path}`, {
      ...init,
      headers,
      signal: abort.signal,
      redirect: "error",
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      const error =
        detail.error && typeof detail.error === "object"
          ? (detail.error as Record<string, unknown>)
          : {};
      const code =
        response.status === 401
          ? "UNAUTHENTICATED"
          : typeof error.code === "string" && Object.hasOwn(messages, error.code)
            ? error.code
            : "HTTP_ERROR";
      const requestId =
        typeof detail.requestId === "string" &&
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(detail.requestId)
          ? detail.requestId
          : undefined;
      const serverMessage =
        serverMessages &&
        code !== "HTTP_ERROR" &&
        typeof error.message === "string" &&
        error.message.trim() &&
        error.message.length <= 1000
          ? error.message
          : undefined;
      throw new NativeApiError(
        code,
        serverMessage ?? messages[code] ?? "Das Backend ist momentan nicht erreichbar.",
        response.status,
        requestId,
      );
    }
    return body;
  } catch (error) {
    if (error instanceof NativeApiError) throw error;
    throw new NativeApiError(
      "NETWORK_ERROR",
      "Keine Verbindung zum Backend. Bitte erneut versuchen.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Exchanges a Shoo authorization code (plus its PKCE verifier) for a new key.
 * The backend's messages are kept: FORBIDDEN names the SHOO_OWNER_SUBJECTS entry to add.
 * The timeout outlasts the backend's own 15 s Shoo exchange, so a slow Shoo does not leave
 * a minted key behind that this device never received.
 */
export async function loginDevice(siteUrl: string, login: DeviceLogin): Promise<DeviceKey> {
  const result = (await request(
    normalizeSiteUrl(siteUrl),
    "/auth/desktop-login",
    {
      method: "POST",
      body: JSON.stringify({
        code: login.code,
        codeVerifier: login.codeVerifier,
        deviceName: login.deviceName,
        ...(login.kind ? { kind: login.kind } : {}),
      }),
    },
    { serverMessages: true, timeoutMs: 30_000 },
  )) as Record<string, unknown> | null;
  if (
    !result ||
    typeof result.key !== "string" ||
    !apiKeyPattern.test(result.key) ||
    typeof result.prefix !== "string" ||
    typeof result.id !== "string"
  )
    throw new NativeApiError(
      "INVALID_RESPONSE",
      "Das Backend hat keinen gültigen Geräteschlüssel geliefert.",
    );
  return { key: result.key, prefix: result.prefix, id: result.id };
}

/** Revokes the connection's own device key. Callers treat this as best effort. */
export async function revokeDevice(connection: Connection): Promise<void> {
  const verified = validateConnection(connection);
  const result = (await request(
    verified.siteUrl,
    "/auth/device-revoke",
    { method: "POST" },
    { apiKey: verified.apiKey, timeoutMs: 5_000 },
  )) as { revoked?: unknown } | null;
  if (result?.revoked !== true)
    throw new NativeApiError("INVALID_RESPONSE", "Der Widerruf wurde nicht bestätigt.");
}

export function createTokenProvider(connection: Connection): TokenProvider {
  const verified = validateConnection(connection);
  let cached: { token: string; expiresAt: number } | undefined;
  let pending: Promise<string | null> | undefined;
  return async ({ forceRefreshToken }) => {
    if (!forceRefreshToken && cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
    if (pending) return pending;
    pending = (async () => {
      try {
        const result = await request(
          verified.siteUrl,
          "/auth/device-token",
          { method: "POST" },
          { apiKey: verified.apiKey },
        );
        const body = result as { token?: unknown; expiresAt?: unknown } | null;
        if (
          !body ||
          typeof body.token !== "string" ||
          body.token.length > 16_384 ||
          !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body.token) ||
          typeof body.expiresAt !== "number" ||
          !Number.isFinite(body.expiresAt) ||
          body.expiresAt <= Date.now()
        )
          throw new NativeApiError(
            "INVALID_RESPONSE",
            "Das Backend hat keine gültige Geräteanmeldung geliefert.",
          );
        cached = { token: body.token, expiresAt: body.expiresAt };
        return cached.token;
      } catch (error) {
        cached = undefined;
        if (error instanceof NativeApiError && error.status === 401) return null;
        throw error;
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  };
}
