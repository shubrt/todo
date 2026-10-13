import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  cloudUrlFromSite,
  createTokenProvider,
  loginDevice,
  NativeApiError,
  normalizeSiteUrl,
  parseConnection,
  revokeDevice,
} from "../src/index";

const connection = {
  siteUrl: "https://test-deployment.eu-west-1.convex.site",
  apiKey: `todo_${"k".repeat(43)}`,
};
const token = "header.payload.signature";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("stored connection", () => {
  it("accepts the stored JSON while preserving the deployment region", () => {
    expect(parseConnection(JSON.stringify(connection))).toEqual(connection);
    expect(normalizeSiteUrl(`${connection.siteUrl}/`)).toBe(connection.siteUrl);
    expect(cloudUrlFromSite(connection.siteUrl)).toBe(
      "https://test-deployment.eu-west-1.convex.cloud",
    );
  });

  it("rejects credential-bearing URLs, foreign hosts, deployment keys and connect links without echoing secrets", () => {
    for (const siteUrl of [
      "http://test-deployment.convex.site",
      "https://user:pass@test-deployment.convex.site",
      "https://test-deployment.convex.site:443",
      "https://test-deployment.convex.site.evil.test",
      `${connection.siteUrl}/path`,
      `${connection.siteUrl}?key=secret`,
      `${connection.siteUrl}#secret`,
    ])
      expect(() => parseConnection(JSON.stringify({ ...connection, siteUrl }))).toThrow(
        NativeApiError,
      );
    for (const input of [
      "secret text",
      `todo://connect#${encodeURIComponent(JSON.stringify(connection))}`,
      JSON.stringify({ ...connection, apiKey: "prod:deployment|secret" }),
      JSON.stringify({ ...connection, ownerId: "other" }),
    ]) {
      try {
        parseConnection(input);
        throw new Error("must reject");
      } catch (error) {
        expect(error).toBeInstanceOf(NativeApiError);
        expect((error as Error).message).not.toContain(connection.apiKey);
      }
    }
  });
});

describe("device login", () => {
  const login = { code: "shoo-code", codeVerifier: "v".repeat(64), deviceName: "todo auf Mac" };

  it("exchanges the Shoo code without a key and validates the returned device key", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ key: connection.apiKey, prefix: "todo_kkkkkkkk", id: "key1" }),
      )
      .mockResolvedValueOnce(Response.json({ key: "prod:deployment|secret", prefix: "", id: "" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await loginDevice(`${connection.siteUrl}/`, login)).toEqual({
      key: connection.apiKey,
      prefix: "todo_kkkkkkkk",
      id: "key1",
    });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${connection.siteUrl}/auth/desktop-login`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).has("authorization")).toBe(false);
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(login);
    await expect(loginDevice(connection.siteUrl, login)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("sends the requested key kind", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ key: connection.apiKey, prefix: "todo_kkkkkkkk", id: "key2" }),
    );
    vi.stubGlobal("fetch", fetcher);
    await loginDevice(connection.siteUrl, { ...login, kind: "integration" });
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ ...login, kind: "integration" });
  });

  it("keeps the backend's setup hint for an unmapped Shoo account", async () => {
    const hint = 'Trage {"https://test.convex.site":"sub-123"} in SHOO_OWNER_SUBJECTS ein.';
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "FORBIDDEN", message: hint } }, { status: 403 }),
      ),
    );
    await expect(loginDevice(connection.siteUrl, login)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      message: hint,
    });
  });

  it("revokes exactly the stored key", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ revoked: true }))
      .mockResolvedValueOnce(
        Response.json({ error: { code: "UNAUTHENTICATED", message: "x" } }, { status: 401 }),
      );
    vi.stubGlobal("fetch", fetcher);
    await revokeDevice(connection);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${connection.siteUrl}/auth/device-revoke`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${connection.apiKey}`);
    await expect(revokeDevice(connection)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("memory token provider", () => {
  it("deduplicates token refreshes, caches in memory and honors forced refresh", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      // Key in a text/plain body and no other header: a CORS simple request without preflight.
      expect([...new Headers(init.headers)]).toEqual([
        ["content-type", "text/plain;charset=UTF-8"],
      ]);
      expect(init.body).toBe(connection.apiKey);
      expect(init.redirect).toBe("error");
      return Response.json({ token, expiresAt: Date.now() + 300_000 });
    });
    vi.stubGlobal("fetch", fetcher);
    const getToken = createTokenProvider(connection);
    expect(
      await Promise.all([
        getToken({ forceRefreshToken: true }),
        getToken({ forceRefreshToken: true }),
      ]),
    ).toEqual([token, token]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await getToken({ forceRefreshToken: false })).toBe(token);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await getToken({ forceRefreshToken: true })).toBe(token);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("clears a rejected token, returns null for revocation and keeps network failures distinct", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token, expiresAt: Date.now() + 300_000 }))
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: "UNAUTHENTICATED", message: connection.apiKey } },
          { status: 401 },
        ),
      )
      .mockRejectedValueOnce(new Error(connection.apiKey));
    vi.stubGlobal("fetch", fetcher);
    const getToken = createTokenProvider(connection);
    expect(await getToken({ forceRefreshToken: false })).toBe(token);
    expect(await getToken({ forceRefreshToken: true })).toBeNull();
    await expect(getToken({ forceRefreshToken: false })).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects successful responses with invalid or expired credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ token: connection.apiKey, expiresAt: Date.now() - 1 })),
    );
    await expect(
      createTokenProvider(connection)({ forceRefreshToken: false }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("keeps valid request ids, drops untrusted ones and never echoes server messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            {
              error: { code: "CONFLICT", message: connection.apiKey },
              requestId: "12345678-1234-4123-8123-123456789abc",
            },
            { status: 409 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json(
            {
              error: { code: "__proto__", message: connection.apiKey },
              requestId: connection.apiKey,
            },
            { status: 500 },
          ),
        ),
    );
    const getToken = createTokenProvider(connection);
    await expect(getToken({ forceRefreshToken: true })).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      requestId: "12345678-1234-4123-8123-123456789abc",
    });
    try {
      await getToken({ forceRefreshToken: true });
      throw new Error("must reject");
    } catch (error) {
      expect(error).toMatchObject({ code: "HTTP_ERROR", status: 500 });
      expect((error as NativeApiError).requestId).toBeUndefined();
      expect((error as Error).message).not.toContain(connection.apiKey);
      expect(JSON.stringify(error)).not.toContain(connection.apiKey);
    }
  });
});
