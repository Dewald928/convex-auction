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
  // Auto bids table for the auto bidding system
  autoBids: defineTable({
    userId: v.id("users"), // User who created this auto bid
    maxAmount: v.number(), // Maximum amount user is willing to pay per auction
    maxAuctions: v.number(), // Maximum number of auctions to participate in
    createdAt: v.number(), // When this auto bid was created (for preference ordering)
    isActive: v.boolean(), // Whether this auto bid is currently active
    auctionsParticipated: v.optional(v.array(v.id("auctions"))), // List of auctions this auto bid has participated in
    auctionsWon: v.optional(v.array(v.id("auctions"))), // List of auctions this auto bid has won
    remainingAuctions: v.number(), // Number of auctions remaining to participate in
  })
    .index("by_user", ["userId"])
    .index("by_active", ["isActive"]),
  // Track auto bid participation in specific auctions
  autoBidParticipations: defineTable({
    autoBidId: v.id("autoBids"), // The auto bid configuration
    auctionId: v.id("auctions"), // The auction being participated in
    userId: v.id("users"), // User who owns this auto bid
    maxAmount: v.number(), // Maximum amount for this auction
    isActive: v.boolean(), // Whether this participation is active
    lastBidId: v.optional(v.id("bids")), // The last bid placed by this auto bid
    lastBidAmount: v.optional(v.number()), // Amount of the last bid placed
    createdAt: v.number(), // When this participation was created
  })
    .index("by_auction_active", ["auctionId", "isActive"])
    .index("by_autoBid", ["autoBidId"])
    .index("by_user_auction", ["userId", "auctionId"]),
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
