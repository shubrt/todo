import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { apiKeyKind } from "./validators";

export function authError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/**
 * Not revoked and not expired. Keys from the first version expired without a scheduled
 * revocation, so revokedAt alone is not enough.
 */
function isActiveKey(key: Doc<"apiKeys">, now: number) {
  return key.revokedAt === undefined && (key.expiresAt === undefined || key.expiresAt > now);
}

function checkApiKey(key: Doc<"apiKeys"> | null): Doc<"apiKeys"> {
  if (
    !key ||
    !process.env.TODO_OWNER_ID ||
    key.ownerId !== process.env.TODO_OWNER_ID ||
    !isActiveKey(key, Date.now())
  )
    authError("UNAUTHENTICATED", "Der API-Schlüssel ist ungültig oder wurde widerrufen.");
  return key;
}

export async function requireApiKeyByHash(ctx: QueryCtx | MutationCtx, tokenHash: string) {
  return checkApiKey(
    await ctx.db
      .query("apiKeys")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique(),
  );
}

/** Records key use for the key list, at most hourly so frequent calls do not rewrite the row. */
export async function touchApiKey(ctx: MutationCtx, key: Doc<"apiKeys">) {
  const now = Date.now();
  if (key.lastUsedAt === undefined || now - key.lastUsedAt >= 60 * 60_000)
    await ctx.db.patch(key._id, { lastUsedAt: now });
}

/**
 * Only device JWTs (apiKeyId claim from /auth/device-token) authorize. The key row is
 * reread inside every transaction, so live subscriptions stop right after revocation.
 * Returns the key behind the caller's JWT.
 */
async function requireCallerKey(ctx: QueryCtx | MutationCtx): Promise<Doc<"apiKeys">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !process.env.TODO_OWNER_ID || identity.subject !== process.env.TODO_OWNER_ID)
    authError("UNAUTHENTICATED", "Bitte erneut anmelden.");
  if (typeof identity.apiKeyId !== "string" || identity.sid !== undefined)
    authError("UNAUTHENTICATED", "Ungültige Geräteanmeldung.");
  const id = ctx.db.normalizeId("apiKeys", identity.apiKeyId);
  return checkApiKey(id ? await ctx.db.get(id) : null);
}

/** Guard for every public function; see requireCallerKey. */
export async function requireOwner(ctx: QueryCtx | MutationCtx): Promise<string> {
  return (await requireCallerKey(ctx)).ownerId;
}

/**
 * Active keys (not revoked, not expired), newest first. `current` marks the key of the
 * calling app. `lastUsedAt` is hour-accurate: token refreshes and API writes record it.
 */
export const listApiKeys = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireCallerKey(ctx);
    const now = Date.now();
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_owner", (q) => q.eq("ownerId", caller.ownerId))
      .collect();
    return keys
      .filter((key) => isActiveKey(key, now))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((key) => ({
        id: key._id,
        name: key.name,
        prefix: key.prefix,
        kind: key.kind ?? null,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt ?? null,
        current: key._id === caller._id,
      }));
  },
});

/**
 * Revokes one of the owner's keys. Revoking an already revoked key is a no-op. The calling
 * app's own key is refused, since that would silently log the app out.
 */
export const revokeApiKey = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    const caller = await requireCallerKey(ctx);
    if (id === caller._id)
      authError(
        "INVALID_INPUT",
        'Das ist der Schlüssel dieser App. Zum Abmelden "Verbindung entfernen" wählen.',
      );
    const key = await ctx.db.get(id);
    if (!key || key.ownerId !== caller.ownerId)
      authError("NOT_FOUND", "Der Schlüssel wurde nicht gefunden.");
    if (key.revokedAt === undefined) await ctx.db.patch(id, { revokedAt: Date.now() });
    return null;
  },
});

/**
 * Backs /auth/device-token. Integration keys never get a Convex JWT: they work only on
 * /api/v1 (and /auth/device-revoke for themselves), so a leaked tool key cannot list or
 * revoke other keys. Device keys and legacy keys without kind keep working.
 */
export const deviceCredential = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const key = await requireApiKeyByHash(ctx, tokenHash);
    if (key.kind === "integration")
      authError("FORBIDDEN", "Integrationsschlüssel gelten nur für die API unter /api/v1.");
    await touchApiKey(ctx, key);
    // Also schedules expiry for keys created before device authentication existed.
    if (key.expiresAt !== undefined && key.expiryScheduledAt !== key.expiresAt) {
      await ctx.scheduler.runAt(key.expiresAt, internal.auth.expireApiKey, { id: key._id });
      await ctx.db.patch(key._id, { expiryScheduledAt: key.expiresAt });
    }
    return { id: key._id, ownerId: key.ownerId, expiresAt: key.expiresAt };
  },
});

export const expireApiKey = internalMutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    const key = await ctx.db.get(id);
    if (
      key &&
      key.revokedAt === undefined &&
      key.expiresAt !== undefined &&
      key.expiresAt <= Date.now()
    )
      await ctx.db.patch(id, { revokedAt: Date.now() });
  },
});

/** Stores a key minted by authActions.desktopLogin (hash only) for TODO_OWNER_ID. */
export const insertApiKey = internalMutation({
  args: { tokenHash: v.string(), prefix: v.string(), name: v.string(), kind: apiKeyKind },
  handler: async (ctx, args) => {
    const ownerId = process.env.TODO_OWNER_ID;
    if (!ownerId) authError("NOT_CONFIGURED", "TODO_OWNER_ID ist nicht gesetzt.");
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const now = Date.now();
    if (keys.filter((key) => isActiveKey(key, now)).length >= 30)
      authError("INVALID_INPUT", "Es sind höchstens 30 aktive Schlüssel erlaubt.");
    return ctx.db.insert("apiKeys", { ...args, ownerId, createdAt: now });
  },
});

/** Revokes the presenting key ("Verbindung entfernen"); a second call fails like any revoked key. */
export const revokeDeviceKey = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const key = await requireApiKeyByHash(ctx, tokenHash);
    await ctx.db.patch(key._id, { revokedAt: Date.now() });
  },
});
