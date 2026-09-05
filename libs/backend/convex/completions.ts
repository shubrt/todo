import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireOwner } from "./auth";
import { listCompletions } from "./domain";
import { area } from "./validators";

export const list = query({
  args: {
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    area: v.optional(area),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => listCompletions(ctx, await requireOwner(ctx), args),
});
