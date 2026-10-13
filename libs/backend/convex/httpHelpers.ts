import { ConvexError } from "convex/values";
import {
  commandSchema,
  completionFiltersSchema,
  taskFiltersSchema,
  type Command,
} from "@todo/contracts";

export const MAX_BODY_BYTES = 32 * 1024;
// A key is 48 characters; the rest leaves room for surrounding whitespace.
const MAX_KEY_BYTES = 128;
const KEY_PATTERN = /^todo_[A-Za-z0-9_-]{43}$/;

function unauthenticated(): never {
  throw new ConvexError({
    code: "UNAUTHENTICATED",
    message: "Ein gültiger API-Schlüssel ist erforderlich.",
  });
}

export function applicationKey(request: Request): string {
  const key = request.headers.get("authorization")?.match(/^Bearer (.*)$/)?.[1];
  if (!key || !KEY_PATTERN.test(key)) unauthenticated();
  return key;
}

/**
 * The key for /auth/device-token: from the Authorization header when present (older apps),
 * else from a text/plain body. The body form keeps the web app's token request a CORS simple
 * request without a preflight. That is safe: any page can send one, but without the key it is
 * useless, and only WEB_APP_ORIGIN can read the response.
 */
export async function deviceTokenKey(request: Request): Promise<string> {
  if (request.headers.has("authorization")) return applicationKey(request);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("text/plain"))
    unauthenticated();
  const body = await readBytes(request, MAX_KEY_BYTES);
  const key = body && new TextDecoder().decode(body).trim();
  if (!key || !KEY_PATTERN.test(key)) unauthenticated();
  return key;
}

/** Reads the body, or null once it exceeds `max` bytes. A missing body reads as empty. */
async function readBytes(request: Request, max: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null;
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Content-Type application/json ist erforderlich.",
    });
  if (!request.body)
    throw new ConvexError({ code: "INVALID_INPUT", message: "Ein JSON-Objekt ist erforderlich." });
  const bytes = await readBytes(request, MAX_BODY_BYTES);
  if (!bytes)
    throw new ConvexError({
      code: "PAYLOAD_TOO_LARGE",
      message: "Die Anfrage darf höchstens 32 KiB enthalten.",
    });
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("object required");
    return body as Record<string, unknown>;
  } catch {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Ein gültiges JSON-Objekt ist erforderlich.",
    });
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/** Rejects invalid input with the German message of a refine, else with `fallback`. */
function invalidInput(issues: readonly { code: string; message: string }[], fallback: string) {
  return new ConvexError({
    code: "INVALID_INPUT",
    message: issues.find((issue) => issue.code === "custom")?.message ?? fallback,
  });
}

export function parseFilters(url: URL, completions = false) {
  const values: Record<string, unknown> = Object.fromEntries(url.searchParams);
  if (values.limit !== undefined) values.limit = Number(values.limit);
  if (values.isAi === "true") values.isAi = true;
  if (values.isAi === "false") values.isAi = false;
  if (completions && typeof values.date === "string") {
    values.from = values.date;
    values.to = values.date;
    delete values.date;
  }
  const parsed = (completions ? completionFiltersSchema : taskFiltersSchema).safeParse(values);
  if (!parsed.success)
    throw invalidInput(
      parsed.error.issues,
      "Ungültige Filter. limit muss zwischen 1 und 500 liegen; Daten im Format YYYY-MM-DD.",
    );
  return parsed.data;
}

/** Turns a GET path (other than the habit snapshot) into an `apiCommands.read` request. */
export function routeRead(url: URL) {
  if (url.pathname === "/api/v1/lists") {
    if (url.search)
      throw new ConvexError({ code: "INVALID_INPUT", message: "Listen benötigen keine Filter." });
    return { resource: "lists", filters: {} } as const;
  }
  if (url.pathname === "/api/v1/completions")
    return { resource: "completions", filters: parseFilters(url, true) } as const;
  if (url.pathname === "/api/v1/tasks")
    return { resource: "tasks", filters: parseFilters(url) } as const;
  const taskId = url.pathname.match(/^\/api\/v1\/tasks\/([^/]+)$/)?.[1];
  if (!taskId) throw new ConvexError({ code: "NOT_FOUND", message: "Nicht gefunden." });
  if (url.search)
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Eine Aufgabe benötigt keine Filter.",
    });
  return { resource: "task", taskId, filters: {} } as const;
}

