import { generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const destination = resolve(process.argv[2] ?? ".env.auth.generated");
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const kid = `todo-${randomBytes(8).toString("hex")}`;
const metadata = { alg: "ES256", use: "sig", kid };
const privateJwk = { ...privateKey.export({ format: "jwk" }), ...metadata };
const publicJwk = { ...publicKey.export({ format: "jwk" }), ...metadata };
const content = [
  "# Convex backend: configure these values in the selected deployment.",
  "# Keep quotes for env-file import; omit the outer quotes in dashboard fields.",
  `AUTH_JWT_PRIVATE_JWK='${JSON.stringify(privateJwk)}'`,
  `AUTH_JWT_PUBLIC_JWKS='${JSON.stringify({ keys: [publicJwk] })}'`,
  "",
].join("\n");

try {
  writeFileSync(destination, content, { flag: "wx", mode: 0o600 });
  console.info(
    `Auth keys saved to ${destination}. Keep this file private; no deployment was changed.`,
  );
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
    console.error(`Refusing to overwrite ${destination}. Choose a new path for key rotation.`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
