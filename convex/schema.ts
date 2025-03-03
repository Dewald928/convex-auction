import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,
  numbers: defineTable({
    value: v.number(),
  }),
  auctions: defineTable({
    title: v.string(),
    description: v.string(),
    imageUrl: v.optional(v.string()),
    startingPrice: v.number(),
    currentPrice: v.number(),
    startTime: v.number(), // Unix timestamp for when auction starts
    endTime: v.number(), // Unix timestamp for when auction ends
    creatorId: v.id("users"),
    status: v.union(
      v.literal("upcoming"),
      v.literal("active"),
      v.literal("ended"),
      v.literal("canceled"),
    ),
    winnerNotified: v.optional(v.boolean()), // Track if the winner has been notified
    bidIncrementMinimum: v.optional(v.number()), // Minimum bid increment
    durationInMinutes: v.optional(v.number()), // Duration of the auction in minutes
    separationTimeInMinutes: v.optional(v.number()), // Time between consecutive auctions
    couponBundleId: v.optional(v.id("couponBundles")),
    // Extension parameters
    extensionTimeLeftMinutes: v.optional(v.number()), // Time left (in minutes) when the auction should extend
    extensionDurationMinutes: v.optional(v.number()), // Amount of time (in minutes) to extend the auction by
    maxExtensionsAllowed: v.optional(v.number()), // Maximum number of times an auction can be extended
    extensionCount: v.optional(v.number()), // Current count of extensions that have occurred
  }).index("by_creator", ["creatorId"]),
  bids: defineTable({
    auctionId: v.id("auctions"),
    amount: v.number(),
    bidderId: v.id("users"),
    timestamp: v.number(),
  }).index("by_auction", ["auctionId"]),
  couponBundles: defineTable({
    quantity: v.number(),
    description: v.string(),
    auctionId: v.id("auctions"),
    winnerId: v.optional(v.id("users")), // ID of the user who won this bundle
  }).index("by_auction", ["auctionId"]),
  coupons: defineTable({
    code: v.optional(v.string()),
    bundleId: v.id("couponBundles"),
    ownerId: v.optional(v.id("users")), // Individual owner of this coupon
    isRedeemed: v.boolean(),
    redeemedBy: v.optional(v.id("users")),
    redeemedAt: v.optional(v.number()),
  })
    .index("by_bundle", ["bundleId"])
    .index("by_owner", ["ownerId"]),
  // Table to track auction events like extensions
  auctionEvents: defineTable({
    auctionId: v.id("auctions"),
    eventType: v.string(), // "extension", "bid", etc.
    timestamp: v.number(),
    data: v.object({
      message: v.string(),
      newEndTime: v.optional(v.number()),
      extensionCount: v.optional(v.number()),
      extensionMinutes: v.optional(v.number()),
      bidderId: v.optional(v.id("users")),
      bidAmount: v.optional(v.number()),
    }),
  }).index("by_auction_recent", ["auctionId", "timestamp"]),
});
