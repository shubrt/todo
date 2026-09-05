// @vitest-environment happy-dom
import { act, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";
import { ConnectedProvider } from "../src/renderer/platform";

const lifecycle = vi.hoisted(() => ({ events: [] as string[] }));
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
      children,
    }: {
      client: ConvexReactClient;
      children: ReactNode;
    }) {
      useEffect(() => () => client.clearAuth(), [client]);
      return children;
    },
  };
});

describe("Convex-Verbindungswechsel", () => {
  it("räumt die Anmeldung vor dem Schließen des Clients auf", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    lifecycle.events = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <ConnectedProvider cloudUrl="https://todo-test.convex.cloud">Aufgaben</ConnectedProvider>,
      ),
    );
    await act(async () => root.unmount());
    expect(lifecycle.events).toEqual(["clearAuth", "close"]);
    container.remove();
  });
});
