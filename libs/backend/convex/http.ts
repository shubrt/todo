import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { logEvent } from "@todo/logging";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { publicJwks, sha256 } from "./authCrypto";
import {
  canonicalJson,
  errorResponse,
  jsonResponse,
  parseFilters,
  readJson,
  routeCommand,
} from "./httpHelpers";

const http = httpRouter();

http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: httpAction(async () => {
    const jwks = publicJwks();
    return new Response(JSON.stringify(jwks), {
      status: jwks.keys.length ? 200 : 503,
      headers: {
        "content-type": "application/json",
        "cache-control": jwks.keys.length ? "public, max-age=300" : "no-store",
      },
    });
  }),
});

const authHandler = httpAction(async (ctx, request) => {
  const requestId = crypto.randomUUID();
  const operation = new URL(request.url).pathname.slice("/auth/".length);
  try {
    const body = await readJson(request);
    let result: unknown;
    if (operation === "login" || operation === "identity") {
      if (
        typeof body.code !== "string" ||
        typeof body.codeVerifier !== "string" ||
        typeof body.redirectUri !== "string"
      )
        throw new ConvexError({ code: "INVALID_INPUT", message: "Ungültige Logintransaktion." });
      result = await ctx.runAction(
        operation === "identity" ? internal.authActions.identity : internal.authActions.login,
        { code: body.code, codeVerifier: body.codeVerifier, redirectUri: body.redirectUri },
      );
    } else {
      if (typeof body.sessionToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.sessionToken))
        throw new ConvexError({ code: "UNAUTHENTICATED", message: "Ungültige Sitzung." });
      const tokenHash = await sha256(body.sessionToken);
      if (operation === "token")
        result = await ctx.runAction(internal.authActions.token, {
          sessionToken: body.sessionToken,
        });
      else if (operation === "logout") {
        await ctx.runMutation(internal.auth.revokeSession, { tokenHash });
        result = { authenticated: false };
      } else if (operation === "session") {
        const session = await ctx.runQuery(internal.auth.getSession, { tokenHash });
        if (!session)
          throw new ConvexError({ code: "UNAUTHENTICATED", message: "Bitte erneut anmelden." });
        result = { authenticated: true };
      } else throw new ConvexError({ code: "NOT_FOUND", message: "Nicht gefunden." });
    }
    logEvent({ service: "todo-convex", operation: `auth.${operation}`, outcome: "ok", requestId });
    return jsonResponse(result);
  } catch (error) {
    const response = errorResponse(error, requestId);
    logEvent({
      service: "todo-convex",
      operation: `auth.${operation}`,
      outcome: "error",
      requestId,
      errorCode: String(response.status),
    });
    return response;
  }
});
for (const path of [
  "/auth/login",
  "/auth/identity",
  "/auth/token",
  "/auth/session",
  "/auth/logout",
])
  http.route({ path, method: "POST", handler: authHandler });

const apiHandler = httpAction(async (ctx, request) => {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  try {
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bearer (todo_[A-Za-z0-9_-]{43})$/);
    if (!match?.[1])
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Ein gültiger API-Schlüssel ist erforderlich.",
      });
    const tokenHash = await sha256(match[1]);
    const url = new URL(request.url);
    let data: unknown;
    if (request.method === "GET") {
      if (url.pathname === "/api/v1/completions")
        data = await ctx.runQuery(internal.apiCommands.read, {
          tokenHash,
          resource: "completions",
          filters: parseFilters(url, true),
        });
      else if (url.pathname === "/api/v1/tasks")
        data = await ctx.runQuery(internal.apiCommands.read, {
          tokenHash,
          resource: "tasks",
          filters: parseFilters(url),
        });
      else {
        const matchId = url.pathname.match(/^\/api\/v1\/tasks\/([^/]+)$/);
        if (!matchId?.[1]) throw new ConvexError({ code: "NOT_FOUND", message: "Nicht gefunden." });
        data = await ctx.runQuery(internal.apiCommands.read, {
          tokenHash,
          resource: "task",
          taskId: matchId[1],
          filters: {},
        });
      }
    } else {
      const idempotencyKey = request.headers.get("idempotency-key");
      if (!idempotencyKey)
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Idempotency-Key ist für Schreibbefehle erforderlich.",
        });
      const body = request.body ? await readJson(request) : {};
      const command = routeCommand(request.method, url.pathname, body);
      const payloadHash = await sha256(canonicalJson(command));
      data = await ctx.runMutation(internal.apiCommands.write, {
        tokenHash,
        idempotencyKey,
        payloadHash,
        command,
      });
    }
    logEvent({
      service: "todo-convex",
      operation: "api.request",
      outcome: "ok",
      requestId,
      durationMs: Date.now() - started,
    });
    return jsonResponse(
      { data, requestId },
      request.method === "POST" && url.pathname === "/api/v1/tasks" ? 201 : 200,
    );
  } catch (error) {
    const response = errorResponse(error, requestId);
    logEvent({
      service: "todo-convex",
      operation: "api.request",
      outcome: "error",
      requestId,
      errorCode: String(response.status),
      durationMs: Date.now() - started,
    });
    return response;
  }
});

for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
  http.route({ path: "/api/v1/tasks", method, handler: apiHandler });
  http.route({ pathPrefix: "/api/v1/tasks/", method, handler: apiHandler });
}
http.route({ path: "/api/v1/completions", method: "GET", handler: apiHandler });

export default http;
