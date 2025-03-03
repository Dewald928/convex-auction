import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Create an auction event
export const createEvent = mutation({
  args: {
    auctionId: v.id("auctions"),
    eventType: v.string(),
    data: v.object({
      message: v.string(),
      newEndTime: v.optional(v.number()),
      extensionCount: v.optional(v.number()),
      extensionMinutes: v.optional(v.number()),
      bidderId: v.optional(v.id("users")),
      bidAmount: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auctionEvents", {
      auctionId: args.auctionId,
      eventType: args.eventType,
      timestamp: Date.now(),
      data: args.data,
    });
  },
});

// Get recent events for an auction
export const getRecentEvents = query({
  args: {
    auctionId: v.id("auctions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;

    return await ctx.db
      .query("auctionEvents")
      .withIndex("by_auction_recent", (q) => q.eq("auctionId", args.auctionId))
      .order("desc")
      .take(limit);
  },
});

// Subscribe to new events for an auction
export const subscribeToEvents = query({
  args: {
    auctionId: v.id("auctions"),
    afterTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("auctionEvents")
      .withIndex("by_auction_recent", (q) => q.eq("auctionId", args.auctionId));

    // If afterTimestamp is provided, only get events after that time
    if (args.afterTimestamp !== undefined) {
      query = query.filter((q) =>
        q.gt(q.field("timestamp"), args.afterTimestamp as number),
      );
    }

    return await query.order("asc").collect();
  },
});

// Get recent extension events for an auction
export const getRecentExtensions = query({
  args: {
    auctionId: v.id("auctions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;

    return await ctx.db
      .query("auctionEvents")
      .withIndex("by_auction_recent", (q) => q.eq("auctionId", args.auctionId))
      .filter((q) => q.eq(q.field("eventType"), "extension"))
      .order("desc")
      .take(limit);
  },
});
