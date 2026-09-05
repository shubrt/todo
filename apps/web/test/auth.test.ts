import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  configuration,
  csrfForSession,
  handleAuthRequest,
  signLogin,
  verifyCsrf,
  verifyLogin,
} from "../src/server/auth";

const origin = "https://todo.localhost";
const secret = "s".repeat(43);
beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
  vi.stubEnv("AUTH_COOKIE_SECRET", secret);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browser auth boundary", () => {
  it("rejects tampered, expired, future or mismatched login transactions", () => {
    const value = { state: "state", verifier: "v".repeat(64), createdAt: 1000 };
    const signed = signLogin(value, secret);
    expect(verifyLogin(signed, "state", secret, 1100)).toEqual(value);
    expect(verifyLogin(`${signed}x`, "state", secret, 1100)).toBeNull();
    expect(verifyLogin(signed, "different", secret, 1100)).toBeNull();
    expect(verifyLogin(signed, "state", secret, 601_000)).toBeNull();
    expect(verifyLogin(signed, "state", secret, 999)).toBeNull();
  });
  it("requires exact Origin and a session-bound CSRF token for writes", () => {
    const config = configuration()!;
    const headers = { origin, "x-csrf-token": csrfForSession("session", secret) };
    expect(verifyCsrf(new Request(origin, { method: "POST", headers }), "session", config)).toBe(
      true,
    );
    expect(
      verifyCsrf(
        new Request(origin, {
          method: "POST",
          headers: { ...headers, origin: "https://evil.example" },
        }),
        "session",
        config,
      ),
    ).toBe(false);
    expect(
      verifyCsrf(new Request(origin, { method: "POST", headers }), "different-session", config),
    ).toBe(false);
    expect(verifyCsrf(new Request(origin, { method: "POST" }), "session", config)).toBe(false);
  });
  it("creates secure HttpOnly SameSite state cookie and correct Shoo PKCE parameters", async () => {
    const response = await handleAuthRequest(new Request(`${origin}/api/auth/login`));
    const redirect = new URL(response.headers.get("location")!);
    expect(redirect.origin).toBe("https://shoo.dev");
    expect(redirect.searchParams.get("client_id")).toBe(`origin:${origin}`);
    expect(redirect.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/callback`);
    expect(redirect.searchParams.get("code_challenge_method")).toBe("S256");
    expect(redirect.searchParams.get("code_challenge")).toHaveLength(43);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Lax");
    expect(response.headers.get("set-cookie")).toContain("; Secure");
  });
  it("does not exchange a Shoo code when state is invalid", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await handleAuthRequest(
      new Request(`${origin}/api/auth/callback?code=code&state=invalid`),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?authError=invalid_login");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("provides verified identity setup without ever issuing a session cookie", async () => {
    const transaction = signLogin(
      { state: "state", verifier: "v".repeat(64), createdAt: Date.now(), purpose: "identity" },
      secret,
    );
    const fetch = vi.fn(async () => Response.json({ origin, subject: "verified-sub" }));
    vi.stubGlobal("fetch", fetch);
    const response = await handleAuthRequest(
      new Request(`${origin}/api/auth/callback?code=code&state=state`, {
        headers: { cookie: `todo_login=${transaction}` },
      }),
    );
    expect((await response.json()).SHOO_OWNER_SUBJECTS).toEqual({ [origin]: "verified-sub" });
    expect(fetch).toHaveBeenCalledWith("https://test.convex.site/auth/identity", expect.anything());
    expect(response.headers.get("set-cookie")).not.toContain("todo_session");
  });
  it("fails closed with missing configuration and refuses nonlocal cleartext origins", async () => {
    vi.stubEnv("APP_ORIGIN", "http://todo.example");
    expect(configuration()).toBeNull();
    expect(
      (await (await handleAuthRequest(new Request(`${origin}/api/auth/session`))).json())
        .configured,
    ).toBe(false);
    expect((await handleAuthRequest(new Request(`${origin}/api/auth/login`))).status).toBe(503);
  });
  it("refuses cross-site token requests before calling backend", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await handleAuthRequest(
      new Request(`${origin}/api/auth/token`, {
        method: "POST",
        headers: { cookie: "todo_session=secret-session", origin: "https://evil.example" },
      }),
    );
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps session cookies on transient backend failure and clears after confirmed logout", async () => {
    const session = "session";
    const request = () =>
      new Request(`${origin}/api/auth/logout`, {
        method: "POST",
        headers: {
          cookie: `todo_session=${session}`,
          origin,
          "x-csrf-token": csrfForSession(session, secret),
        },
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    const failed = await handleAuthRequest(request());
    expect(failed.status).toBe(503);
    expect(failed.headers.get("set-cookie")).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ authenticated: false })),
    );
    const success = await handleAuthRequest(request());
    expect(success.status).toBe(200);
    expect(success.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
