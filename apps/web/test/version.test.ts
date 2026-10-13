// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { watchVersion } from "../src/version";

let idle = true;
let served: string | Error = "a";
const html = '<script type="module" src="/assets/index-b.js"></script>';
const response = (ok: boolean) => ({ ok, text: async () => html, clone: () => response(ok) });
let page = response(true);
const fetcher = vi.fn(async (url: string) => {
  if (served instanceof Error) throw served;
  return url === "/" ? page : { json: async () => ({ version: served }) };
});
const put = vi.fn(async () => {});
const add = vi.fn(async (_path: string) => {});
const open = vi.fn(async () => ({ put, add, match: async () => undefined }));
const reload = vi.fn();

// Brings the app to the foreground and lets the version check finish.
async function show() {
  document.dispatchEvent(new Event("visibilitychange"));
  await new Promise((resolve) => setTimeout(resolve));
}

beforeAll(() => {
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("caches", { open });
  vi.spyOn(location, "reload").mockImplementation(reload);
  watchVersion("a", () => idle);
});
beforeEach(() => {
  fetcher.mockClear();
  put.mockClear();
  add.mockReset();
  reload.mockClear();
  page = response(true);
});

describe("Aktualisierung", () => {
  it("ersetzt die Seite im Cache des Service Workers und lädt neu, wenn eine andere Version läuft", async () => {
    served = "b";
    idle = true;
    await show();
    expect(fetcher).toHaveBeenCalledWith("/version.json", { cache: "no-store" });
    expect(fetcher).toHaveBeenCalledWith("/", { cache: "no-cache" });
    expect(open).toHaveBeenCalledWith("todo");
    // The page's assets first, so the stored page also starts offline.
    expect(add).toHaveBeenCalledWith("/assets/index-b.js");
    expect(put).toHaveBeenCalledWith("/", page);
    expect(reload).toHaveBeenCalledOnce();
    expect(add.mock.invocationCallOrder[0]).toBeLessThan(put.mock.invocationCallOrder[0]!);
    expect(put.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]!);
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

  it("lädt nicht neu, wenn die neue Seite oder eine ihrer Dateien nicht kommt", async () => {
    served = "b";
    idle = true;
    page = response(false);
    await show();
    page = response(true);
    add.mockRejectedValueOnce(new TypeError("404"));
    await show();
    expect(put).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
