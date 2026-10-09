// @vitest-environment happy-dom
import { act, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ConnectedProvider, PlatformProvider, useTokenRejected } from "../src/renderer/platform";
import type { DesktopBridge, PublicDesktopState } from "../src/shared/contracts";

type Auth = { fetchAccessToken: (options: { forceRefreshToken: boolean }) => Promise<unknown> };
const lifecycle = vi.hoisted(() => ({ events: [] as string[], auth: null as Auth | null }));
vi.mock("convex/react", () => {
  class ConvexReactClient {
    closed = false;
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

const state: PublicDesktopState = {
  configured: true,
  version: "0.2.0",
  cloudUrl: "https://todo-test.convex.cloud",
  preferences: { alwaysOnTop: true, allSpaces: true, launchAtLogin: false, shortcut: "" },
};
const fetchAccessToken = vi.fn<DesktopBridge["fetchAccessToken"]>();
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  lifecycle.events = [];
  Object.assign(window, {
    desktop: { getState: async () => state, onState: () => () => {}, fetchAccessToken },
  });
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
      <PlatformProvider>
        <ConnectedProvider cloudUrl="https://todo-test.convex.cloud">{children}</ConnectedProvider>
      </PlatformProvider>,
    ),
  );

describe("Convex-Verbindungswechsel", () => {
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
