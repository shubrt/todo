import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { convexTest } from "convex-test";
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { ownerForClaims, publicJwks, sha256, verifyShooToken } from "../convex/authCrypto";
import { canonicalJson, errorResponse, readJson, routeCommand } from "../convex/httpHelpers";

const modules = import.meta.glob("../convex/**/*.ts");
const ownerId = "test-owner";
const rawKey = `todo_${"a".repeat(43)}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("TODO_OWNER_ID", ownerId);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function fixture() {
  const t = convexTest(schema, modules);
  const sessionId = await t.run((ctx) =>
    ctx.db.insert("sessions", {
      ownerId,
      tokenHash: "session-hash",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    }),
  );
  const tokenHash = await sha256(rawKey);
  const keyId = await t.run((ctx) =>
    ctx.db.insert("apiKeys", {
      ownerId,
      name: "Test client",
      prefix: rawKey.slice(0, 13),
      tokenHash,
      createdAt: Date.now(),
    }),
  );
  return {
    t,
    user: t.withIdentity({ subject: ownerId, sid: sessionId }),
    sessionId,
    keyId,
    tokenHash,
  };
}

describe("session authorization", () => {
  it("rejects unauthenticated users and foreign owners", async () => {
    const { t, sessionId } = await fixture();
    await expect(t.query(api.tasks.list, {})).rejects.toThrow();
    await expect(
      t.withIdentity({ subject: "another-owner", sid: sessionId }).query(api.tasks.list, {}),
    ).rejects.toThrow();
  });
  it("requires an active session and rejects the next read after revocation", async () => {
    const { t, user, sessionId } = await fixture();
    expect(await user.query(api.tasks.list, {})).toEqual([]);
    await t.run((ctx) => ctx.db.patch(sessionId, { revokedAt: Date.now() }));
    await expect(user.query(api.tasks.list, {})).rejects.toThrow();
  });
  it("rejects expired sessions and fails closed without configured owner", async () => {
    const { t, user, sessionId } = await fixture();
    vi.stubEnv("TODO_OWNER_ID", "");
    await expect(user.query(api.tasks.list, {})).rejects.toThrow();
    vi.stubEnv("TODO_OWNER_ID", ownerId);
    await t.run((ctx) => ctx.db.patch(sessionId, { expiresAt: Date.now() - 1 }));
    await expect(user.query(api.tasks.list, {})).rejects.toThrow();
  });
  it("issues only short ES256 tokens tied to the session", async () => {
    const { t } = await fixture();
    const keys = await generateKeyPair("ES256", { extractable: true });
    const privateJwk = { ...(await exportJWK(keys.privateKey)), kid: "first" };
    const publicJwk = { ...(await exportJWK(keys.publicKey)), kid: "first" };
    vi.stubEnv("AUTH_JWT_PRIVATE_JWK", JSON.stringify(privateJwk));
    vi.stubEnv("AUTH_JWT_PUBLIC_JWKS", JSON.stringify({ keys: [publicJwk] }));
    vi.stubEnv("AUTH_JWT_ISSUER", "https://example.convex.site");
    const sessionToken = "b".repeat(43);
    const tokenHash = await sha256(sessionToken);
    await t.run((ctx) =>
      ctx.db.insert("sessions", {
        ownerId,
        tokenHash,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      }),
    );
    const signed = await t.action(internal.authActions.token, { sessionToken });
    const verified = await jwtVerify(signed.token, keys.publicKey, {
      issuer: "https://example.convex.site",
      audience: "todo",
      algorithms: ["ES256"],
    });
    expect(verified.payload.sub).toBe(ownerId);
    expect(verified.payload.sid).toBeTypeOf("string");
    expect(signed.expiresAt).toBeLessThanOrEqual(Date.now() + 60_000);
    await t.mutation(internal.auth.revokeSession, { tokenHash });
    await expect(t.action(internal.authActions.token, { sessionToken })).rejects.toThrow();
  });
});

describe("Shoo verification", () => {
  it("verifies the code exchange for identity setup, but grants sessions only after owner binding", async () => {
    const t = convexTest(schema, modules);
    const origin = "https://todo.example";
    const pair = await generateKeyPair("ES256", { extractable: true });
    const idToken = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "provider" })
      .setIssuer("https://shoo.dev")
      .setAudience(`origin:${origin}`)
      .setSubject("verified-owner")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(pair.privateKey);
    const jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "provider" }] };
    const verifier = "v".repeat(64);
    const used = new Set<string>();
    vi.stubEnv("APP_ALLOWED_ORIGINS", origin);
    vi.stubEnv("SHOO_OWNER_SUBJECTS", "{}");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).endsWith("/.well-known/jwks.json")) return Response.json(jwks);
        const body = init?.body;
        if (!(body instanceof URLSearchParams))
          throw new Error("Expected form-encoded token request");
        expect(body.get("client_id")).toBe(`origin:${origin}`);
        expect(body.get("redirect_uri")).toBe(`${origin}/api/auth/callback`);
        if (body.get("code_verifier") !== verifier || used.has(body.get("code")!))
          return Response.json({}, { status: 400 });
        used.add(body.get("code")!);
        return Response.json({ id_token: idToken });
      }),
    );
    const send = (operation: string, code: string, codeVerifier = verifier) =>
      t.fetch(`/auth/${operation}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, codeVerifier, redirectUri: `${origin}/api/auth/callback` }),
      });
    const identity = await send("identity", "setup");
    expect(await identity.json()).toEqual({ origin, subject: "verified-owner" });
    expect(await t.run((ctx) => ctx.db.query("sessions").collect())).toHaveLength(0);
    expect((await send("login", "unbound")).status).toBe(403);
    expect(await t.run((ctx) => ctx.db.query("sessions").collect())).toHaveLength(0);
    vi.stubEnv("SHOO_OWNER_SUBJECTS", JSON.stringify({ [origin]: "verified-owner" }));
    expect((await send("login", "wrong-verifier", "x".repeat(64))).status).toBe(401);
    const signedIn = await send("login", "bound");
    const session = await signedIn.json();
    expect(signedIn.status).toBe(200);
    expect(session.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await t.run((ctx) => ctx.db.query("sessions").collect());
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toBe(await sha256(session.sessionToken));
    expect(JSON.stringify(stored)).not.toContain(session.sessionToken);
    expect((await send("login", "bound")).status).toBe(401);
  });
  it("accepts verified mapped identities across origins and refuses unknown people", () => {
    vi.stubEnv(
      "SHOO_OWNER_SUBJECTS",
      JSON.stringify({ "https://todo.localhost": "local-sub", "https://todo.example": "prod-sub" }),
    );
    expect(ownerForClaims({ sub: "local-sub" }, "https://todo.localhost")).toBe(ownerId);
    expect(ownerForClaims({ sub: "prod-sub" }, "https://todo.example")).toBe(ownerId);
    expect(() => ownerForClaims({ sub: "someone-else" }, "https://todo.example")).toThrow();
    expect(() => ownerForClaims({ sub: "local-sub" }, "https://todo.example")).toThrow();
  });
  it("checks signature, issuer, audience and expiry", async () => {
    const pair = await generateKeyPair("ES256", { extractable: true });
    const wrong = await generateKeyPair("ES256", { extractable: true });
    const jwks = createLocalJWKSet({
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: "shoo" }],
    });
    const sign = (issuer: string, audience: string, key = pair.privateKey, expires = "5m") =>
      new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid: "shoo" })
        .setSubject("verified")
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(expires)
        .sign(key);
    const origin = "https://todo.example";
    expect(
      (await verifyShooToken(await sign("https://shoo.dev", `origin:${origin}`), origin, jwks)).sub,
    ).toBe("verified");
    await expect(
      verifyShooToken(await sign("https://attacker.example", `origin:${origin}`), origin, jwks),
    ).rejects.toThrow();
    await expect(
      verifyShooToken(await sign("https://shoo.dev", "origin:https://other.example"), origin, jwks),
    ).rejects.toThrow();
    await expect(
      verifyShooToken(
        await sign("https://shoo.dev", `origin:${origin}`, wrong.privateKey),
        origin,
        jwks,
      ),
    ).rejects.toThrow();
    await expect(
      verifyShooToken(
        await sign("https://shoo.dev", `origin:${origin}`, pair.privateKey, "-10s"),
        origin,
        jwks,
      ),
    ).rejects.toThrow();
  });
  it("never publishes private JWK fields, including malformed rotation configuration", () => {
    vi.stubEnv(
      "AUTH_JWT_PUBLIC_JWKS",
      JSON.stringify({
        keys: [{ kty: "EC", crv: "P-256", x: "x", y: "y", kid: "one", d: "private-secret" }],
      }),
    );
    expect(JSON.stringify(publicJwks())).not.toContain("private-secret");
    vi.stubEnv("AUTH_JWT_PUBLIC_JWKS", "invalid");
    expect(publicJwks()).toEqual({ keys: [] });
  });
});

