import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { processOwnerDay, wakeTask } from "./domain";

export const wake = internalMutation({
  args: { taskId: v.id("tasks"), version: v.number() },
  handler: async (ctx, args) => wakeTask(ctx, args.taskId, args.version),
});
export const processOwner = internalMutation({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => processOwnerDay(ctx, args.ownerId),
});
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").collect();
    for (const owner of settings) await processOwnerDay(ctx, owner.ownerId);
    const expiredReceipts = await ctx.db
      .query("requestReceipts")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
      .take(100);
    for (const receipt of expiredReceipts) await ctx.db.delete(receipt._id);
  },
});
