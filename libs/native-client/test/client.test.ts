import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  cloudUrlFromSite,
  completeHabit,
  createTokenProvider,
  fetchHabitSnapshot,
  NativeApiError,
  normalizeSiteUrl,
  parseConnection,
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

describe("connection onboarding", () => {
  it("accepts JSON and local QR fragments while preserving the deployment region", () => {
    const json = JSON.stringify(connection);
    expect(parseConnection(json)).toEqual(connection);
    expect(parseConnection(`todo://connect#${encodeURIComponent(json)}`)).toEqual(connection);
    expect(
      parseConnection(
        `todo://connect#${btoa(json).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`,
      ),
    ).toEqual(connection);
    expect(normalizeSiteUrl(`${connection.siteUrl}/`)).toBe(connection.siteUrl);
    expect(cloudUrlFromSite(connection.siteUrl)).toBe(
      "https://test-deployment.eu-west-1.convex.cloud",
    );
  });

  it("rejects credential-bearing URLs, foreign hosts, deployment keys and malformed QR data without echoing secrets", () => {
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
      `todo://connect?key=${connection.apiKey}`,
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

describe("memory token provider", () => {
  it("deduplicates token refreshes, caches in memory and honors forced refresh", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${connection.apiKey}`);
      expect(init.body).toBeUndefined();
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
});

describe("widget client", () => {
  it("validates and unwraps a complete snapshot", async () => {
    const snapshot = {
      generatedAt: Date.now(),
      localDate: "2026-09-05",
      timeZone: "Europe/Berlin",
      nextResetAt: Date.now() + 60_000,
      habits: [{ id: "habit1", title: "Read", completed: false, occurrenceKey: "2026-09-05" }],
      completedCount: 0,
      totalCount: 1,
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: snapshot, requestId: "one" }))
      .mockResolvedValueOnce(Response.json({ data: { habits: [] } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchHabitSnapshot(connection)).toEqual(snapshot);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`${connection.siteUrl}/api/v1/habits/snapshot`);
    await expect(fetchHabitSnapshot(connection)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("retries an uncertain completion with exactly the same command identity and occurrence", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection lost after commit"))
      .mockResolvedValueOnce(Response.json({ data: { id: "habit1" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await completeHabit(connection, "habit1", "2026-09-05", "saved-command-uuid")).toEqual({
      id: "habit1",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetcher.mock.calls) {
      expect(url).toBe(`${connection.siteUrl}/api/v1/tasks/habit1/complete`);
      expect(new Headers(init.headers).get("idempotency-key")).toBe("saved-command-uuid");
      expect(JSON.parse(init.body)).toEqual({ occurrenceKey: "2026-09-05" });
    }
  });

  it("does not retry stale occurrences and never includes server-supplied secrets in errors", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          error: { code: "CONFLICT", message: connection.apiKey },
          requestId: "12345678-1234-4123-8123-123456789abc",
        },
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(completeHabit(connection, "habit1", "2026-09-04")).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      requestId: "12345678-1234-4123-8123-123456789abc",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("drops untrusted request identifiers and error codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: { code: "__proto__", message: connection.apiKey },
            requestId: connection.apiKey,
          },
          { status: 500 },
        ),
      ),
    );
    try {
      await fetchHabitSnapshot(connection);
      throw new Error("must reject");
    } catch (error) {
      expect(error).toMatchObject({ code: "HTTP_ERROR", status: 500 });
      expect((error as NativeApiError).requestId).toBeUndefined();
      expect(JSON.stringify(error)).not.toContain(connection.apiKey);
    }
  });
});
