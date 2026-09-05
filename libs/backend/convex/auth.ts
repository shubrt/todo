import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

export function authError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function checkApiKey(key: Doc<"apiKeys"> | null): Doc<"apiKeys"> {
  if (
    !key ||
    !process.env.TODO_OWNER_ID ||
    key.ownerId !== process.env.TODO_OWNER_ID ||
    key.revokedAt !== undefined ||
    (key.expiresAt !== undefined && key.expiresAt <= Date.now())
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

/** Key administration requires a browser session, never a device credential. */
export async function requireSessionOwner(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (
    !identity ||
    typeof identity.sid !== "string" ||
    identity.apiKeyId !== undefined ||
    !process.env.TODO_OWNER_ID ||
    identity.subject !== process.env.TODO_OWNER_ID
  )
    authError("UNAUTHENTICATED", "Bitte erneut anmelden.");
  const id = ctx.db.normalizeId("sessions", identity.sid);
  const session = id ? await ctx.db.get(id) : null;
  if (
    !session ||
    session.ownerId !== identity.subject ||
    session.revokedAt !== undefined ||
    session.expiresAt <= Date.now()
  ) {
    authError("UNAUTHENTICATED", "Die Sitzung ist abgelaufen oder wurde widerrufen.");
  }
  return session.ownerId;
}

/** Read the credential row inside every transaction, including live subscriptions. */
export async function requireOwner(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !process.env.TODO_OWNER_ID || identity.subject !== process.env.TODO_OWNER_ID)
    authError("UNAUTHENTICATED", "Bitte erneut anmelden.");
  if (identity.apiKeyId === undefined) return requireSessionOwner(ctx);
  if (typeof identity.apiKeyId !== "string" || identity.sid !== undefined)
    authError("UNAUTHENTICATED", "Ungültige Geräteanmeldung.");
  const id = ctx.db.normalizeId("apiKeys", identity.apiKeyId);
  const key = checkApiKey(id ? await ctx.db.get(id) : null);
  return key.ownerId;
}

export const activeOwner = internalQuery({ args: {}, handler: requireSessionOwner });

export const deviceCredential = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const key = await requireApiKeyByHash(ctx, tokenHash);
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

export const getSession = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (
      !session ||
      !process.env.TODO_OWNER_ID ||
      session.ownerId !== process.env.TODO_OWNER_ID ||
      session.revokedAt !== undefined ||
      session.expiresAt <= Date.now()
    )
      return null;
    return { id: session._id, ownerId: session.ownerId, expiresAt: session.expiresAt };
  },
});

export const insertSession = internalMutation({
  args: { tokenHash: v.string(), ownerId: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("sessions", { ...args, createdAt: Date.now() });
    await ctx.scheduler.runAt(args.expiresAt, internal.auth.expireSession, { id });
    return id;
  },
});

export const expireSession = internalMutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, { id }) => {
    const session = await ctx.db.get(id);
    if (session && session.revokedAt === undefined && session.expiresAt <= Date.now())
      await ctx.db.patch(id, { revokedAt: Date.now() });
  },
});

export const revokeSession = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (session && session.revokedAt === undefined)
      await ctx.db.patch(session._id, { revokedAt: Date.now() });
  },
});

export const listApiKeys = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireSessionOwner(ctx);
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    return keys.map(({ tokenHash: _hash, ...key }) => key);
  },
});

export const createApiKey = action({
  args: { name: v.string(), expiresAt: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ id: string; key: string; prefix: string }> =>
    ctx.runAction(internal.authActions.createKey, args),
});

export const insertApiKey = internalMutation({
  args: {
    tokenHash: v.string(),
    prefix: v.string(),
    name: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireSessionOwner(ctx);
    const name = args.name.trim();
    if (!name || name.length > 80)
      authError("INVALID_INPUT", "Der Name muss 1 bis 80 Zeichen lang sein.");
    if (
      args.expiresAt !== undefined &&
      (!Number.isFinite(args.expiresAt) || args.expiresAt <= Date.now())
    )
      authError("INVALID_INPUT", "Das Ablaufdatum muss in der Zukunft liegen.");
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    if (keys.filter((key) => key.revokedAt === undefined).length >= 30)
      authError("INVALID_INPUT", "Es sind höchstens 30 aktive Schlüssel erlaubt.");
    const id = await ctx.db.insert("apiKeys", {
      ...args,
      name,
      ownerId,
      createdAt: Date.now(),
      ...(args.expiresAt !== undefined ? { expiryScheduledAt: args.expiresAt } : {}),
    });
    if (args.expiresAt !== undefined)
      await ctx.scheduler.runAt(args.expiresAt, internal.auth.expireApiKey, { id });
    return id;
  },
});

export const revokeApiKey = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireSessionOwner(ctx);
    const key = await ctx.db.get(id);
    if (!key || key.ownerId !== ownerId) authError("NOT_FOUND", "Schlüssel nicht gefunden.");
    if (key.revokedAt === undefined) await ctx.db.patch(id, { revokedAt: Date.now() });
  },
});
