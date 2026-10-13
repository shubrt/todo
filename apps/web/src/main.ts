import { isIdle, renderApp } from "@todo/ui";
import { takeCallback } from "./auth";
import { createWebPlatform } from "./platform";
import { watchVersion } from "./version";

// Compiled in by vite.config.ts: the checked CONVEX_SITE_URL and the build id ("dev" on the
// dev server, which also turns off the update check and the service worker).
declare const __TODO_SITE_URL__: string;
declare const __TODO_WEB_VERSION__: string;

const dev = __TODO_WEB_VERSION__ === "dev";
// Before anything renders: takes the Shoo code out of the address bar.
const callback = takeCallback(window.location);
const platform = createWebPlatform({
  siteUrl: __TODO_SITE_URL__,
  version: __TODO_WEB_VERSION__,
  variant: dev ? "dev" : undefined,
  callback,
});
renderApp(platform);
if (!dev) {
  watchVersion(__TODO_WEB_VERSION__, () => isIdle() && !platform.busy);
  // Answers later starts from the cache (public/sw.js). Without it the app loads as before.
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}
