import { packager } from "@electron/packager";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildDesktop, desktopDirectory } from "./build.mjs";

if (process.platform !== "darwin") throw new Error("Das macOS-Paket wird auf einem Mac erstellt.");
await buildDesktop();
const manifest = JSON.parse(await readFile(join(desktopDirectory, "package.json"), "utf8"));
const stage = join(desktopDirectory, ".stage");
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp(join(desktopDirectory, "dist"), join(stage, "dist"), { recursive: true });
await writeFile(
  join(stage, "package.json"),
  JSON.stringify({
    name: "todo",
    version: manifest.version,
    main: "dist/main.mjs",
    type: "module",
  }),
);
const paths = await packager({
  dir: stage,
  out: join(desktopDirectory, "release"),
  name: "todo",
  appBundleId: "dev.shubrt.todo",
  appCategoryType: "public.app-category.productivity",
  appVersion: manifest.version,
  electronVersion: manifest.devDependencies.electron,
  arch: "arm64",
  platform: "darwin",
  asar: true,
  overwrite: true,
  prune: false,
  darwinDarkModeSupport: true,
  extendInfo: { LSUIElement: true, NSHighResolutionCapable: true },
});
for (const path of paths) {
  const destination = join(desktopDirectory, "release", `todo-${manifest.version}-mac-arm64.zip`);
  await rm(destination, { force: true });
  execFileSync("ditto", [
    "-c",
    "-k",
    "--sequesterRsrc",
    "--keepParent",
    join(path, "todo.app"),
    destination,
  ]);
  console.log(`Lokales Paket: ${destination}`);
}
await rm(stage, { recursive: true, force: true });
