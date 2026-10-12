// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { watchVersion } from "../src/version";

let idle = true;
let served: string | Error = "a";
const fetcher = vi.fn(async () => {
  if (served instanceof Error) throw served;
  return { json: async () => ({ version: served }) };
});
const reload = vi.fn();

// Brings the app to the foreground and lets the version check finish.
async function show() {
  document.dispatchEvent(new Event("visibilitychange"));
  await new Promise((resolve) => setTimeout(resolve));
}

beforeAll(() => {
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(location, "reload").mockImplementation(reload);
  watchVersion("a", () => idle);
});
beforeEach(() => {
  fetcher.mockClear();
  reload.mockClear();
});

describe("Aktualisierung", () => {
  it("lädt neu, wenn eine andere Version läuft und nichts offen ist", async () => {
    served = "b";
    idle = true;
    await show();
    expect(fetcher).toHaveBeenCalledWith("/version.json", { cache: "no-store" });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("wartet bei gleicher Version, offenem Panel oder ohne Netz", async () => {
    served = "a";
    await show();
    served = new Error("offline");
    await show();
    served = "b";
    idle = false;
    await show();
    expect(reload).not.toHaveBeenCalled();
  });
});
