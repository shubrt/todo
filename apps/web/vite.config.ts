import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite-plus";

// CONVEX_SITE_URL from the shell, else from the repo-root .env (the shell wins), checked like
// normalizeSiteUrl in @todo/native-client. Not imported from there: Node would load its
// TypeScript source when Vite loads this config. Unlike the desktop build, a missing value
// stops the build, since the CSP needs the exact hosts.
function siteUrl() {
  try {
    process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const value = process.env.CONVEX_SITE_URL ?? "";
  const url = URL.parse(value);
  if (
    !url ||
    url.protocol !== "https:" ||
    url.port ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.convex\.site$/.test(url.hostname) ||
    (value !== url.origin && value !== `${url.origin}/`)
  )
    throw new Error(
      "CONVEX_SITE_URL fehlt oder ist ungültig. Trage die convex.site-Adresse (https://NAME.convex.site oder https://NAME.REGION.convex.site) in die .env im Repository ein.",
    );
  return url.origin;
}

// Build id shown under Einstellungen > Info and served as /version.json: TODO_WEB_VERSION,
// else Railway's commit, else the local commit, else the build time.
function buildVersion() {
  const fromEnv = process.env.TODO_WEB_VERSION || process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12);
  if (fromEnv) return fromEnv;
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return Date.now().toString(36);
  }
}

// The meta CSP: this backend's site (login, tokens), cloud and websocket hosts only. The dev
// server adds what React refresh (inline preamble) and the HMR socket need.
function contentSecurityPolicy(site: string, dev: boolean) {
  const cloud = site.replace(/\.site$/, ".cloud");
  return [
    "default-src 'self'",
    `script-src 'self'${dev ? " 'unsafe-inline'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self' ${site} ${cloud} ${cloud.replace(/^https:/, "wss:")}${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/**
 * Compiles the backend address and the build id into the app (__TODO_SITE_URL__,
 * __TODO_WEB_VERSION__, "dev" on the dev server), fills %TODO_CSP% in index.html and emits
 * /version.json for the update check.
 */
function todoWeb(): Plugin {
  let site = "";
  let version = "dev";
  let dev = false;
  return {
    name: "todo-web",
    config(_, { command, isPreview }) {
      if (isPreview) return;
      dev = command === "serve";
      site = siteUrl();
      if (!dev) version = buildVersion();
      return {
        define: {
          __TODO_SITE_URL__: JSON.stringify(site),
          __TODO_WEB_VERSION__: JSON.stringify(version),
        },
      };
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (!html.includes("%TODO_CSP%")) throw new Error("index.html braucht %TODO_CSP%.");
        return html.replace("%TODO_CSP%", contentSecurityPolicy(site, dev));
      },
    },
    generateBundle() {
      if (dev) return;
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), todoWeb()],
});
