// Installs the latest main as /Applications/todo.app on this Mac: builds origin/main in a
// temporary worktree, runs the QA, packages the app and swaps it in. The installed app stays
// untouched until everything before the swap has succeeded, and comes back if the new one
// does not start.
// Usage from any checkout of this repository: vp run install:mac
//
// The app keeps the signature @electron/packager leaves on it: the main executable is
// Electron's own linker-signed binary, so its cdhash only changes with the Electron version.
// macOS identifies apps without an Apple certificate by that cdhash for keychain access, so
// updates do not bring back the "todo Safe Storage" prompt. Re-signing every build would.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundleId = "dev.shubrt.todo";
const target = "/Applications/todo.app";
const staged = "/Applications/.todo.app.new";
const previous = "/Applications/.todo.app.old";
const failed = "/Applications/.todo.app.failed";
// Any running copy of the regular app, wherever it was started from (not the dev variants).
const anyTodo = String.raw`/todo\.app/Contents/MacOS/todo( |$)`;
const installedTodo = String.raw`^/Applications/todo\.app/Contents/MacOS/todo( |$)`;
const lock = join(tmpdir(), "todo-install-mac.lock");

const run = (command, args, options = {}) =>
  execFileSync(command, args, { stdio: "inherit", ...options });
const read = (command, args) => execFileSync(command, args, { encoding: "utf8" }).trim();
const attempt = (command, args) => {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const running = (pattern) => attempt("pgrep", ["-f", pattern]);

if (process.platform !== "darwin" || process.arch !== "arm64")
  throw new Error("todo wird nur auf einem Mac mit Apple Silicon installiert.");
try {
  process.loadEnvFile(join(repo, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!process.env.CONVEX_SITE_URL)
  throw new Error(
    `CONVEX_SITE_URL fehlt. Die Datei .env aus dem Haupt-Checkout nach ${repo} kopieren.`,
  );

// Set by Electron-based hosts such as editors and agent apps. `open` hands it to todo, which
// then starts as plain Node and exits at once.
delete process.env.ELECTRON_RUN_AS_NODE;
// Ctrl-C reaches the running child as well; ignoring it here lets the cleanup below run.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => {});

takeLock();
try {
  const commit = await buildAndInstall();
  console.log(`\ntodo ${commit} ist installiert und läuft.`);
} finally {
  rmSync(lock, { recursive: true, force: true });
}

/** Only one install at a time; a lock left by a dead run is taken over. */
function takeLock() {
  try {
    mkdirSync(lock);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const pid = Number(readFileSync(join(lock, "pid"), "utf8").trim() || 0);
    if (pid && attempt("kill", ["-0", String(pid)]))
      throw new Error("Eine andere Installation von todo läuft gerade.");
  }
  writeFileSync(join(lock, "pid"), String(process.pid));
}

/** Builds and checks origin/main in a temporary worktree, then swaps it in. */
async function buildAndInstall() {
  run("git", ["-C", repo, "worktree", "prune"]);
  run("git", ["-C", repo, "fetch", "--quiet", "origin", "main"]);
  const commit = read("git", ["-C", repo, "rev-parse", "--short", "origin/main"]);
  console.log(`Baue todo aus main (${commit}) …`);
  // The resolved path: under /var (a symlink to /private/var) Vitest loads itself twice.
  const checkout = realpathSync(await mkdtemp(join(tmpdir(), "todo-install-")));
  try {
    run("git", ["-C", repo, "worktree", "add", "--quiet", "--detach", checkout, "origin/main"]);
    // The temporary checkout must use its own toolchain: `vp run` put the invoking checkout's
    // node_modules/.bin first on PATH and set VP_* variables. CI skips `vp config` in prepare,
    // which would rewrite the shared git hooks setting.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !/^(VP_|npm_)/.test(key) && key !== "TODO_DESKTOP_VARIANT",
      ),
    );
    env.PATH = (process.env.PATH ?? "")
      .split(":")
      .filter((entry) => !entry.includes("/node_modules/.bin"))
      .join(":");
    env.CI = "1";
    run("vp", ["install"], { cwd: checkout, env });
    run("vp", ["run", "qa"], { cwd: checkout, env });
    run("vp", ["run", "package"], { cwd: checkout, env });
    await install(join(checkout, "apps/desktop/release/todo-darwin-arm64/todo.app"));
  } finally {
    if (!attempt("git", ["-C", repo, "worktree", "remove", "--force", checkout])) {
      await rm(checkout, { recursive: true, force: true });
      attempt("git", ["-C", repo, "worktree", "prune"]);
    }
  }
  return commit;
}

/**
 * Quits todo, replaces /Applications/todo.app and starts the new version. If the new version
 * is not running a few seconds later, the previous one goes back in place and starts again.
 */
async function install(app) {
  // A run that died mid-swap may have left the only working copy as the backup.
  if (!existsSync(target) && existsSync(previous)) await rename(previous, target);
  for (const path of [staged, previous, failed]) await rm(path, { recursive: true, force: true });
  run("ditto", [app, staged]);
  await quit();
  if (existsSync(target)) await rename(target, previous);
  try {
    await rename(staged, target);
    run("open", [target]);
    await sleep(5_000);
    if (!running(installedTodo)) throw new Error("Die neue Version von todo startet nicht.");
  } catch (error) {
    if (existsSync(previous)) {
      if (existsSync(target)) await rename(target, failed);
      await rename(previous, target);
      attempt("open", [target]);
      console.error("Die bisherige Version von todo ist wieder installiert.");
    }
    throw error;
  }
  await rm(previous, { recursive: true, force: true });
}

/** Asks every running todo to quit and ends it if it is still there after ten seconds. */
async function quit() {
  if (!running(anyTodo)) return;
  attempt("osascript", ["-e", `tell application id "${bundleId}" to quit`]);
  for (let waited = 0; waited < 10_000 && running(anyTodo); waited += 250) await sleep(250);
  if (running(anyTodo)) attempt("pkill", ["-f", anyTodo]);
  for (let waited = 0; waited < 5_000 && running(anyTodo); waited += 250) await sleep(250);
  if (running(anyTodo))
    throw new Error("todo ließ sich nicht beenden. Bitte über die Menüleiste beenden.");
}
