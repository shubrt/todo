// The web app's service worker, only there for a fast start (docs/web.md#aktualisierung). The
// page comes from the cache at once while a fresh copy is fetched for the next start. The hashed
// files under /assets/ never change and come from the cache. Everything else, like
// /version.json, the manifest, the icons and the Convex hosts, goes to the network untouched.

// Cache and key of the page. src/version.ts writes the same entry, assets first like
// refreshPage below, before it reloads into a new deploy; keep both in sync.
const CACHE = "todo";
const PAGE = "/";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(refreshPage());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== location.origin || request.method !== "GET") return;
  if (request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/auth/callback")) {
    // The document keeps the requested address, so takeCallback still sees /auth/callback?code=…
    event.respondWith(
      caches
        .open(CACHE)
        .then((cache) => cache.match(PAGE))
        .then((page) => page ?? fetch(request)),
    );
    event.waitUntil(refreshPage().catch(() => {}));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(asset(event));
  }
});

// Fetches the page past the HTTP cache. If it loaded, stores the assets it names, then the page,
// so the stored page always starts without network, and drops the assets it no longer names.
// The page names all its assets: the build has no lazy chunks, fonts or images under /assets/.
async function refreshPage() {
  const response = await fetch(PAGE, { cache: "no-cache" });
  if (!response.ok) return;
  const assets = new Set((await response.clone().text()).match(/\/assets\/[^"'\s>]+/g));
  const cache = await caches.open(CACHE);
  // cache.add rejects a non-OK answer, so a broken deploy leaves the stored page alone.
  await Promise.all([...assets].map(async (path) => (await cache.match(path)) ?? cache.add(path)));
  await cache.put(PAGE, response);
  for (const key of await cache.keys()) {
    const { pathname } = new URL(key.url);
    if (pathname.startsWith("/assets/") && !assets.has(pathname)) await cache.delete(key);
  }
}

// The cached file, else the network's, stored once it loaded.
async function asset(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok) event.waitUntil(cache.put(event.request, response.clone()));
  return response;
}
