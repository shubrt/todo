import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { logServerEvent } from "@todo/logging/server";

const SESSION_COOKIE = "todo_session";
const LOGIN_COOKIE = "todo_login";
const LOGIN_MAX_AGE = 10 * 60 * 1000;
const headers = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
};
type Configuration = { origin: string; convexUrl: string; secret: string; secure: boolean };
type LoginTransaction = {
  state: string;
  verifier: string;
  createdAt: number;
  purpose?: "identity";
};

export function configuration(): Configuration | null {
  const origin = process.env.APP_ORIGIN;
  const convexUrl = process.env.CONVEX_SITE_URL;
  const secret = process.env.AUTH_COOKIE_SECRET;
  if (!origin || !convexUrl || !secret || secret.length < 43) return null;
  try {
    const app = new URL(origin);
    const backend = new URL(convexUrl);
    const isLocal = (url: URL) =>
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname.endsWith(".localhost");
    if (
      app.origin !== origin ||
      (app.protocol !== "https:" && !(app.protocol === "http:" && isLocal(app)))
    )
      return null;
    if (backend.protocol !== "https:" && !(backend.protocol === "http:" && isLocal(backend)))
      return null;
    return { origin, convexUrl: backend.origin, secret, secure: app.protocol === "https:" };
  } catch {
    return null;
  }
}

function cookie(name: string, value: string, config: Configuration, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.secure ? "; Secure" : ""}`;
}

function readCookie(request: Request, name: string): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function mac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signLogin(transaction: LoginTransaction, secret: string): string {
  const payload = Buffer.from(JSON.stringify(transaction)).toString("base64url");
  return `${payload}.${mac(`login:${payload}`, secret)}`;
}

export function verifyLogin(
  value: string | undefined,
  state: string | null,
  secret: string,
  now = Date.now(),
): LoginTransaction | null {
  if (!value || value.length > 2048 || !state) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || !safeEqual(signature, mac(`login:${payload}`, secret)))
    return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as LoginTransaction;
    if (
      typeof parsed.state !== "string" ||
      !safeEqual(parsed.state, state) ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(parsed.verifier) ||
      !Number.isFinite(parsed.createdAt) ||
      parsed.createdAt > now ||
      now - parsed.createdAt >= LOGIN_MAX_AGE
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function csrfForSession(session: string, secret: string): string {
  return mac(`csrf:${session}`, secret);
}

export function verifyCsrf(request: Request, session: string, config: Configuration): boolean {
  const origin = request.headers.get("origin");
  const token = request.headers.get("x-csrf-token");
  const site = request.headers.get("sec-fetch-site");
  return (
    origin === config.origin &&
    site !== "cross-site" &&
    !!token &&
    safeEqual(token, csrfForSession(session, config.secret))
  );
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  new Headers(extra).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

async function backend(config: Configuration, path: string, body: unknown): Promise<Response> {
  return fetch(`${config.convexUrl}/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
}

