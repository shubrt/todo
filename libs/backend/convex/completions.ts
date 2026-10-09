import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireOwner } from "./auth";
import { listCompletions } from "./domain";

/** Verlauf, newest day first, paginated by `cursor`; `listId` also matches pre-list rows. */
export const list = query({
  args: {
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    listId: v.optional(v.id("lists")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => listCompletions(ctx, await requireOwner(ctx), args),
});
