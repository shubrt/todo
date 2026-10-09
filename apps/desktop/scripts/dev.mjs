import { createServer } from "vite-plus";
import { spawn } from "node:child_process";
import { join } from "node:path";
import electron from "electron";
import { buildMain, desktopDirectory } from "./build.mjs";
import { devVariant } from "./variant.mjs";

const variant = devVariant(desktopDirectory);
await buildMain(variant);
const server = await createServer({
  configFile: join(desktopDirectory, "vite.config.ts"),
  root: join(desktopDirectory, "src/renderer"),
});
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`Desktop-Variante: todo ${variant}`);
const environment = { ...process.env, TODO_DESKTOP_DEV_URL: url };
delete environment.ELECTRON_RUN_AS_NODE;
// Start the package directory, not dist/main.mjs, so app.getVersion() reads package.json.
const child = spawn(electron, [desktopDirectory], {
  stdio: "inherit",
  env: environment,
});
child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => child.kill(signal));
