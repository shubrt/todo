import {
  createRemoteJWKSet,
  importJWK,
  jwtVerify,
  SignJWT,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import { ConvexError } from "convex/values";

export const SHOO_ISSUER = "https://shoo.dev";
export const TOKEN_DURATION = 5 * 60 * 1000;
const shooKeys = createRemoteJWKSet(new URL(`${SHOO_ISSUER}/.well-known/jwks.json`));

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Maps a verified Shoo identity to TODO_OWNER_ID via SHOO_OWNER_SUBJECTS ({ origin: sub | sub[] }).
 * Unmapped subjects get the exact entry to add, since Shoo's pairwise sub is only known after login.
 */
export function ownerForClaims(claims: JWTPayload, origin: string): string {
  let subjects: Record<string, unknown>;
  try {
    subjects = JSON.parse(process.env.SHOO_OWNER_SUBJECTS ?? "{}");
  } catch {
    throw new ConvexError({ code: "NOT_CONFIGURED", message: "Die Besitzerzuordnung fehlt." });
  }
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  const allowed = subjects[origin];
  const matches =
    sub !== "" &&
    (typeof allowed === "string"
      ? allowed === sub
      : Array.isArray(allowed) && allowed.includes(sub));
  if (!matches)
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Dieses Shoo-Konto ist nicht freigegeben. Zum Freischalten in SHOO_OWNER_SUBJECTS eintragen: ${JSON.stringify({ [origin]: sub })}`,
    });
  const owner = process.env.TODO_OWNER_ID;
  if (!owner)
    throw new ConvexError({ code: "NOT_CONFIGURED", message: "TODO_OWNER_ID ist nicht gesetzt." });
  return owner;
}

export async function verifyShooToken(
  token: string,
  origin: string,
  keys: JWTVerifyGetKey = shooKeys,
): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: SHOO_ISSUER,
      audience: `origin:${origin}`,
      algorithms: ["ES256"],
      requiredClaims: ["sub", "iat", "exp"],
      maxTokenAge: "10m",
      clockTolerance: 5,
    });
    return payload;
  } catch {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Der Shoo-Identitätsnachweis ist ungültig.",
    });
  }
}

/** Expose only public coordinates, including during key rotation. */
export function publicJwks() {
  try {
    const parsed = JSON.parse(process.env.AUTH_JWT_PUBLIC_JWKS ?? '{"keys":[]}') as {
      keys?: Array<Record<string, unknown>>;
    };
    const keys = (parsed.keys ?? []).filter(
      (key) =>
        key.kty === "EC" &&
        key.crv === "P-256" &&
        typeof key.x === "string" &&
        typeof key.y === "string" &&
        typeof key.kid === "string",
    );
    return {
      keys: keys.map((key) => ({
        kty: key.kty,
        crv: key.crv,
        x: key.x,
        y: key.y,
        kid: key.kid,
        alg: "ES256",
        use: "sig",
      })),
    };
  } catch {
    return { keys: [] };
  }
}

/**
 * Signs the ES256 JWT that Convex accepts for `ownerId`, valid for TOKEN_DURATION but never past
 * `credentialExpiry`. Runs in the default runtime (WebCrypto), so /auth/device-token needs no
 * Node action. Fails closed unless AUTH_JWT_PRIVATE_JWK matches a key in AUTH_JWT_PUBLIC_JWKS.
 */
export async function signOwnerToken(
  ownerId: string,
  claims: Record<string, string>,
  credentialExpiry?: number,
) {
  const issuer = process.env.AUTH_JWT_ISSUER;
  if (!issuer || !process.env.AUTH_JWT_PRIVATE_JWK)
    throw new ConvexError({
      code: "NOT_CONFIGURED",
      message: "Die Anmeldung ist noch nicht eingerichtet.",
    });
  const jwk = JSON.parse(process.env.AUTH_JWT_PRIVATE_JWK);
  if (
    !jwk.kid ||
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    !publicJwks().keys.some((key) => key.kid === jwk.kid && key.x === jwk.x && key.y === jwk.y)
  )
    throw new ConvexError({
      code: "NOT_CONFIGURED",
      message: "Der Signierschlüssel ist nicht eingerichtet.",
    });
  const key = await importJWK(jwk, "ES256");
  const expiresAt =
    Math.floor(Math.min(Date.now() + TOKEN_DURATION, credentialExpiry ?? Infinity) / 1000) * 1000;
  if (expiresAt <= Date.now())
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Die Anmeldung ist abgelaufen." });
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience("todo")
    .setSubject(ownerId)
    .setIssuedAt()
    .setExpirationTime(expiresAt / 1000)
    .sign(key);
  return { token, expiresAt };
}
