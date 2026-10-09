import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { logEvent } from "@todo/logging";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { publicJwks, sha256 } from "./authCrypto";
import {
  canonicalJson,
  applicationKey,
  desktopCallbackLocation,
  errorResponse,
  jsonResponse,
  readJson,
  routeCommand,
  routeRead,
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

// Shoo's redirect_uri. It cannot exchange the code (no verifier); it only bounces to the desktop.
http.route({
  path: "/auth/desktop/callback",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
    const location = desktopCallbackLocation(new URL(request.url));
    if (location) return new Response(null, { status: 302, headers: { ...headers, location } });
    return new Response(
      "Ungültige Anmeldeantwort. Bitte die Anmeldung in der Todo-App neu starten.",
      {
        status: 400,
        headers: {
          ...headers,
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff",
        },
      },
    );
  }),
});

/** POST JSON auth endpoint with the shared error shape and request logging. */
function authRoute(path: string, run: (ctx: ActionCtx, request: Request) => Promise<unknown>) {
  const operation = `auth.${path.slice("/auth/".length)}`;
  http.route({
    path,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const requestId = crypto.randomUUID();
      try {
        const result = await run(ctx, request);
        logEvent({ service: "todo-convex", operation, outcome: "ok", requestId });
        return jsonResponse(result);
      } catch (error) {
        const response = errorResponse(error, requestId);
        logEvent({
          service: "todo-convex",
          operation,
          outcome: "error",
          requestId,
          errorCode: String(response.status),
        });
        return response;
      }
    }),
  });
}

// Body { code, codeVerifier, deviceName, kind? }. kind "integration" mints a named key for a
// tool instead of the app's own device key; any other value than the two kinds is rejected.
authRoute("/auth/desktop-login", async (ctx, request) => {
  const body = await readJson(request);
  if (
    typeof body.code !== "string" ||
    typeof body.codeVerifier !== "string" ||
    typeof body.deviceName !== "string" ||
    (body.kind !== undefined && body.kind !== "device" && body.kind !== "integration")
  )
    throw new ConvexError({ code: "INVALID_INPUT", message: "Ungültige Logintransaktion." });
  return ctx.runAction(internal.authActions.desktopLogin, {
    code: body.code,
    codeVerifier: body.codeVerifier,
    deviceName: body.deviceName,
    ...(body.kind !== undefined ? { kind: body.kind } : {}),
  });
});

authRoute("/auth/device-token", async (ctx, request) =>
  ctx.runAction(internal.authActions.deviceToken, {
    tokenHash: await sha256(applicationKey(request)),
  }),
);

authRoute("/auth/device-revoke", async (ctx, request) => {
  await ctx.runMutation(internal.auth.revokeDeviceKey, {
    tokenHash: await sha256(applicationKey(request)),
  });
  return { revoked: true };
});

const apiHandler = httpAction(async (ctx, request) => {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  try {
    const tokenHash = await sha256(applicationKey(request));
    const url = new URL(request.url);
    let data: unknown;
    if (request.method === "GET" && url.pathname === "/api/v1/habits/snapshot") {
      if (url.search)
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Der Habit-Stand benötigt keine Filter.",
        });
      data = await ctx.runMutation(internal.apiCommands.habitSnapshot, { tokenHash });
    } else if (request.method === "GET") {
      const read = routeRead(url);
      // Queries cannot write, so seed the owner's lists and migrate legacy data first.
      await ctx.runMutation(internal.lists.ensureOwnerInternal, { tokenHash });
      data = await ctx.runQuery(internal.apiCommands.read, { tokenHash, ...read });
    } else {
      const idempotencyKey = request.headers.get("idempotency-key");
      if (!idempotencyKey)
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Idempotency-Key ist für Schreibbefehle erforderlich.",
        });
      const body = request.body ? await readJson(request) : {};
      const command = routeCommand(request.method, url, body);
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
http.route({ path: "/api/v1/lists", method: "GET", handler: apiHandler });
http.route({ path: "/api/v1/completions", method: "GET", handler: apiHandler });
http.route({ path: "/api/v1/habits/snapshot", method: "GET", handler: apiHandler });

export default http;
