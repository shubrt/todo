// @vitest-environment happy-dom
import { getFunctionName, type FunctionReference } from "convex/server";
import { act, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ConnectedProvider, PlatformProvider, useTokenRejected } from "../src/connection";
import type { Platform, PlatformState } from "../src/platform";

type Auth = { fetchAccessToken: (options: { forceRefreshToken: boolean }) => Promise<unknown> };
type Prewarm = { query: FunctionReference<"query">; args: unknown; extendSubscriptionFor?: number };
const lifecycle = vi.hoisted(() => ({
  events: [] as string[],
  auth: null as Auth | null,
  options: undefined as unknown,
  prewarmed: [] as Prewarm[],
}));
vi.mock("convex/react", () => {
  class ConvexReactClient {
    closed = false;
    constructor(_url: string, options?: unknown) {
      lifecycle.options = options;
    }
    prewarmQuery(options: Prewarm) {
      lifecycle.prewarmed.push(options);
    }
    clearAuth() {
      if (this.closed) throw new Error("ConvexReactClient has already been closed.");
      lifecycle.events.push("clearAuth");
    }
    close() {
      this.closed = true;
      lifecycle.events.push("close");
      return Promise.resolve();
    }
  }
  return {
    ConvexReactClient,
    ConvexProviderWithAuth({
      client,
      useAuth,
      children,
    }: {
      client: ConvexReactClient;
      useAuth: () => Auth;
      children: ReactNode;
    }) {
      lifecycle.auth = useAuth();
      useEffect(() => () => client.clearAuth(), [client]);
      return children;
    },
  };
});

const state: PlatformState = {
  configured: true,
  version: "0.2.0",
  cloudUrl: "https://todo-test.convex.cloud",
};
const fetchAccessToken = vi.fn<Platform["fetchAccessToken"]>();
const platform: Platform = {
  kind: "web",
  getState: async () => state,
  onState: () => () => {},
  login: vi.fn(),
  cancelLogin: vi.fn(),
  disconnect: vi.fn(),
  fetchAccessToken,
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  lifecycle.events = [];
  lifecycle.prewarmed = [];
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => container.remove());

function Rejected() {
  return String(useTokenRejected());
}
const renderConnected = (children: ReactNode) =>
  act(async () =>
    root.render(
      <PlatformProvider platform={platform}>
        <ConnectedProvider cloudUrl="https://todo-test.convex.cloud">{children}</ConnectedProvider>
      </PlatformProvider>,
    ),
  );

describe("Convex-Verbindungswechsel", () => {
  it("hält Anfragen bis zum ersten Token zurück und schickt die Startabfragen mit", async () => {
    localStorage.setItem("todo.start", JSON.stringify({ id: "l-work", kind: "tasks" }));
    // The page's first client, started right after load.
    const now = vi.spyOn(performance, "now").mockReturnValue(300);
    await renderConnected("Aufgaben");
    now.mockRestore();
    expect(lifecycle.options).toEqual({ expectAuth: true, initialAuthTokenReuse: true });
    expect(
      lifecycle.prewarmed.map(({ query, args, extendSubscriptionFor }) => [
        getFunctionName(query),
        args,
        extendSubscriptionFor,
      ]),
    ).toEqual([
      ["lists:list", {}, 30_000],
      ["settings:get", {}, 30_000],
      ["tasks:list", { view: "list", listId: "l-work" }, 30_000],
      ["tasks:deferred", { listId: "l-work" }, 30_000],
    ]);
    await act(async () => root.unmount());
  });

  it("holt das zweite Token wie bisher, wenn der erste Client der Seite spät startet", async () => {
    // A fresh page module, so this client is the page's first; React must come from the same
    // module registry as the component.
    vi.resetModules();
    const [react, dom, fresh] = await Promise.all([
      import("react"),
      import("react-dom/client"),
      import("../src/connection"),
    ]);
    const now = vi.spyOn(performance, "now").mockReturnValue(60_000);
    const late = dom.createRoot(container);
    await react.act(async () =>
      late.render(
        <fresh.PlatformProvider platform={platform}>
          <fresh.ConnectedProvider cloudUrl="https://todo-test.convex.cloud">
            Aufgaben
          </fresh.ConnectedProvider>
        </fresh.PlatformProvider>,
      ),
    );
    now.mockRestore();
    expect(lifecycle.options).toEqual({ expectAuth: true, initialAuthTokenReuse: false });
    await react.act(async () => late.unmount());
  });

  it("räumt die Anmeldung vor dem Schließen des Clients auf", async () => {
    await renderConnected("Aufgaben");
    await act(async () => root.unmount());
    expect(lifecycle.events).toEqual(["clearAuth", "close"]);
  });

  it("unterscheidet einen abgelehnten Geräteschlüssel von fehlendem Netz", async () => {
    await renderConnected(<Rejected />);
    const fetchToken = () =>
      act(async () => lifecycle.auth!.fetchAccessToken({ forceRefreshToken: false }));

    fetchAccessToken.mockResolvedValueOnce(null);
    await fetchToken();
    expect(container.textContent).toBe("true");

    fetchAccessToken.mockRejectedValueOnce(new Error("nicht erreichbar"));
    expect(await fetchToken()).toBeNull();
    expect(container.textContent).toBe("false");

    fetchAccessToken.mockResolvedValueOnce(null);
    await fetchToken();
    fetchAccessToken.mockResolvedValueOnce("token");
    expect(await fetchToken()).toBe("token");
    expect(container.textContent).toBe("false");
    await act(async () => root.unmount());
  });
});
