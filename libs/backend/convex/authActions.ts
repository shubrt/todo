"use node";

import { randomBytes } from "node:crypto";
import { importJWK, SignJWT } from "jose";
import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  allowedOrigins,
  ownerForClaims,
  publicJwks,
  SESSION_DURATION,
  sha256,
  SHOO_ISSUER,
  TOKEN_DURATION,
  verifyShooToken,
} from "./authCrypto";

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

export const identity = internalAction({
  args: { code: v.string(), codeVerifier: v.string(), redirectUri: v.string() },
  handler: async (_ctx, args): Promise<{ origin: string; subject: string }> => {
    let redirect: URL;
    try {
      redirect = new URL(args.redirectUri);
    } catch {
      fail("INVALID_INPUT", "Ungültige Login-Adresse.");
    }
    if (
      !allowedOrigins().includes(redirect.origin) ||
      args.redirectUri !== `${redirect.origin}/api/auth/callback`
    )
      fail("FORBIDDEN", "Diese Login-Adresse ist nicht freigegeben.");
    if (
      !/^[A-Za-z0-9._~-]{43,128}$/.test(args.codeVerifier) ||
      args.code.length > 4096 ||
      !args.code
    )
      fail("INVALID_INPUT", "Ungültige Logintransaktion.");
    const response = await fetch(`${SHOO_ISSUER}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: `origin:${redirect.origin}`,
        redirect_uri: args.redirectUri,
        code: args.code,
        code_verifier: args.codeVerifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) fail("UNAUTHENTICATED", "Die Shoo-Anmeldung ist fehlgeschlagen.");
    const result = (await response.json()) as { id_token?: unknown };
    if (typeof result.id_token !== "string")
      fail("UNAUTHENTICATED", "Shoo hat keinen gültigen Identitätsnachweis geliefert.");
    const claims = await verifyShooToken(result.id_token, redirect.origin);
    return { origin: redirect.origin, subject: claims.sub! };
  },
});

export const login = internalAction({
  args: { code: v.string(), codeVerifier: v.string(), redirectUri: v.string() },
  handler: async (ctx, args): Promise<{ sessionToken: string; expiresAt: number }> => {
    const verified = await ctx.runAction(internal.authActions.identity, args);
    const ownerId = ownerForClaims({ sub: verified.subject }, verified.origin);
    const sessionToken = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + SESSION_DURATION;
    await ctx.runMutation(internal.auth.insertSession, {
      tokenHash: await sha256(sessionToken),
      ownerId,
      expiresAt,
    });
    return { sessionToken, expiresAt };
  },
});

export const token = internalAction({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }): Promise<{ token: string; expiresAt: number }> => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) fail("UNAUTHENTICATED", "Ungültige Sitzung.");
    const session = await ctx.runQuery(internal.auth.getSession, {
      tokenHash: await sha256(sessionToken),
    });
    if (!session) fail("UNAUTHENTICATED", "Bitte erneut anmelden.");
    const issuer = process.env.AUTH_JWT_ISSUER;
    if (!issuer || !process.env.AUTH_JWT_PRIVATE_JWK)
      fail("NOT_CONFIGURED", "Die Anmeldung ist noch nicht eingerichtet.");
    const jwk = JSON.parse(process.env.AUTH_JWT_PRIVATE_JWK);
    if (
      !jwk.kid ||
      jwk.kty !== "EC" ||
      jwk.crv !== "P-256" ||
      !publicJwks().keys.some((key) => key.kid === jwk.kid && key.x === jwk.x && key.y === jwk.y)
    )
      fail("NOT_CONFIGURED", "Der Signierschlüssel ist nicht eingerichtet.");
    const key = await importJWK(jwk, "ES256");
    const expiresAt = Math.min(Date.now() + TOKEN_DURATION, session.expiresAt);
    const token = await new SignJWT({ sid: session.id })
      .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience("todo")
      .setSubject(session.ownerId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .sign(key);
    return { token, expiresAt };
  },
});

export const createKey = internalAction({
  args: { name: v.string(), expiresAt: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ id: string; key: string; prefix: string }> => {
    await ctx.runQuery(internal.auth.activeOwner, {});
    const key = `todo_${randomBytes(32).toString("base64url")}`;
    const prefix = key.slice(0, 13);
    const id = await ctx.runMutation(internal.auth.insertApiKey, {
      ...args,
      tokenHash: await sha256(key),
      prefix,
    });
    return { id, key, prefix };
  },
});
