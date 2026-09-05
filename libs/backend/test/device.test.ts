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
  const sessionId = await t.run((ctx) =>
    ctx.db.insert("sessions", {
      ownerId,
      tokenHash: "browser-session",
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 86_400_000,
    }),
  );
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
  return {
    t,
    keyId,
    tokenHash,
    sessionId,
    browser: t.withIdentity({ subject: ownerId, sid: sessionId }),
    device: t.withIdentity({ subject: ownerId, apiKeyId: keyId }),
  };
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
    expect(await t.run((ctx) => ctx.db.query("sessions").collect())).toHaveLength(1);
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

  it("allows task operations, rechecks revoked keys and prevents device key administration", async () => {
    const { t, device, browser, keyId, sessionId } = await fixture();
    const id = await device.mutation(api.tasks.create, { title: "Native capture" });
    expect((await browser.query(api.tasks.list, {}))[0]?._id).toBe(id);
    await expect(device.query(api.auth.listApiKeys, {})).rejects.toThrow(/UNAUTHENTICATED/);
    await expect(device.action(api.auth.createApiKey, { name: "Persist access" })).rejects.toThrow(
      /UNAUTHENTICATED/,
    );
    await expect(device.mutation(api.auth.revokeApiKey, { id: keyId })).rejects.toThrow(
      /UNAUTHENTICATED/,
    );
    await expect(
      t
        .withIdentity({ subject: ownerId, apiKeyId: keyId, sid: sessionId })
        .query(api.tasks.list, {}),
    ).rejects.toThrow(/UNAUTHENTICATED/);
    await expect(
      t.withIdentity({ subject: "other", apiKeyId: keyId }).query(api.tasks.list, {}),
    ).rejects.toThrow(/UNAUTHENTICATED/);
    await browser.mutation(api.auth.revokeApiKey, { id: keyId });
    await expect(device.query(api.tasks.list, {})).rejects.toThrow(/UNAUTHENTICATED/);
    await expect(device.mutation(api.tasks.complete, { taskId: id })).rejects.toThrow(
      /UNAUTHENTICATED/,
    );
    expect((await browser.query(api.tasks.list, {}))[0]?.state).toBe("open");
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
    const { t, browser } = await fixture();
    await browser.mutation(api.settings.initializeHabits, {
      titles: ["Read", "Walk", "Stretch", "Water", "Plan"],
    });
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
    const { t, browser } = await fixture();
    await browser.mutation(api.settings.initializeHabits, {
      titles: ["Read", "Walk", "Stretch", "Water", "Plan"],
    });
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
