import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { convexTest } from "convex-test";
import { exportJWK, generateKeyPair, jwtVerify } from "jose";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { sha256 } from "../convex/authCrypto";

const modules = import.meta.glob("../convex/**/*.ts");
const ownerId = "native-owner";
const rawKey = `todo_${"d".repeat(43)}`;
const headers = { authorization: `Bearer ${rawKey}` };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-05T09:00:00Z"));
  vi.stubEnv("TODO_OWNER_ID", ownerId);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function fixture(expiresAt?: number) {
  const t = convexTest(schema, modules);
  const tokenHash = await sha256(rawKey);
  const keyId = await t.run((ctx) =>
    ctx.db.insert("apiKeys", {
      ownerId,
      name: "My phone",
      prefix: rawKey.slice(0, 13),
      tokenHash,
      createdAt: Date.now(),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    }),
  );
  return { t, keyId, tokenHash, device: t.withIdentity({ subject: ownerId, apiKeyId: keyId }) };
}

async function createHabits(device: Awaited<ReturnType<typeof fixture>>["device"]) {
  for (const title of ["Read", "Walk", "Stretch", "Water", "Plan"])
    await device.mutation(api.recurrences.create, {
      title,
      kind: "habit",
      rule: { frequency: "daily" },
    });
}

async function signingKeys() {
  const keys = await generateKeyPair("ES256", { extractable: true });
  vi.stubEnv("AUTH_JWT_ISSUER", "https://test-deployment.eu-west-1.convex.site");
  vi.stubEnv(
    "AUTH_JWT_PRIVATE_JWK",
    JSON.stringify({ ...(await exportJWK(keys.privateKey)), kid: "native" }),
  );
  vi.stubEnv(
    "AUTH_JWT_PUBLIC_JWKS",
    JSON.stringify({ keys: [{ ...(await exportJWK(keys.publicKey)), kid: "native" }] }),
  );
  return keys;
}

describe("native credential bridge", () => {
  it("limits tokens for non-expiring keys to five minutes and fails closed without signing configuration", async () => {
    const { t } = await fixture();
    vi.stubEnv("AUTH_JWT_ISSUER", "");
    expect((await t.fetch("/auth/device-token", { method: "POST", headers })).status).toBe(503);
    await signingKeys();
    const result = await (await t.fetch("/auth/device-token", { method: "POST", headers })).json();
    expect(result.expiresAt - Date.now()).toBe(300_000);
  });

  it("issues owner-bound ES256 tokens with a distinct key claim and bounded expiry", async () => {
    const expiry = Date.now() + 70_000;
    const { t, keyId } = await fixture(expiry);
    const keys = await signingKeys();
    const response = await t.fetch("/auth/device-token", { method: "POST", headers });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json();
    const verified = await jwtVerify(result.token, keys.publicKey, {
      issuer: "https://test-deployment.eu-west-1.convex.site",
      audience: "todo",
      algorithms: ["ES256"],
    });
    expect(verified.payload.sub).toBe(ownerId);
    expect(verified.payload.apiKeyId).toBe(keyId);
    expect(verified.payload.sid).toBeUndefined();
    expect(result.expiresAt).toBeLessThanOrEqual(expiry);
    expect(verified.payload.exp! * 1000).toBe(result.expiresAt);
    expect(JSON.stringify(result)).not.toContain(rawKey);
    expect((await t.run((ctx) => ctx.db.get(keyId)))?.expiryScheduledAt).toBe(expiry);
  });

  it("rejects revoked, expired, malformed and foreign-owner credentials before signing", async () => {
    const { t, keyId } = await fixture();
    const send = (authorization = headers.authorization) =>
      t.fetch("/auth/device-token", {
        method: "POST",
        headers: { authorization },
      });
    expect((await send("Bearer invalid")).status).toBe(401);
    await t.run((ctx) => ctx.db.patch(keyId, { ownerId: "other" }));
    expect((await send()).status).toBe(401);
    await t.run((ctx) => ctx.db.patch(keyId, { ownerId, expiresAt: Date.now() }));
    expect((await send()).status).toBe(401);
    await t.run((ctx) => ctx.db.patch(keyId, { expiresAt: undefined, revokedAt: Date.now() }));
    expect((await send()).status).toBe(401);
    vi.stubEnv("TODO_OWNER_ID", "");
    expect((await send()).status).toBe(401);
  });

  it("accepts only device JWTs and rechecks the key on every read", async () => {
    const { t, device, keyId } = await fixture();
    const id = await device.mutation(api.tasks.create, { title: "Native capture" });
    for (const identity of [
      { subject: ownerId, sid: "former-browser-session" },
      { subject: ownerId, apiKeyId: keyId, sid: "former-browser-session" },
      { subject: "other", apiKeyId: keyId },
    ])
      await expect(t.withIdentity(identity).query(api.tasks.list, {})).rejects.toThrow(
        /UNAUTHENTICATED/,
      );
    await t.run((ctx) => ctx.db.patch(keyId, { revokedAt: Date.now() }));
    await expect(device.query(api.tasks.list, {})).rejects.toThrow(/UNAUTHENTICATED/);
    await expect(device.mutation(api.tasks.complete, { taskId: id })).rejects.toThrow(
      /UNAUTHENTICATED/,
    );
    expect((await t.run((ctx) => ctx.db.get(id)))?.state).toBe("open");
  });

  it("revokes exactly the presenting key, which then can no longer get device tokens", async () => {
    const { t, keyId } = await fixture();
    await signingKeys();
    const otherKey = `todo_${"e".repeat(43)}`;
    await t.run(async (ctx) =>
      ctx.db.insert("apiKeys", {
        ownerId,
        name: "Other Mac",
        prefix: otherKey.slice(0, 13),
        tokenHash: await sha256(otherKey),
        createdAt: Date.now(),
      }),
    );
    const post = (path: string, authorization = headers.authorization) =>
      t.fetch(path, { method: "POST", headers: { authorization } });
    const revoked = await post("/auth/device-revoke");
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ revoked: true });
    expect((await t.run((ctx) => ctx.db.get(keyId)))?.revokedAt).toBe(Date.now());
    expect((await post("/auth/device-token")).status).toBe(401);
    expect((await post("/auth/device-revoke")).status).toBe(401);
    expect((await post("/auth/device-revoke", "Bearer invalid")).status).toBe(401);
    expect((await post("/auth/device-token", `Bearer ${otherKey}`)).status).toBe(200);
  });

  it("keeps integration keys on /api/v1 and refuses them a Convex JWT", async () => {
    const { t, keyId } = await fixture();
    await signingKeys();
    await t.run((ctx) => ctx.db.patch(keyId, { kind: "integration" }));
    expect((await t.fetch("/auth/device-token", { method: "POST", headers })).status).toBe(403);
    expect((await t.fetch("/api/v1/tasks", { headers })).status).toBe(200);
    await t.run((ctx) => ctx.db.patch(keyId, { kind: "device" }));
    expect((await t.fetch("/auth/device-token", { method: "POST", headers })).status).toBe(200);
  });

  it("schedules expiration for existing device keys and writes revocation when it is due", async () => {
    const expiry = Date.now() + 1000;
    const { t, device, keyId, tokenHash } = await fixture(expiry);
    await t.mutation(internal.auth.deviceCredential, { tokenHash });
    await t.mutation(internal.auth.deviceCredential, { tokenHash });
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toHaveLength(1);
    expect(await device.query(api.tasks.list, {})).toEqual([]);
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1000));
    expect((await t.run((ctx) => ctx.db.get(keyId)))?.revokedAt).toBeGreaterThanOrEqual(expiry);
    await expect(device.query(api.tasks.list, {})).rejects.toThrow(/UNAUTHENTICATED/);
  });
});

