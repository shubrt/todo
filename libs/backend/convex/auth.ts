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

export function authError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/** Read the session in the caller's transaction, including reactive subscriptions. */
export async function requireOwner(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (
    !identity ||
    typeof identity.sid !== "string" ||
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

export const activeOwner = internalQuery({ args: {}, handler: requireOwner });

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
    const ownerId = await requireOwner(ctx);
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
    const ownerId = await requireOwner(ctx);
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
    return ctx.db.insert("apiKeys", { ...args, name, ownerId, createdAt: Date.now() });
  },
});

export const revokeApiKey = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireOwner(ctx);
    const key = await ctx.db.get(id);
    if (!key || key.ownerId !== ownerId) authError("NOT_FOUND", "Schlüssel nicht gefunden.");
    if (key.revokedAt === undefined) await ctx.db.patch(id, { revokedAt: Date.now() });
  },
});
