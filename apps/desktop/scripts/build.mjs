import { build } from "esbuild";
import { build as buildRenderer } from "vite-plus";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const desktopDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
export async function buildMain() {
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
export async function buildDesktop() {
  await buildMain();
  await buildRenderer({
    configFile: join(desktopDirectory, "vite.config.ts"),
    root: join(desktopDirectory, "src/renderer"),
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildDesktop();