describe("widget habit snapshot", () => {
  it("returns today's progress and makes repeated widget completions idempotent", async () => {
    const { t, device } = await fixture();
    await createHabits(device);
    await device.mutation(api.tasks.create, { title: "Not a habit", isInbox: false });
    const first = await (await t.fetch("/api/v1/habits/snapshot", { headers })).json();
    expect(first.data).toMatchObject({
      localDate: "2026-09-05",
      timeZone: "Europe/Berlin",
      completedCount: 0,
      totalCount: 5,
    });
    const habit = first.data.habits[0];
    const complete = () =>
      t.fetch(`/api/v1/tasks/${habit.id}/complete`, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "idempotency-key": "widget-tap",
        },
        body: JSON.stringify({ occurrenceKey: habit.occurrenceKey }),
      });
    expect((await complete()).status).toBe(200);
    expect((await complete()).status).toBe(200);
    const after = await (await t.fetch("/api/v1/habits/snapshot", { headers })).json();
    expect(after.data.completedCount).toBe(1);
    expect(after.data.habits.find((item: { id: string }) => item.id === habit.id)?.completed).toBe(
      true,
    );
    expect(await t.run((ctx) => ctx.db.query("completions").collect())).toHaveLength(1);
    expect((await t.fetch("/api/v1/habits/snapshot", {})).status).toBe(401);
    expect((await t.fetch("/api/v1/habits/snapshot?ownerId=other", { headers })).status).toBe(400);
  });

  it("advances across midnight without a cron tick and rejects the previous habit occurrence", async () => {
    const { t, device } = await fixture();
    await createHabits(device);
    const old = await (await t.fetch("/api/v1/habits/snapshot", { headers })).json();
    vi.setSystemTime(new Date("2026-09-05T22:00:01Z"));
    const current = await (await t.fetch("/api/v1/habits/snapshot", { headers })).json();
    expect(current.data.localDate).toBe("2026-09-06");
    expect(current.data.habits).toHaveLength(5);
    expect(
      current.data.habits.every(
        (item: { occurrenceKey: string }) => item.occurrenceKey === "2026-09-06",
      ),
    ).toBe(true);
    const stale = await t.fetch(`/api/v1/tasks/${old.data.habits[0].id}/complete`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "idempotency-key": "stale-widget-tap",
      },
      body: JSON.stringify({ occurrenceKey: old.data.localDate }),
    });
    expect(stale.status).toBe(409);
    expect(await t.run((ctx) => ctx.db.query("completions").collect())).toHaveLength(0);
  });

  it("computes the next reset in the owner timezone across the 23-hour DST day", async () => {
    vi.setSystemTime(new Date("2026-03-28T23:00:00Z"));
    const { t } = await fixture();
    const response = await t.fetch("/api/v1/habits/snapshot", { headers });
    const snapshot = (await response.json()).data;
    expect(snapshot.localDate).toBe("2026-03-29");
    expect(snapshot.nextResetAt - snapshot.generatedAt).toBe(23 * 3_600_000);
    expect(snapshot.habits).toEqual([]);
    expect(snapshot.completedCount).toBe(0);
  });
});