/** Turns a write request into a command; its input comes in the body, never in the query. */
export function routeCommand(method: string, url: URL, body: Record<string, unknown>): Command {
  if (url.search)
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Schreibbefehle nehmen keine Query-Parameter an.",
    });
  const parts = url.pathname
    .replace(/^\/api\/v1\/tasks\/?/, "")
    .split("/")
    .filter(Boolean);
  if (
    "type" in body ||
    "taskId" in body ||
    ("parentId" in body && !(method === "POST" && parts[0] === "reorder" && parts.length === 1))
  )
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Aufgaben- und Eltern-ID werden über die Route festgelegt.",
    });
  let command: unknown;
  if (method === "POST" && parts.length === 0) command = { type: "create", input: body };
  else if (method === "POST" && parts[0] === "reorder" && parts.length === 1)
    command = { ...body, type: "reorder" };
  else if (parts.length === 1 && method === "PATCH")
    command = { type: "update", taskId: parts[0], input: body };
  else if (parts.length === 1 && method === "DELETE")
    command = { ...body, type: "discard", taskId: parts[0] };
  else if (parts.length === 2 && method === "POST") {
    const taskId = parts[0];
    const action = parts[1];
    const types: Record<string, string> = {
      subtasks: "addSubtask",
      complete: "complete",
      reopen: "reopen",
      move: "move",
      "clear-inbox": "clearInbox",
      snooze: "snooze",
      plan: "plan",
      "normalize-urgency": "normalizeUrgency",
    };
    if (action === "reorder-subtasks") command = { ...body, type: "reorder", parentId: taskId };
    else if (action && types[action]) command = { ...body, type: types[action], taskId };
  }
  if (!command)
    throw new ConvexError({ code: "NOT_FOUND", message: "Diese API-Operation existiert nicht." });
  const parsed = commandSchema.safeParse(command);
  if (!parsed.success)
    throw invalidInput(
      parsed.error.issues,
      "Die Anfrage enthält fehlende, ungültige oder nicht erlaubte Felder.",
    );
  return parsed.data;
}

/**
 * The web app's origin from WEB_APP_ORIGIN, read on every request. Only an exact https origin
 * (as `URL.origin` serializes it, e.g. "https://task.example") counts; absent or anything else
 * returns null, which turns the web login bounce and CORS off.
 */
export function webAppOrigin(): string | null {
  const value = process.env.WEB_APP_ORIGIN;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value ? value : null;
  } catch {
    return null;
  }
}

/**
 * Shoo redirects the browser to the stable site callback; this computes where to bounce it.
 * A "<port>.<43 base64url>" state goes to the desktop loopback listener on that port, a
 * "web.<43 base64url>" state to the fixed `${webOrigin}/auth/callback` (only while it is set).
 * Only code, state and error are forwarded. Returns null for a malformed state or port.
 */
export function desktopCallbackLocation(url: URL, webOrigin: string | null): string | null {
  const prefix = url.searchParams.get("state")?.match(/^(\d{4,5}|web)\.[A-Za-z0-9_-]{43}$/)?.[1];
  if (!prefix) return null;
  let target: URL;
  if (prefix === "web") {
    if (!webOrigin) return null;
    target = new URL("/auth/callback", webOrigin);
  } else {
    const port = Number(prefix);
    if (port < 1024 || port > 65535) return null;
    target = new URL(`http://127.0.0.1:${port}/callback`);
  }
  for (const [name, max] of [
    ["code", 4096],
    ["state", 64],
    ["error", 200],
  ] as const) {
    const value = url.searchParams.get(name);
    if (value !== null) target.searchParams.set(name, value.slice(0, max));
  }
  return target.href;
}

/**
 * CORS headers for the auth POST routes: only the web app's exact origin may read responses.
 * Never allows credentials; the web app sends its device key in the token request's body or
 * as a bearer header, never in a cookie.
 */
export function corsHeaders(request: Request, webOrigin: string | null): Record<string, string> {
  return webOrigin && request.headers.get("origin") === webOrigin
    ? { vary: "Origin", "access-control-allow-origin": webOrigin }
    : { vary: "Origin" };
}

/**
 * Answers the browser's preflight for an auth POST route; a foreign origin gets no allowance.
 * Login and revoke need it; the token request skips it unless an older app sends a bearer header.
 */
export function preflightResponse(request: Request, webOrigin: string | null): Response {
  const headers = corsHeaders(request, webOrigin);
  if (headers["access-control-allow-origin"])
    Object.assign(headers, {
      "access-control-allow-methods": "POST",
      // Listed explicitly: "*" never covers Authorization.
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "600",
    });
  return new Response(null, { status: 204, headers });
}

export function errorResponse(error: unknown, requestId: string): Response {
  let data: unknown = error instanceof ConvexError ? error.data : null;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  const detail = data as { code?: string; message?: string } | null;
  const statuses: Record<string, number> = {
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INVALID_INPUT: 400,
    CONFLICT: 409,
    PAYLOAD_TOO_LARGE: 413,
    NOT_CONFIGURED: 503,
  };
  const code = detail?.code && statuses[detail.code] ? detail.code : "INTERNAL_ERROR";
  return jsonResponse(
    {
      error: {
        code,
        message:
          code === "INTERNAL_ERROR"
            ? "Die Anfrage konnte nicht verarbeitet werden."
            : (detail?.message ?? "Ungültige Anfrage."),
      },
      requestId,
    },
    statuses[code] ?? 500,
  );
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
