import { createHash } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import {
  createLoginRequest,
  LoginError,
  loopbackLogin,
  resolveSiteUrl,
  ShooLogin,
} from "../src/main/login";

const siteUrl = "https://test-deployment.convex.site";

// Plays the browser: follows the backend's bounce to the loopback listener.
function callbackUrl(authorizeUrl: string, query: Record<string, string>) {
  const state = new URL(authorizeUrl).searchParams.get("state")!;
  const port = state.split(".")[0];
  return `http://127.0.0.1:${port}/callback?${new URLSearchParams({ state, ...query })}`;
}

describe("Shoo-Anmeldung", () => {
  it("baut die Authorize-URL mit PKCE und dem Port im State", () => {
    const request = createLoginRequest(siteUrl, 51234);
    const url = new URL(request.authorizeUrl);
    expect(`${url.origin}${url.pathname}`).toBe("https://shoo.dev/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: `origin:${siteUrl}`,
      redirect_uri: `${siteUrl}/auth/desktop/callback`,
      response_type: "code",
      state: request.state,
      code_challenge: createHash("sha256").update(request.codeVerifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    expect(request.state).toMatch(/^51234\.[A-Za-z0-9_-]{43}$/);
    expect(request.codeVerifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it("nennt CONVEX_SITE_URL, wenn die Backend-Adresse fehlt", () => {
    expect(resolveSiteUrl(`${siteUrl}/`)).toBe(siteUrl);
    for (const value of ["", "https://example.com"])
      expect(() => resolveSiteUrl(value)).toThrow(/CONVEX_SITE_URL/);
  });

  it("wartet auf den passenden Callback und schließt den Listener danach", async () => {
    const seen: number[] = [];
    let page = "";
    let finalUrl = "";
    const result = await loopbackLogin({
      siteUrl,
      signal: new AbortController().signal,
      openBrowser: async (authorizeUrl) => {
        finalUrl = callbackUrl(authorizeUrl, { code: "shoo-code" });
        seen.push((await fetch(finalUrl.replace("/callback", "/other"))).status);
        // `//[` is a valid request target but not a parsable URL.
        seen.push((await fetch(`${new URL(finalUrl).origin}//[`)).status);
        const foreign = new URL(finalUrl);
        foreign.searchParams.set("state", `${foreign.port}.${"x".repeat(43)}`);
        seen.push((await fetch(foreign)).status);
        const response = await fetch(finalUrl);
        seen.push(response.status);
        page = await response.text();
      },
    });
    expect(seen).toEqual([404, 400, 400, 200]);
    expect(result.code).toBe("shoo-code");
    expect(result.codeVerifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(page).toContain("Anmeldung abgeschlossen");
    await expect(fetch(finalUrl)).rejects.toThrow();
  });

  it("bricht ab, wenn Shoo einen Fehler meldet", async () => {
    await expect(
      loopbackLogin({
        siteUrl,
        signal: new AbortController().signal,
        openBrowser: async (authorizeUrl) => {
          await fetch(callbackUrl(authorizeUrl, { error: "access_denied" }));
        },
      }),
    ).rejects.toThrow(
      new LoginError("Shoo hat die Anmeldung nicht bestätigt. Versuche es erneut."),
    );
  });

  it("unterscheidet Abbruch und Zeitüberschreitung", async () => {
    const abort = new AbortController();
    await expect(
      loopbackLogin({ siteUrl, signal: abort.signal, openBrowser: async () => abort.abort() }),
    ).rejects.toThrow("abgebrochen");
    await expect(
      loopbackLogin({
        siteUrl,
        signal: new AbortController().signal,
        openBrowser: async () => {},
        timeoutMs: 10,
      }),
    ).rejects.toThrow("abgelaufen");
  });

  it("lässt nur eine Anmeldung gleichzeitig zu und beachtet einen Abbruch nach dem Browser", async () => {
    const login = new ShooLogin(async (authorizeUrl) => {
      await fetch(callbackUrl(authorizeUrl, { code: "shoo-code" }));
    });
    const started = Promise.withResolvers<void>();
    const exchange = Promise.withResolvers<void>();
    const first = login.run(siteUrl, async (_proof, checkCancelled) => {
      started.resolve();
      await exchange.promise;
      checkCancelled();
      return "gespeichert";
    });
    expect(login.active).toBe(true);
    await expect(login.run(siteUrl, async () => "zweite")).rejects.toThrow("läuft bereits");
    await started.promise;
    login.cancel();
    exchange.resolve();
    await expect(first).rejects.toThrow("abgebrochen");
    expect(login.active).toBe(false);
    expect(await login.run(siteUrl, async ({ code }) => code)).toBe("shoo-code");
  });
});
