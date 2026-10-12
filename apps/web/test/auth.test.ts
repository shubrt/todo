// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { beginLogin, codeChallenge, LOGIN_KEY, takeCallback } from "../src/auth";

const siteUrl = "https://test-deployment.eu-west-1.convex.site";

// Plays the Convex bounce: opens /auth/callback with the state of the started login.
async function returnFromShoo(query: (state: string) => Record<string, string>) {
  const state = new URL(await beginLogin(siteUrl)).searchParams.get("state")!;
  history.replaceState(null, "", `/auth/callback?${new URLSearchParams(query(state))}`);
}

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
});
afterEach(() => vi.useRealTimers());

describe("Shoo-Anmeldung im Browser", () => {
  it("rechnet die S256-Challenge wie RFC 7636 Anhang B", async () => {
    expect(await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("baut die Authorize-URL wie der Mac, mit web.-State", async () => {
    const url = new URL(await beginLogin(siteUrl));
    const pending = JSON.parse(localStorage.getItem(LOGIN_KEY)!) as { codeVerifier: string };
    expect(`${url.origin}${url.pathname}`).toBe("https://shoo.dev/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: `origin:${siteUrl}`,
      redirect_uri: `${siteUrl}/auth/desktop/callback`,
      response_type: "code",
      state: expect.stringMatching(/^web\.[A-Za-z0-9_-]{43}$/),
      code_challenge: await codeChallenge(pending.codeVerifier),
      code_challenge_method: "S256",
    });
    expect(pending.codeVerifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it("nimmt den Code aus der Adresse und verbraucht die Anmeldung", async () => {
    await returnFromShoo((state) => ({ code: "shoo-code", state }));
    const { codeVerifier } = JSON.parse(localStorage.getItem(LOGIN_KEY)!) as {
      codeVerifier: string;
    };
    expect(takeCallback(location)).toEqual({ proof: { code: "shoo-code", codeVerifier } });
    expect(location.pathname + location.search).toBe("/");
    expect(localStorage.getItem(LOGIN_KEY)).toBeNull();
    // Single use: the same callback again finds no pending login.
    history.replaceState(null, "", "/auth/callback?code=shoo-code");
    expect(takeCallback(location)).toMatchObject({ orphan: true });
  });

  it("lehnt fremde, abgelaufene und abgebrochene Rückkehrer ab", async () => {
    await returnFromShoo(() => ({ code: "shoo-code", state: `web.${"x".repeat(43)}` }));
    expect(takeCallback(location)).toEqual({ error: "Diese Anmeldung gehört nicht zu todo." });

    vi.useFakeTimers({ toFake: ["Date"] });
    await returnFromShoo((state) => ({ code: "shoo-code", state }));
    vi.advanceTimersByTime(10 * 60_000);
    expect(takeCallback(location)).toEqual({
      error: "Die Anmeldung ist abgelaufen. Bitte versuche es erneut.",
    });
    vi.useRealTimers();

    await returnFromShoo((state) => ({ error: "access_denied", state }));
    expect(takeCallback(location)).toEqual({
      error: "Shoo hat die Anmeldung nicht bestätigt. Versuche es erneut.",
    });
    expect(localStorage.getItem(LOGIN_KEY)).toBeNull();
  });

  it("lässt andere Seiten und die laufende Anmeldung in Ruhe", async () => {
    await beginLogin(siteUrl);
    history.replaceState(null, "", "/?code=x");
    expect(takeCallback(location)).toBeUndefined();
    expect(location.search).toBe("?code=x");
    expect(localStorage.getItem(LOGIN_KEY)).not.toBeNull();
  });
});
