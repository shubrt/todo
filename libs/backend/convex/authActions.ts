"use node";

import { randomBytes } from "node:crypto";
import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ownerForClaims, sha256, SHOO_ISSUER, verifyShooToken } from "./authCrypto";
import { apiKeyKind } from "./validators";

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/**
 * Login of the desktop and web app: exchanges the Shoo code with the PKCE verifier that never
 * left the device, maps the verified subject to the owner and mints a key named `deviceName`.
 * kind "device" (default) is the app's own key; "integration" is a key the app creates for a
 * tool after a fresh Shoo login, so a stolen device key alone cannot mint durable keys.
 * redirect_uri is the stable Convex site callback, so client_id and Shoo's pairwise sub stay fixed.
 */
export const desktopLogin = internalAction({
  args: {
    code: v.string(),
    codeVerifier: v.string(),
    deviceName: v.string(),
    kind: v.optional(apiKeyKind),
  },
  handler: async (ctx, args): Promise<{ id: string; key: string; prefix: string }> => {
    const kind = args.kind ?? "device";
    const name = args.deviceName.trim();
    if (!name || name.length > 80)
      fail(
        "INVALID_INPUT",
        `Der ${kind === "integration" ? "Schlüsselname" : "Gerätename"} muss 1 bis 80 Zeichen lang sein.`,
      );
    if (
      !/^[A-Za-z0-9._~-]{43,128}$/.test(args.codeVerifier) ||
      args.code.length > 4096 ||
      !args.code
    )
      fail("INVALID_INPUT", "Ungültige Logintransaktion.");
    let origin: string;
    try {
      origin = new URL(process.env.CONVEX_SITE_URL ?? "").origin;
    } catch {
      fail("NOT_CONFIGURED", "CONVEX_SITE_URL ist nicht gesetzt.");
    }
    const response = await fetch(`${SHOO_ISSUER}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: `origin:${origin}`,
        redirect_uri: `${origin}/auth/desktop/callback`,
        code: args.code,
        code_verifier: args.codeVerifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) fail("UNAUTHENTICATED", "Die Shoo-Anmeldung ist fehlgeschlagen.");
    const result = (await response.json()) as { id_token?: unknown };
    if (typeof result.id_token !== "string")
      fail("UNAUTHENTICATED", "Shoo hat keinen gültigen Identitätsnachweis geliefert.");
    ownerForClaims(await verifyShooToken(result.id_token, origin), origin);
    const key = `todo_${randomBytes(32).toString("base64url")}`;
    const prefix = key.slice(0, 13);
    const id = await ctx.runMutation(internal.auth.insertApiKey, {
      tokenHash: await sha256(key),
      prefix,
      name,
      kind,
    });
    return { id, key, prefix };
  },
});
