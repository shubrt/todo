import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { convexTest } from "convex-test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
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
  return { t, user: t.withIdentity({ subject: ownerId, apiKeyId: keyId }), keyId, tokenHash };
}

describe("Shoo verification", () => {
  it("accepts verified mapped identities across origins and refuses unknown people", () => {
    const dev = "https://dev-one.convex.site";
    const prod = "https://prod-one.eu-west-1.convex.site";
    vi.stubEnv("SHOO_OWNER_SUBJECTS", JSON.stringify({ [dev]: "dev-sub", [prod]: "prod-sub" }));
    expect(ownerForClaims({ sub: "dev-sub" }, dev)).toBe(ownerId);
    expect(ownerForClaims({ sub: "prod-sub" }, prod)).toBe(ownerId);
    expect(() => ownerForClaims({ sub: "someone-else" }, prod)).toThrow();
    expect(() => ownerForClaims({ sub: "dev-sub" }, prod)).toThrow();
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

describe("desktop login", () => {
  // t.fetch serves the router under this origin, so it doubles as CONVEX_SITE_URL.
  const site = "https://some.convex.site";
  const verifier = "v".repeat(64);
  const state = `51234.${"s".repeat(43)}`;
  // One Shoo signing key per file: authCrypto caches the remote JWKS across tests.
  const shooKeys = generateKeyPair("ES256", { extractable: true });

  /** Local Shoo: serves its JWKS and redeems each code once for the exact desktop parameters. */
  async function stubShoo(subject: string) {
    const pair = await shooKeys;
    const jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "shoo" }] };
    const used = new Set<string>();
    const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input) === "https://shoo.dev/.well-known/jwks.json") return Response.json(jwks);
      const body = new URLSearchParams(init?.body as URLSearchParams);
      const code = body.get("code") ?? "";
      if (
        String(input) !== "https://shoo.dev/token" ||
        body.get("grant_type") !== "authorization_code" ||
        body.get("client_id") !== `origin:${site}` ||
        body.get("redirect_uri") !== `${site}/auth/desktop/callback` ||
        body.get("code_verifier") !== verifier ||
        used.has(code)
      )
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      used.add(code);
      const idToken = await new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid: "shoo" })
        .setIssuer("https://shoo.dev")
        .setAudience(`origin:${site}`)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(pair.privateKey);
      return Response.json({ id_token: idToken });
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("CONVEX_SITE_URL", site);
    vi.stubEnv("SHOO_OWNER_SUBJECTS", JSON.stringify({ [site]: "desktop-sub" }));
    const t = convexTest(schema, modules);
    const login = (body: Record<string, unknown>) =>
      t.fetch("/auth/desktop-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "code", codeVerifier: verifier, deviceName: "Mac", ...body }),
      });
    return { t, fetch, login };
  }

  it("bounces Shoo's redirect to the loopback port in state with only code, state and error", async () => {
    const t = convexTest(schema, modules);
    const callback = (query: string) => t.fetch(`/auth/desktop/callback?${query}`);
    const ok = await callback(`code=abc&state=${state}&iss=https%3A%2F%2Fshoo.dev&extra=1`);
    expect(ok.status).toBe(302);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(ok.headers.get("referrer-policy")).toBe("no-referrer");
    const target = new URL(ok.headers.get("location")!);
    expect(`${target.origin}${target.pathname}`).toBe("http://127.0.0.1:51234/callback");
    expect([...target.searchParams]).toEqual([
      ["code", "abc"],
      ["state", state],
    ]);
    const denied = new URL(
      (await callback(`state=${state}&error=access_denied&error_description=nope`)).headers.get(
        "location",
      )!,
    );
    expect([...denied.searchParams]).toEqual([
      ["state", state],
      ["error", "access_denied"],
    ]);
    const long = new URL(
      (await callback(`code=${"c".repeat(5000)}&state=${state}`)).headers.get("location")!,
    );
    expect(long.searchParams.get("code")).toHaveLength(4096);
    for (const bad of [
      `1023.${"s".repeat(43)}`,
      `65536.${"s".repeat(43)}`,
      `51234.${"s".repeat(42)}`,
      `51234.${"s".repeat(42)}%2B`,
      `localhost.${"s".repeat(43)}`,
    ]) {
      const response = await callback(`code=abc&state=${bad}`);
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
    }
    expect((await callback("code=abc")).status).toBe(400);
  });

  it("exchanges the code with the device's verifier and mints a named device key", async () => {
    const { t, login } = await stubShoo("desktop-sub");
    const response = await login({ code: "good", deviceName: "  MacBook Pro  " });
    expect(response.status).toBe(200);
    const created = await response.json();
    expect(created.key).toMatch(/^todo_[A-Za-z0-9_-]{43}$/);
    expect(created.prefix).toBe(created.key.slice(0, 13));
    const stored = await t.run((ctx) => ctx.db.query("apiKeys").collect());
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      _id: created.id,
      ownerId,
      name: "MacBook Pro",
      prefix: created.prefix,
      tokenHash: await sha256(created.key),
      kind: "device",
    });
    expect(JSON.stringify(stored)).not.toContain(created.key);
    const authorization = `Bearer ${created.key}`;
    expect((await t.fetch("/api/v1/tasks", { headers: { authorization } })).status).toBe(200);
    expect((await login({ code: "good" })).status).toBe(401);
    expect((await login({ code: "fresh", codeVerifier: "x".repeat(64) })).status).toBe(401);
  });

  it("mints a named integration key on request", async () => {
    const { t, login } = await stubShoo("desktop-sub");
    const response = await login({
      code: "step-up",
      deviceName: " task-capture ",
      kind: "integration",
    });
    expect(response.status).toBe(200);
    const created = await response.json();
    expect(await t.run((ctx) => ctx.db.get(created.id))).toMatchObject({
      name: "task-capture",
      kind: "integration",
    });
  });

  it("refuses an unmapped Shoo subject with the SHOO_OWNER_SUBJECTS entry to add", async () => {
    const { t, login } = await stubShoo("someone-new");
    const response = await login({});
    expect(response.status).toBe(403);
    const { error } = await response.json();
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toContain(`SHOO_OWNER_SUBJECTS`);
    expect(error.message).toContain(JSON.stringify({ [site]: "someone-new" }));
    expect(await t.run((ctx) => ctx.db.query("apiKeys").collect())).toEqual([]);
  });

  it("rejects bad device names and transactions before spending the single-use code", async () => {
    const { fetch, login } = await stubShoo("desktop-sub");
    for (const deviceName of ["", "   ", "x".repeat(81), 42])
      expect((await login({ deviceName })).status).toBe(400);
    for (const kind of ["admin", null, 1, "Integration"])
      expect((await login({ kind })).status).toBe(400);
    expect((await login({ codeVerifier: "too-short" })).status).toBe(400);
    expect((await login({ code: "" })).status).toBe(400);
    vi.stubEnv("CONVEX_SITE_URL", "");
    expect((await login({})).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("key management", () => {
  /** Inserts a key of the test owner; returns its id and raw secret. */
  async function insertKey(
    t: Awaited<ReturnType<typeof fixture>>["t"],
    name: string,
    patch: Partial<{ ownerId: string; revokedAt: number; expiresAt: number }> = {},
  ) {
    const raw = `todo_${name.padEnd(43, "x").slice(0, 43)}`;
    const id = await t.run(async (ctx) =>
      ctx.db.insert("apiKeys", {
        ownerId,
        name,
        prefix: raw.slice(0, 13),
        tokenHash: await sha256(raw),
        kind: "integration",
        createdAt: Date.now(),
        ...patch,
      }),
    );
    return { id, raw };
  }

  it("lists only active keys, newest first, marks the caller's key and never returns hashes", async () => {
    const { t, user, keyId } = await fixture();
    vi.advanceTimersByTime(1000);
    const capture = await insertKey(t, "capture");
    await insertKey(t, "revoked", { revokedAt: Date.now() });
    await insertKey(t, "expired", { expiresAt: Date.now() });
    await insertKey(t, "foreign", { ownerId: "someone-else" });
    const keys = await user.query(api.auth.listApiKeys, {});
    expect(keys).toEqual([
      {
        id: capture.id,
        name: "capture",
        prefix: capture.raw.slice(0, 13),
        kind: "integration",
        createdAt: Date.now(),
        lastUsedAt: null,
        current: false,
      },
      {
        id: keyId,
        name: "Test client",
        prefix: rawKey.slice(0, 13),
        kind: null,
        createdAt: Date.now() - 1000,
        lastUsedAt: null,
        current: true,
      },
    ]);
    await expect(t.query(api.auth.listApiKeys, {})).rejects.toThrow(/UNAUTHENTICATED/);
  });

  it("revokes other keys idempotently, refuses its own and foreign keys", async () => {
    const { t, user, keyId } = await fixture();
    const capture = await insertKey(t, "capture");
    const foreign = await insertKey(t, "foreign", { ownerId: "someone-else" });
    const headers = { authorization: `Bearer ${capture.raw}` };
    expect((await t.fetch("/api/v1/tasks", { headers })).status).toBe(200);
    await user.mutation(api.auth.revokeApiKey, { id: capture.id });
    const revokedAt = Date.now();
    vi.advanceTimersByTime(1000);
    await user.mutation(api.auth.revokeApiKey, { id: capture.id });
    expect((await t.run((ctx) => ctx.db.get(capture.id)))?.revokedAt).toBe(revokedAt);
    expect((await t.fetch("/api/v1/tasks", { headers })).status).toBe(401);
    await expect(user.mutation(api.auth.revokeApiKey, { id: keyId })).rejects.toThrow(
      /Schlüssel dieser App/,
    );
    await expect(user.mutation(api.auth.revokeApiKey, { id: foreign.id })).rejects.toThrow(
      /NOT_FOUND/,
    );
    expect((await t.run((ctx) => ctx.db.get(keyId)))?.revokedAt).toBeUndefined();
    expect((await t.run((ctx) => ctx.db.get(foreign.id)))?.revokedAt).toBeUndefined();
  });

  it("counts only active keys toward the limit of 30, like the key list", async () => {
    const { t } = await fixture();
    for (let i = 0; i < 30; i++) await insertKey(t, `expired-${i}`, { expiresAt: Date.now() });
    const mint = (i: number) =>
      t.mutation(internal.auth.insertApiKey, {
        tokenHash: `hash-${i}`,
        prefix: "todo_",
        name: `key-${i}`,
        kind: "integration",
      });
    for (let i = 0; i < 29; i++) await mint(i);
    await expect(mint(29)).rejects.toThrow(/höchstens 30/);
  });

  it("records key use at most once per hour", async () => {
    const { t, keyId, tokenHash } = await fixture();
    const lastUsed = async () => (await t.run((ctx) => ctx.db.get(keyId)))?.lastUsedAt;
    await t.mutation(internal.auth.deviceCredential, { tokenHash });
    const first = Date.now();
    expect(await lastUsed()).toBe(first);
    vi.advanceTimersByTime(59 * 60_000);
    await t.mutation(internal.auth.deviceCredential, { tokenHash });
    expect(await lastUsed()).toBe(first);
    vi.advanceTimersByTime(60_000);
    await t.mutation(internal.auth.deviceCredential, { tokenHash });
    expect(await lastUsed()).toBe(Date.now());
  });
});

describe("external API", () => {
  type Client = Awaited<ReturnType<typeof fixture>>["t"];
  const get = (t: Client, path: string) =>
    t.fetch(path, { headers: { authorization: `Bearer ${rawKey}` } });
  /** A JSON POST under its own idempotency key. */
  const post = (t: Client, path: string, key: string, body: object = {}) =>
    t.fetch(path, {
      method: "POST",
      headers: {
        authorization: `Bearer ${rawKey}`,
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify(body),
    });
  type ApiList = { id: string; name: string; kind: string };

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
  it("serves the lists and files captures by listId or by the deprecated area", async () => {
    const { t } = await fixture();
    const lists: ApiList[] = (await (await get(t, "/api/v1/lists")).json()).data;
    expect(lists.map((list) => list.name)).toEqual([
      "Wichtig",
      "me",
      "agency",
      "work",
      "Habits",
      "Verlauf",
      "Wiederholungen",
    ]);
    const [, , agency, work] = lists;
    expect(work).toEqual({
      id: expect.any(String),
      name: "work",
      emoji: "💻",
      color: "#ff453a",
      kind: "tasks",
      favorite: true,
    });
    const byId = await post(t, "/api/v1/tasks", "by-id", {
      title: "Rechnung",
      listId: work!.id,
      section: "backlog",
    });
    expect(byId.status).toBe(201);
    const byArea = await post(t, "/api/v1/tasks", "by-area", {
      title: "Angebot",
      area: "agency",
      list: "backlog",
      projectName: "Kunde",
    });
    expect(byArea.status).toBe(201);
    const inWork = await (await get(t, `/api/v1/tasks?listId=${work!.id}`)).json();
    expect(inWork.data.items).toEqual([
      expect.objectContaining({
        _id: (await byId.json()).data.id,
        listId: work!.id,
        section: "backlog",
      }),
    ]);
    const inAgency = await (await get(t, "/api/v1/tasks?area=agency&list=backlog")).json();
    expect(inAgency.data.items).toHaveLength(1);
    expect(inAgency.data.items[0]).toMatchObject({ title: "Angebot", listId: agency!.id });
    expect(inAgency.data.items[0]).not.toHaveProperty("projectName");
    expect((await get(t, "/api/v1/lists?kind=tasks")).status).toBe(400);
  });
  it("answers foreign and unknown list ids with 404 and special lists with 400", async () => {
    const { t } = await fixture();
    const lists: ApiList[] = (await (await get(t, "/api/v1/lists")).json()).data;
    const habits = lists.find((list) => list.kind === "habits")!;
    const important = lists.find((list) => list.kind === "important")!;
    const agency = lists.find((list) => list.name === "agency")!;
    const foreign = await t.run((ctx) =>
      ctx.db.insert("lists", {
        ownerId: "someone-else",
        name: "Fremd",
        color: "#ff453a",
        kind: "tasks",
        favorite: false,
        position: 0,
        createdAt: Date.now(),
      }),
    );
    const create = (key: string, listId: string) =>
      post(t, "/api/v1/tasks", key, { title: "Task", listId });
    expect((await create("foreign", foreign)).status).toBe(404);
    expect((await create("unknown", "not-a-list")).status).toBe(404);
    expect((await create("habits", habits.id)).status).toBe(400);
    expect((await get(t, `/api/v1/tasks?listId=${foreign}`)).status).toBe(404);
    expect((await get(t, `/api/v1/tasks?listId=${habits.id}`)).status).toBe(200);
    const wichtig = await get(t, `/api/v1/tasks?listId=${important.id}`);
    expect(wichtig.status).toBe(400);
    expect((await wichtig.json()).error.message).toMatch(/view=important/);
    // Completions of deleted lists stay readable, so only ids that cannot be a list are refused.
    expect((await get(t, "/api/v1/completions?listId=not-a-list")).status).toBe(404);
    const foreignHistory = await get(t, `/api/v1/completions?listId=${foreign}`);
    expect((await foreignHistory.json()).data).toEqual({ items: [], nextCursor: null });
    await t.run((ctx) => ctx.db.delete(agency.id as Id<"lists">));
    expect((await get(t, "/api/v1/tasks?area=agency")).status).toBe(404);
    const own = (await (await post(t, "/api/v1/tasks", "own", { title: "Eigene" })).json()).data;
    const move = await post(t, `/api/v1/tasks/${own.id}/move`, "move", { listId: foreign });
    expect(move.status).toBe(404);
    expect(await t.run((ctx) => ctx.db.query("tasks").collect())).toHaveLength(1);
  });
  it("reopens a task completed today through its route", async () => {
    const { t } = await fixture();
    const { id } = (await (await post(t, "/api/v1/tasks", "create", { title: "Belege" })).json())
      .data;
    expect((await post(t, `/api/v1/tasks/${id}/complete`, "complete")).status).toBe(200);
    const reopened = await post(t, `/api/v1/tasks/${id}/reopen`, "reopen");
    expect(reopened.status).toBe(200);
    expect((await reopened.json()).data.id).toBe(id);
    expect((await (await get(t, `/api/v1/tasks/${id}`)).json()).data.state).toBe("open");
    expect(await t.run((ctx) => ctx.db.query("completions").collect())).toEqual([]);
  });
  it("migrates legacy area data before the first HTTP read", async () => {
    vi.setSystemTime(new Date("2026-09-05T10:00:00Z"));
    const { t } = await fixture();
    const now = Date.now();
    const legacy = {
      ownerId,
      kind: "task" as const,
      position: 0,
      isInbox: false,
      isAi: false,
      highPriority: false,
      scheduleVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    await t.run(async (ctx) => {
      await ctx.db.insert("settings", {
        ownerId,
        defaultArea: "work",
        timeZone: "Europe/Berlin",
        currentLocalDate: "2026-09-05",
        habitsInitialized: true,
      });
      const root = await ctx.db.insert("tasks", {
        ...legacy,
        title: "Angebot",
        area: "agency",
        list: "backlog",
        projectName: "Kunde",
        state: "open",
      });
      await ctx.db.insert("tasks", { ...legacy, parentId: root, title: "Entwurf", state: "open" });
      const done = await ctx.db.insert("tasks", {
        ...legacy,
        title: "Rechnung",
        area: "agency",
        state: "done",
        completedAt: now,
        completedLocalDate: "2026-09-04",
        archivedAt: now,
      });
      await ctx.db.insert("completions", {
        ownerId,
        taskId: done,
        titleSnapshot: "Rechnung",
        areaSnapshot: "agency",
        projectNameSnapshot: "Kunde",
        completedAt: now,
        completedLocalDate: "2026-09-04",
        timeZoneSnapshot: "Europe/Berlin",
        kind: "task",
      });
    });
    // Before the migration no list carries the legacy area, so this read would be empty.
    const tasks = await (await get(t, "/api/v1/tasks?area=agency")).json();
    const lists: ApiList[] = (await (await get(t, "/api/v1/lists")).json()).data;
    const agency = lists.find((list) => list.name === "agency")!;
    expect(tasks.data.items).toEqual([
      expect.objectContaining({
        title: "Angebot",
        listId: agency.id,
        section: "backlog",
        subtasks: [expect.objectContaining({ title: "Entwurf", listId: agency.id })],
      }),
    ]);
    expect(tasks.data.items[0]).not.toHaveProperty("area");
    const history = await (await get(t, `/api/v1/completions?listId=${agency.id}`)).json();
    expect(history.data.items).toEqual([
      expect.objectContaining({ titleSnapshot: "Rechnung", listId: agency.id }),
    ]);
    expect((await t.run((ctx) => ctx.db.query("settings").unique()))?.defaultListId).toBe(
      lists.find((list) => list.name === "work")!.id,
    );
  });
  it("rejects unknown fields, oversized payloads and absent idempotency keys", async () => {
    const { t } = await fixture();
    const headers = {
      authorization: `Bearer ${rawKey}`,
      "content-type": "application/json",
      "idempotency-key": "invalid",
    };
    // `list` is the deprecated name of `section`, never a list name.
    for (const extra of [{ ownerId: "intruder" }, { listName: "work" }, { list: "work" }])
      expect(
        (
          await t.fetch("/api/v1/tasks", {
            method: "POST",
            headers,
            body: JSON.stringify({ title: "Task", ...extra }),
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
    // Deprecated aliases never combine with the fields replacing them.
    const lists: ApiList[] = (await (await get(t, "/api/v1/lists")).json()).data;
    const mixed = await post(t, "/api/v1/tasks", "mixed", {
      title: "Task",
      listId: lists[1]!.id,
      area: "work",
    });
    expect(mixed.status).toBe(400);
    expect((await mixed.json()).error.message).toMatch(/nicht zusammen mit listId/);
    expect((await get(t, `/api/v1/tasks?listId=${lists[1]!.id}&area=me`)).status).toBe(400);
    expect((await get(t, "/api/v1/tasks?section=active&list=backlog")).status).toBe(400);
    expect((await get(t, "/api/v1/completions?from=2026-09-05&to=2026-09-01")).status).toBe(400);
    // Query parameters are refused where nothing reads them.
    const misplaced = await post(t, `/api/v1/tasks?listId=${lists[3]!.id}`, "query", {
      title: "Task",
    });
    expect(misplaced.status).toBe(400);
    const { id } = (await (await post(t, "/api/v1/tasks", "plain", { title: "Task" })).json()).data;
    expect((await get(t, `/api/v1/tasks/${id}?view=all`)).status).toBe(400);
    expect((await post(t, `/api/v1/tasks/${id}/complete?force=1`, "force")).status).toBe(400);
    expect(await t.run((ctx) => ctx.db.query("tasks").collect())).toHaveLength(1);
  });
  it("canonicalizes object order and never returns internal exception details", async () => {
    expect(canonicalJson({ b: 1, a: { c: 2 } })).toBe(canonicalJson({ a: { c: 2 }, b: 1 }));
    expect(await errorResponse(new Error("private token secret"), "request").text()).not.toContain(
      "private token secret",
    );
    expect(() =>
      routeCommand("PATCH", new URL("http://local/api/v1/tasks/task"), { parentId: "child" }),
    ).toThrow();
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