describe("external API", () => {
  it("commits idempotency and create atomically, with conflicting payload rejection", async () => {
    const { t, tokenHash } = await fixture();
    const args = {
      tokenHash,
      idempotencyKey: "create-one",
      payloadHash: "one",
      command: { type: "create", input: { title: "Raycast Daily Backup" } },
    };
    const results = await Promise.all([
      t.mutation(internal.apiCommands.write, args),
      t.mutation(internal.apiCommands.write, args),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(await t.run((ctx) => ctx.db.query("tasks").collect())).toHaveLength(1);
    await expect(
      t.mutation(internal.apiCommands.write, {
        ...args,
        payloadHash: "two",
        command: { type: "create", input: { title: "Another task" } },
      }),
    ).rejects.toThrow(/CONFLICT/);
    expect(await t.run((ctx) => ctx.db.query("tasks").collect())).toHaveLength(1);
  });
  it("checks key revocation before returning a cached receipt", async () => {
    const { t, tokenHash, keyId } = await fixture();
    const args = {
      tokenHash,
      idempotencyKey: "first",
      payloadHash: "one",
      command: { type: "create", input: { title: "My task" } },
    };
    await t.mutation(internal.apiCommands.write, args);
    await t.run((ctx) => ctx.db.patch(keyId, { revokedAt: Date.now() }));
    await expect(t.mutation(internal.apiCommands.write, args)).rejects.toThrow(/UNAUTHENTICATED/);
  });
  it("creates named random keys only for the signed-in owner and never lists their hashes", async () => {
    const { t, user } = await fixture();
    await expect(t.action(api.auth.createApiKey, { name: "Not authorized" })).rejects.toThrow();
    const created = await user.action(api.auth.createApiKey, { name: "Coding agent" });
    expect(created.key).toMatch(/^todo_[A-Za-z0-9_-]{43}$/);
    const stored = await t.run((ctx) =>
      ctx.db
        .query("apiKeys")
        .withIndex("by_tokenHash", (q) => q.eq("tokenHash", ""))
        .collect(),
    );
    expect(stored).toEqual([]);
    const all = await t.run((ctx) => ctx.db.query("apiKeys").collect());
    expect(JSON.stringify(all)).not.toContain(created.key);
    expect(all.find((key) => key._id === created.id)?.tokenHash).toBe(await sha256(created.key));
    expect(JSON.stringify(await user.query(api.auth.listApiKeys, {}))).not.toContain("tokenHash");
    const key = all.find((item) => item._id === created.id)!;
    await user.mutation(api.auth.revokeApiKey, { id: key._id });
    expect(
      (await t.fetch("/api/v1/tasks", { headers: { authorization: `Bearer ${created.key}` } }))
        .status,
    ).toBe(401);
  });
  it("uses identical domain completion rules through HTTP with revocable keys", async () => {
    const { t, user, keyId } = await fixture();
    const headers = {
      authorization: `Bearer ${rawKey}`,
      "content-type": "application/json",
      "idempotency-key": "create-via-http",
    };
    const created = await t.fetch("/api/v1/tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Zeitbuchung umstellen",
        subtasks: [{ title: "n8n umziehen" }],
      }),
    });
    expect(created.status).toBe(201);
    const result = await created.json();
    const tasks = await user.query(api.tasks.list, {});
    expect(tasks).toHaveLength(2);
    const subtask = tasks.find((task) => task.parentId);
    const complete = await t.fetch(`/api/v1/tasks/${subtask!._id}/complete`, {
      method: "POST",
      headers: { ...headers, "idempotency-key": "complete-child" },
      body: "{}",
    });
    expect(complete.status).toBe(200);
    expect(
      (await user.query(api.tasks.list, {})).find((task) => task._id === result.data.id)?.state,
    ).toBe("open");
    expect(await t.run((ctx) => ctx.db.query("completions").collect())).toHaveLength(1);
    await t.run((ctx) => ctx.db.patch(keyId, { revokedAt: Date.now() }));
    expect((await t.fetch("/api/v1/tasks", { headers })).status).toBe(401);
  });
  it("paginates roots with children and includes deferred inventory", async () => {
    const { t, user } = await fixture();
    await user.mutation(api.tasks.create, {
      title: "Deferred",
      plannedFor: "2099-01-01",
      subtasks: [{ title: "Child" }],
    });
    await user.mutation(api.tasks.create, { title: "Active" });
    const headers = { authorization: `Bearer ${rawKey}` };
    const first = await (await t.fetch("/api/v1/tasks?limit=1", { headers })).json();
    expect(first.data.items).toHaveLength(1);
    expect(first.data.nextCursor).toBeTruthy();
    const second = await (
      await t.fetch(`/api/v1/tasks?limit=1&cursor=${first.data.nextCursor}`, { headers })
    ).json();
    expect(second.data.items).toHaveLength(1);
    expect(second.data.items[0].subtasks).toHaveLength(1);
    expect(second.data.items[0].title).toBe("Deferred");
    expect(second.data.nextCursor).toBeNull();
  });
  it("rejects unknown fields, oversized payloads and absent idempotency keys", async () => {
    const { t } = await fixture();
    const headers = {
      authorization: `Bearer ${rawKey}`,
      "content-type": "application/json",
      "idempotency-key": "invalid",
    };
    expect(
      (
        await t.fetch("/api/v1/tasks", {
          method: "POST",
          headers,
          body: JSON.stringify({ title: "Task", ownerId: "intruder" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await t.fetch("/api/v1/tasks", {
          method: "POST",
          headers,
          body: JSON.stringify({ title: "x".repeat(40_000) }),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await t.fetch("/api/v1/tasks", {
          method: "POST",
          headers: { authorization: `Bearer ${rawKey}` },
          body: "{}",
        })
      ).status,
    ).toBe(400);
    expect((await t.fetch("/api/v1/tasks?limit=501", { headers })).status).toBe(400);
    expect((await t.fetch("/api/v1/tasks", {})).status).toBe(401);
  });
  it("canonicalizes object order and never returns internal exception details", async () => {
    expect(canonicalJson({ b: 1, a: { c: 2 } })).toBe(canonicalJson({ a: { c: 2 }, b: 1 }));
    expect(await errorResponse(new Error("private token secret"), "request").text()).not.toContain(
      "private token secret",
    );
    expect(() => routeCommand("PATCH", "/api/v1/tasks/task", { parentId: "child" })).toThrow();
    await expect(
      readJson(
        new Request("http://local", {
          method: "POST",
          body: "[]",
          headers: { "content-type": "application/json" },
        }),
      ),
    ).rejects.toThrow();
  });
});
