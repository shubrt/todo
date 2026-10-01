import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = resolve(projectRoot, "libs/backend");
const cli = resolve(backendRoot, "node_modules/convex/bin/main.js");
const selectionVariables = [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  "CONVEX_OVERRIDE_ACCESS_TOKEN",
  "CONVEX_ACCESS_TOKEN",
];
const targetFlags = new Set([
  "--url",
  "--admin-key",
  "--env-file",
  "--deployment",
  "--deployment-name",
  "--preview-name",
  "--preview-create",
  "--prod",
  "--team",
  "--project",
  "--configure",
]);

// The root .env holds only the site URL; the cloud URL of the same deployment
// and region is derived from it.
export function validateTarget(env, key) {
  let site;
  try {
    site = new URL(env.CONVEX_SITE_URL);
  } catch {
    throw new Error("CONVEX_SITE_URL fehlt oder ist ungültig.");
  }
  const host = /^([a-z0-9-]+)(\.[a-z0-9-]+)?\.convex\.site$/.exec(site.hostname);
  if (!host || site.protocol !== "https:" || site.port || site.origin !== env.CONVEX_SITE_URL) {
    throw new Error(
      "CONVEX_SITE_URL muss die HTTPS-Site-URL eines Convex-Deployments sein, ohne Port, Zugangsdaten, Pfad oder URL-Zusätze.",
    );
  }
  const prefixed = /^prod:([a-z0-9-]+)\|([^\s|]+)$/.exec(key ?? "");
  const opaque = typeof key === "string" && /^[A-Za-z0-9+/=_-]{32,512}$/.test(key);
  if ((!prefixed && !opaque) || (prefixed && prefixed[1] !== host[1])) {
    throw new Error(
      "CONVEX_DEPLOY_KEY muss ein direkter Admin-Schlüssel oder ein prod:-Schlüssel des ausgewählten Deployments sein.",
    );
  }
  return { cloudUrl: `https://${site.hostname.replace(/\.site$/, ".cloud")}`, key };
}

export function deploymentEnvironment(source, target) {
  const env = { ...source };
  // Empty values also prevent Convex's dotenv loader from restoring an old
  // selection from libs/backend/.env.local. Its CLI treats these as absent.
  for (const name of selectionVariables) env[name] = "";
  if (target) {
    env.CONVEX_SELF_HOSTED_URL = target.cloudUrl;
    env.CONVEX_SELF_HOSTED_ADMIN_KEY = target.key;
  }
  return env;
}

export function validateArguments(args) {
  for (const argument of args) {
    if (targetFlags.has(argument.split("=", 1)[0])) {
      throw new Error(
        "Die Zielauswahl kommt ausschließlich aus .env und .env.convex-target. Zusätzliche Ziel- oder Zugangsdatenoptionen sind nicht erlaubt.",
      );
    }
  }
}

export async function verifyProduction(target, request = fetch) {
  let response;
  let info;
  try {
    response = await request(`${target.cloudUrl}/api/v1/deployment_info`, {
      headers: { Authorization: `Convex ${target.key}` },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (response.ok) info = await response.json();
  } catch {
    throw new Error(
      "Convex-Produktionsziel konnte nicht geprüft werden. Der CLI-Befehl wurde nicht gestartet.",
    );
  }
  if (!response.ok) {
    throw new Error(`Convex hat die Zielprüfung abgelehnt (HTTP ${response.status}).`);
  }
  if (info?.deploymentType !== "prod") {
    throw new Error("Das konfigurierte Convex-Ziel ist kein Produktionsdeployment.");
  }
}

// Retain only an unfinished secret prefix, so prompts and log streams remain
// visible immediately while a secret split across output chunks stays hidden.
export function redactStream(values) {
  const secrets = [...new Set(values.filter(Boolean))].sort((a, b) => b.length - a.length);
  const decoder = new StringDecoder("utf8");
  let pending = "";
  const redact = (value) =>
    secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), value);
  return new Transform({
    transform(chunk, _encoding, callback) {
      pending = redact(pending + decoder.write(chunk));
      let retained = 0;
      for (const secret of secrets) {
        for (
          let length = Math.min(secret.length - 1, pending.length);
          length > retained;
          length--
        ) {
          if (pending.endsWith(secret.slice(0, length))) {
            retained = length;
            break;
          }
        }
      }
      this.push(pending.slice(0, pending.length - retained));
      pending = pending.slice(pending.length - retained);
      callback();
    },
    flush(callback) {
      this.push(redact(pending + decoder.end()));
      callback();
    },
  });
}

function readConfiguration(name) {
  try {
    return parseEnv(readFileSync(resolve(projectRoot, name), "utf8"));
  } catch {
    throw new Error(`${name} fehlt oder kann nicht gelesen werden.`);
  }
}

function runCli(args, target, secrets) {
  return new Promise((complete, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: backendRoot,
      env: deploymentEnvironment(process.env, target),
      stdio: ["inherit", "pipe", "pipe"],
    });
    child.stdout.pipe(redactStream(secrets)).pipe(process.stdout, { end: false });
    child.stderr.pipe(redactStream(secrets)).pipe(process.stderr, { end: false });
    child.once("error", () =>
      reject(new Error("Convex-CLI konnte nicht gestartet werden. Bitte vp install prüfen.")),
    );
    child.once("close", (code, signal) => complete(code ?? (signal === "SIGINT" ? 130 : 1)));
  });
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 0) args = ["--help"];
  validateArguments(args);
  const optionEnd = args.indexOf("--");
  const options = optionEnd < 0 ? args : args.slice(0, optionEnd);
  const help =
    args[0] === "help" || options.some((arg) => ["--help", "-h", "--version", "-V"].includes(arg));
  if (help) return runCli(args, undefined, []);

  const env = readConfiguration(".env");
  const key = readConfiguration(".env.convex-target").CONVEX_DEPLOY_KEY;
  const target = validateTarget(env, key);
  // Do not accept a credential in positional arguments or --option=value.
  const secrets = [key, key.includes("|") ? key.split("|")[1] : undefined];
  if (args.some((arg) => secrets.some((secret) => secret && arg.includes(secret)))) {
    throw new Error(
      "Zugangsdaten dürfen nicht als CLI-Argument übergeben werden. Bitte --from-file verwenden.",
    );
  }
  await verifyProduction(target);
  return runCli(args, target, secrets);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  );
}
