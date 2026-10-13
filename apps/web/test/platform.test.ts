// @vitest-environment happy-dom
import type { PlatformState } from "@todo/ui/platform";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { LOGIN_KEY } from "../src/auth";
import { CONNECTION_KEY, createWebPlatform } from "../src/platform";

const siteUrl = "https://test-deployment.eu-west-1.convex.site";
const oldKey = `todo_${"a".repeat(43)}`;
const newKey = `todo_${"b".repeat(43)}`;
const proof = { code: "shoo-code", codeVerifier: "v".repeat(64) };
const token = { token: "header.payload.signature", expiresAt: Date.now() + 3_600_000 };

type Call = { path: string; key?: string; body?: unknown };

/**
 * Stubs the Convex site: `routes` answers per path (status, JSON body) or throws like an
 * offline network; returns the calls with the key that was sent, as a bearer header or as the
 * token request's text/plain body.
 */
function backend(routes: Record<string, (key?: string) => [number, unknown]>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const headers = new Headers(init.headers);
    const sent = typeof init.body === "string" ? init.body : undefined;
    const text = headers.get("content-type")?.startsWith("text/plain");
    const key = text ? sent : headers.get("authorization")?.replace("Bearer ", "");
    calls.push({ path, key, body: sent && !text ? JSON.parse(sent) : undefined });
    const route = routes[path];
    if (!route) throw new TypeError("Failed to fetch");
    const [status, body] = route(key);
    return new Response(JSON.stringify(body), { status });
  });
  return calls;
}

const store = (apiKey: string) =>
  localStorage.setItem(CONNECTION_KEY, JSON.stringify({ siteUrl, apiKey }));
const create = (callback?: Parameters<typeof createWebPlatform>[0]["callback"]) =>
  createWebPlatform({ siteUrl, version: "abc123", callback });

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Web-Plattform", () => {
  it("speichert den neuen Schlüssel nach dem Callback und widerruft den alten", async () => {
    store(oldKey);
    const calls = backend({
      "/auth/desktop-login": () => [200, { key: newKey, prefix: "todo_bbbbbbbb", id: "key2" }],
      "/auth/device-token": () => [200, token],
      "/auth/device-revoke": () => [200, { revoked: true }],
    });
    const platform = create({ proof });
    expect(platform.busy).toBe(true);

    expect(await platform.getState()).toEqual({
      configured: true,
      version: "abc123",
      siteUrl,
      cloudUrl: "https://test-deployment.eu-west-1.convex.cloud",
    });
    expect(platform.busy).toBe(false);
    expect(JSON.parse(localStorage.getItem(CONNECTION_KEY)!)).toEqual({ siteUrl, apiKey: newKey });
    expect(calls).toEqual([
      { path: "/auth/desktop-login", body: { ...proof, deviceName: "todo im Browser" } },
      { path: "/auth/device-token", key: newKey },
      { path: "/auth/device-revoke", key: oldKey },
    ]);
  });

  it("widerruft einen neuen Schlüssel, den das Backend nicht annimmt, und speichert ihn nicht", async () => {
    store(oldKey);
    const calls = backend({
      "/auth/desktop-login": () => [200, { key: newKey, prefix: "todo_bbbbbbbb", id: "key2" }],
      "/auth/device-token": () => [401, {}],
      "/auth/device-revoke": () => [200, { revoked: true }],
    });

    const state = await create({ proof }).getState();
    expect(state.error).toBe(
      "Der neue Geräteschlüssel wurde nicht angenommen. Melde dich erneut an.",
    );
    expect(state.configured).toBe(true);
    expect(JSON.parse(localStorage.getItem(CONNECTION_KEY)!)).toEqual({ siteUrl, apiKey: oldKey });
    expect(calls.filter((call) => call.path === "/auth/device-revoke")).toEqual([
      { path: "/auth/device-revoke", key: newKey },
    ]);
  });

  it("meldet einen abgelehnten Schlüssel beim Token als Fehler", async () => {
    store(oldKey);
    backend({ "/auth/device-token": () => [401, {}] });
    const platform = create();
    const seen: PlatformState[] = [];
    platform.onState((state) => seen.push(state));

    expect(await platform.fetchAccessToken({ forceRefreshToken: false })).toBeNull();
    expect(seen.at(-1)?.error).toBe(
      "Der Geräteschlüssel ist abgelaufen oder wurde widerrufen. Melde dich erneut an.",
    );
  });

  it("behält den Grund einer gescheiterten Neuanmeldung, wenn der alte Schlüssel abgelehnt wird", async () => {
    store(oldKey);
    backend({
      "/auth/desktop-login": () => [
        403,
        { error: { code: "FORBIDDEN", message: "Dieses Shoo-Konto ist nicht freigegeben." } },
      ],
      "/auth/device-token": () => [401, {}],
    });
    const platform = create({ proof });
    expect((await platform.getState()).error).toBe("Dieses Shoo-Konto ist nicht freigegeben.");

    expect(await platform.fetchAccessToken({ forceRefreshToken: false })).toBeNull();
    expect((await platform.getState()).error).toBe("Dieses Shoo-Konto ist nicht freigegeben.");
  });

  it("vergisst die Verbindung beim Abmelden auch offline", async () => {
    store(oldKey);
    localStorage.setItem("todo.sections", "{}");
    const calls = backend({});

    expect(await create().disconnect()).toEqual({ configured: false, version: "abc123" });
    expect(calls).toEqual([{ path: "/auth/device-revoke", key: oldKey }]);
    expect(localStorage.length).toBe(0);
  });

  it("übergeht einen verwaisten Callback, wenn das Gerät schon verbunden ist", async () => {
    const orphan = {
      error: "Diese Anmeldung wurde in einem anderen Fenster gestartet.",
      orphan: true,
    } as const;
    expect((await create(orphan).getState()).error).toBe(orphan.error);
    store(oldKey);
    expect((await create(orphan).getState()).error).toBeUndefined();
  });

  it("lädt neu, wenn die Seite aus dem Back-Forward-Cache zurückkommt", () => {
    const reload = vi.spyOn(location, "reload").mockImplementation(() => {});
    localStorage.setItem(LOGIN_KEY, "{}");
    create();

    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    expect(reload).not.toHaveBeenCalled();
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(reload).toHaveBeenCalled();
    expect(localStorage.getItem(LOGIN_KEY)).toBeNull();
    reload.mockRestore();
  });
});
