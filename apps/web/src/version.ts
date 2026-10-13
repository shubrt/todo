// Cache and key of the page that public/sw.js answers each start with; keep both in sync with
// its constants and its refreshPage.
const PAGE_CACHE = "todo";
const PAGE_KEY = "/";

/** Whether /version.json names another build than `current`; false when it can't be read. */
export async function hasNewVersion(current: string) {
  try {
    const response = await fetch("/version.json", { cache: "no-store" });
    const { version } = (await response.json()) as { version?: unknown };
    return typeof version === "string" && version !== current;
  } catch {
    return false;
  }
}

/**
 * Replaces the service worker's copy of the page with a fresh one, so a reload starts the new
 * deploy instead of the cached one. Like the service worker, it stores the page's assets first,
 * so the stored page always starts, even offline. False when the page or an asset can't be
 * fetched or stored. Without the Cache API there is no service worker and nothing to replace.
 */
export async function refreshPage() {
  if (typeof caches === "undefined") return true;
  try {
    const response = await fetch(PAGE_KEY, { cache: "no-cache" });
    if (!response.ok) return false;
    const cache = await caches.open(PAGE_CACHE);
    const assets = new Set((await response.clone().text()).match(/\/assets\/[^"'\s>]+/g));
    await Promise.all(
      [...assets].map(async (path) => (await cache.match(path)) ?? cache.add(path)),
    );
    await cache.put(PAGE_KEY, response);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reloads into a newer deploy when the app comes back to the foreground with nothing open that
 * a reload would lose (`idle`). Otherwise, or without network, it waits for the next time it
 * comes back.
 */
export function watchVersion(current: string, idle: () => boolean) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !idle()) return;
    void hasNewVersion(current).then(async (newer) => {
      if (newer && (await refreshPage()) && idle()) location.reload();
    });
  });
}
