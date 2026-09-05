import { expect, it } from "vite-plus/test";
import { retainClient } from "../src/lib/client-lifecycle";

it("releases a client after the descendant provider can clear authentication", async () => {
  const events: string[] = [];
  let closed = false;
  const release = retainClient({
    close: async () => {
      closed = true;
      events.push("close");
    },
  });
  release();
  expect(closed).toBe(false);
  events.push("clearAuth");
  await Promise.resolve();
  expect(events).toEqual(["clearAuth", "close"]);
});

it("keeps a client alive during effect cleanup/setup replay", async () => {
  let closes = 0;
  const client = {
    close: async () => {
      closes++;
    },
  };
  retainClient(client)();
  const release = retainClient(client);
  await Promise.resolve();
  expect(closes).toBe(0);
  release();
  release();
  await Promise.resolve();
  expect(closes).toBe(1);
});

it("still closes the old client when another connection replaces it", async () => {
  const events: string[] = [];
  const releaseOld = retainClient({
    close: async () => {
      events.push("old");
    },
  });
  releaseOld();
  const releaseNew = retainClient({
    close: async () => {
      events.push("new");
    },
  });
  await Promise.resolve();
  expect(events).toEqual(["old"]);
  releaseNew();
  await Promise.resolve();
  expect(events).toEqual(["old", "new"]);
});
