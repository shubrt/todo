import { build } from "esbuild";
import { build as buildRenderer } from "vite-plus";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const desktopDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

// CONVEX_SITE_URL from the shell, else from the repo-root .env (the shell wins).
function siteUrl() {
  try {
    process.loadEnvFile(join(desktopDirectory, "../../.env"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return process.env.CONVEX_SITE_URL ?? "";
}

// Compiled into the main process: `variant` as __TODO_VARIANT__ ("" for the regular app) and
// CONVEX_SITE_URL as __TODO_SITE_URL__ ("" when unset; login then explains what is missing).
export async function buildMain(variant = "") {
  const define = {
    __TODO_VARIANT__: JSON.stringify(variant),
    __TODO_SITE_URL__: JSON.stringify(siteUrl()),
  };
  await Promise.all([
    build({
      absWorkingDir: desktopDirectory,
      entryPoints: ["src/main/index.ts"],
      outfile: "dist/main.mjs",
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      external: ["electron"],
      sourcemap: true,
      define,
    }),
    build({
      absWorkingDir: desktopDirectory,
      entryPoints: ["src/main/preload.ts"],
      outfile: "dist/preload.cjs",
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node24",
      external: ["electron"],
      sourcemap: true,
    }),
  ]);
}
export async function buildDesktop(variant) {
  await buildMain(variant);
  await buildRenderer({
    configFile: join(desktopDirectory, "vite.config.ts"),
    root: join(desktopDirectory, "src/renderer"),
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildDesktop();
