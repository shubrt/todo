import { habitSnapshotSchema, type Connection, type HabitSnapshot } from "@todo/contracts";

export type { Connection, HabitSnapshot, HabitSnapshotItem } from "@todo/contracts";

export interface TokenProviderOptions {
  forceRefreshToken: boolean;
}
export type TokenProvider = (options: TokenProviderOptions) => Promise<string | null>;

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
    "Bitte eine gültige Geräteverbindung aus den Web-Einstellungen verwenden.",
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

function validateConnection(value: unknown): Connection {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidConnection();
  const input = value as Record<string, unknown>;
  if (
    typeof input.siteUrl !== "string" ||
    typeof input.apiKey !== "string" ||
    !/^todo_[A-Za-z0-9_-]{43}$/.test(input.apiKey) ||
    Object.keys(input).some((key) => !["siteUrl", "apiKey", "version"].includes(key)) ||
    (input.version !== undefined && input.version !== 1)
  )
    invalidConnection();
  return { siteUrl: normalizeSiteUrl(input.siteUrl), apiKey: input.apiKey };
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) invalidConnection();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let bits = 0;
  let buffer = 0;
  let encoded = "";
  for (const character of value) {
    buffer = (buffer << 6) | alphabet.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      encoded += `%${((buffer >> bits) & 255).toString(16).padStart(2, "0")}`;
    }
  }
  return decodeURIComponent(encoded);
}

export function parseConnection(input: string): Connection {
  if (typeof input !== "string" || input.length > 4096) invalidConnection();
  try {
    let json = input.trim();
    if (!json.startsWith("{")) {
      const url = new URL(json);
      if (
        url.protocol !== "todo:" ||
        url.hostname !== "connect" ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
        (url.pathname !== "" && url.pathname !== "/") ||
        !url.hash
      )
        invalidConnection();
      const fragment = url.hash.slice(1);
      json =
        fragment.startsWith("%") || fragment.startsWith("{")
          ? decodeURIComponent(fragment)
          : decodeBase64Url(fragment);
    }
    return validateConnection(JSON.parse(json));
  } catch {
    invalidConnection();
  }
}

const messages: Record<string, string> = {
  UNAUTHENTICATED:
    "Der Geräteschlüssel ist abgelaufen oder wurde widerrufen. Bitte erneut verbinden.",
  FORBIDDEN: "Diese Geräteverbindung hat keinen Zugriff.",
  CONFLICT: "Der angezeigte Stand ist veraltet. Bitte aktualisieren.",
  INVALID_INPUT: "Die Anfrage ist ungültig.",
  NOT_FOUND: "Der Eintrag ist nicht mehr verfügbar.",
  NOT_CONFIGURED: "Die Anmeldung ist im Backend noch nicht eingerichtet.",
};

async function request(
  connection: Connection,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const verified = validateConnection(connection);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 15_000);
  try {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${verified.apiKey}`);
    if (init.body) headers.set("content-type", "application/json");
    const response = await fetch(`${verified.siteUrl}${path}`, {
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
      throw new NativeApiError(
        code,
        messages[code] ?? "Das Backend ist momentan nicht erreichbar.",
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

export function createTokenProvider(connection: Connection): TokenProvider {
  const verified = validateConnection(connection);
  let cached: { token: string; expiresAt: number } | undefined;
  let pending: Promise<string | null> | undefined;
  return async ({ forceRefreshToken }) => {
    if (!forceRefreshToken && cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
    if (pending) return pending;
    pending = (async () => {
      try {
        const result = await request(verified, "/auth/device-token", { method: "POST" });
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

export async function fetchHabitSnapshot(connection: Connection): Promise<HabitSnapshot> {
  const result = (await request(connection, "/api/v1/habits/snapshot")) as {
    data?: unknown;
  } | null;
  const parsed = habitSnapshotSchema.safeParse(result?.data);
  if (!parsed.success)
    throw new NativeApiError("INVALID_RESPONSE", "Der Habit-Stand konnte nicht gelesen werden.");
  return parsed.data;
}

export async function completeHabit(
  connection: Connection,
  id: string,
  occurrenceKey: string,
  idempotencyKey?: string,
): Promise<{ id: string }> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceKey)) {
    throw new NativeApiError("INVALID_INPUT", "Der Habit gehört zu keinem gültigen Tagesstand.");
  }
  // Uniqueness only, never a credential. Platforms can supply a persisted UUID.
  const commandId =
    idempotencyKey ??
    globalThis.crypto?.randomUUID?.() ??
    `habit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  if (!/^[\x21-\x7e]{1,128}$/.test(commandId))
    throw new NativeApiError("INVALID_INPUT", "Ungültige Befehlskennung.");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = (await request(connection, `/api/v1/tasks/${id}/complete`, {
        method: "POST",
        headers: { "idempotency-key": commandId },
        body: JSON.stringify({ occurrenceKey }),
      })) as { data?: { id?: unknown } } | null;
      if (typeof result?.data?.id !== "string")
        throw new NativeApiError("INVALID_RESPONSE", "Der Abschluss wurde nicht bestätigt.");
      return { id: result.data.id };
    } catch (error) {
      if (
        attempt === 0 &&
        error instanceof NativeApiError &&
        (error.code === "NETWORK_ERROR" || [502, 503, 504].includes(error.status))
      )
        continue;
      throw error;
    }
  }
  throw new NativeApiError("NETWORK_ERROR", "Der Abschluss wurde nicht bestätigt.");
}