export async function handleAuthRequest(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const path = new URL(request.url).pathname;
  const config = configuration();
  if (!config)
    return json(
      {
        authenticated: false,
        configured: false,
        error: "Die Anmeldung ist noch nicht eingerichtet.",
        requestId,
      },
      path === "/api/auth/session" ? 200 : 503,
    );
  const session = readCookie(request, SESSION_COOKIE);
  const unauthenticated = () =>
    json({ authenticated: false, configured: true, requestId }, 401, {
      "set-cookie": cookie(SESSION_COOKIE, "", config, 0),
    });
  try {
    if ((path === "/api/auth/login" || path === "/api/auth/identity") && request.method === "GET") {
      const transaction: LoginTransaction = {
        state: randomBytes(32).toString("base64url"),
        verifier: randomBytes(48).toString("base64url"),
        createdAt: Date.now(),
        ...(path.endsWith("/identity") ? { purpose: "identity" as const } : {}),
      };
      const challenge = Buffer.from(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(transaction.verifier)),
      ).toString("base64url");
      const redirect = new URL("https://shoo.dev/authorize");
      redirect.searchParams.set("client_id", `origin:${config.origin}`);
      redirect.searchParams.set("redirect_uri", `${config.origin}/api/auth/callback`);
      redirect.searchParams.set("response_type", "code");
      redirect.searchParams.set("state", transaction.state);
      redirect.searchParams.set("code_challenge", challenge);
      redirect.searchParams.set("code_challenge_method", "S256");
      return new Response(null, {
        status: 302,
        headers: {
          ...headers,
          location: redirect.toString(),
          "set-cookie": cookie(
            LOGIN_COOKIE,
            signLogin(transaction, config.secret),
            config,
            LOGIN_MAX_AGE / 1000,
          ),
        },
      });
    }
    if (path === "/api/auth/callback" && request.method === "GET") {
      const url = new URL(request.url);
      const transaction = verifyLogin(
        readCookie(request, LOGIN_COOKIE),
        url.searchParams.get("state"),
        config.secret,
      );
      const clearLogin = cookie(LOGIN_COOKIE, "", config, 0);
      const code = url.searchParams.get("code");
      if (!transaction || !code || url.searchParams.has("error"))
        return new Response(null, {
          status: 303,
          headers: { ...headers, location: "/?authError=invalid_login", "set-cookie": clearLogin },
        });
      const response = await backend(
        config,
        transaction.purpose === "identity" ? "identity" : "login",
        {
          code,
          codeVerifier: transaction.verifier,
          redirectUri: `${config.origin}/api/auth/callback`,
        },
      );
      if (!response.ok) {
        logServerEvent({
          operation: "auth.callback",
          outcome: "error",
          requestId,
          errorCode: response.status === 403 ? "FORBIDDEN" : "UNAUTHENTICATED",
        });
        return new Response(null, {
          status: 303,
          headers: {
            ...headers,
            location: `/?authError=${response.status === 403 ? "account_not_allowed" : "login_failed"}`,
            "set-cookie": clearLogin,
          },
        });
      }
      if (transaction.purpose === "identity") {
        const identity = (await response.json()) as { origin: string; subject: string };
        return json(
          {
            message:
              "Diese Identität wurde von Shoo bestätigt. Es wurde keine App-Sitzung erstellt. Übernimm die Zuordnung in SHOO_OWNER_SUBJECTS und melde dich anschließend normal an.",
            SHOO_OWNER_SUBJECTS: { [identity.origin]: identity.subject },
          },
          200,
          { "set-cookie": clearLogin },
        );
      }
      const result = (await response.json()) as { sessionToken: string; expiresAt: number };
      const responseHeaders = new Headers({ ...headers, location: "/" });
      responseHeaders.append("set-cookie", clearLogin);
      responseHeaders.append(
        "set-cookie",
        cookie(
          SESSION_COOKIE,
          result.sessionToken,
          config,
          Math.max(0, Math.floor((result.expiresAt - Date.now()) / 1000)),
        ),
      );
      logServerEvent({ operation: "auth.login", outcome: "ok", requestId });
      return new Response(null, { status: 303, headers: responseHeaders });
    }
    if (path === "/api/auth/session" && request.method === "GET") {
      if (!session) return json({ authenticated: false, configured: true, requestId });
      const response = await backend(config, "session", { sessionToken: session });
      if (response.status === 401)
        return json({ authenticated: false, configured: true, requestId }, 200, {
          "set-cookie": cookie(SESSION_COOKIE, "", config, 0),
        });
      if (!response.ok)
        return json({ error: "Die Sitzung konnte nicht geprüft werden.", requestId }, 503);
      return json({
        authenticated: true,
        configured: true,
        csrfToken: csrfForSession(session, config.secret),
        requestId,
      });
    }
    if ((path === "/api/auth/token" || path === "/api/auth/logout") && request.method === "POST") {
      if (!session) return unauthenticated();
      if (!verifyCsrf(request, session, config))
        return json(
          { error: "Unzulässiger Ursprung der Anfrage.", code: "FORBIDDEN", requestId },
          403,
        );
      const response = await backend(config, path.endsWith("/logout") ? "logout" : "token", {
        sessionToken: session,
      });
      if (response.status === 401) return unauthenticated();
      if (!response.ok)
        return json({ error: "Die Anmeldung ist vorübergehend nicht verfügbar.", requestId }, 503);
      if (path.endsWith("/logout"))
        return json({ authenticated: false, requestId }, 200, {
          "set-cookie": cookie(SESSION_COOKIE, "", config, 0),
        });
      const result = (await response.json()) as { token: string; expiresAt: number };
      return json({ token: result.token, expiresAt: result.expiresAt, requestId });
    }
    return json({ error: "Nicht gefunden.", requestId }, 404);
  } catch {
    logServerEvent({
      operation: "auth.request",
      outcome: "error",
      requestId,
      errorCode: "AUTH_UNAVAILABLE",
    });
    return json({ error: "Die Anmeldung ist vorübergehend nicht verfügbar.", requestId }, 503);
  }
}
