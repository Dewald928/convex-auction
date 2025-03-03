import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Gets the highest bid for an auction
export const getAuctionWinner = internalQuery({
  args: {
    auctionId: v.id("auctions"),
  },
  returns: v.union(
    v.object({
      winnerId: v.id("users"),
      bidAmount: v.number(),
      winnerEmail: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    // Get the auction details
    const auction = await ctx.db.get(args.auctionId);
    if (!auction) {
      console.error(`Auction ${args.auctionId} not found`);
      return null;
    }

    // Make sure the auction is ended
    const now = Date.now();
    if (now < auction.endTime) {
      console.log(`Auction ${args.auctionId} has not ended yet`);
      return null;
    }

    // Get the highest bid (should be the first one since bids are ordered by desc)
    const bids = await ctx.db
      .query("bids")
      .withIndex("by_auction", (q) => q.eq("auctionId", args.auctionId))
      .order("desc")
      .take(1);

    if (bids.length === 0) {
      console.log(`No bids found for auction ${args.auctionId}`);
      return null;
    }

    const winningBid = bids[0];

    // Get the winner's user details
    const winner = await ctx.db.get(winningBid.bidderId);
    if (!winner) {
      console.error(`Winner with ID ${winningBid.bidderId} not found`);
      return null;
    }

    return {
      winnerId: winningBid.bidderId,
      bidAmount: winningBid.amount,
      winnerEmail: winner.email || "",
    };
  },
});

// Marks an auction as processed so we don't send duplicate notifications
export const markAuctionNotified = internalMutation({
  args: {
    auctionId: v.id("auctions"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const auction = await ctx.db.get(args.auctionId);
    if (!auction) {
      return false;
    }

    // Only update if the auction has ended but not been marked as notified
    if (auction.status === "ended" && auction.winnerNotified !== true) {
      await ctx.db.patch(args.auctionId, {
        winnerNotified: true,
      });
      return true;
    }

    return false;
  },
});

// Process a single auction that has ended
export const processEndedAuction = internalMutation({
  args: {
    auctionId: v.id("auctions"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const auction = await ctx.db.get(args.auctionId);
    if (!auction) {
      console.error(`Auction ${args.auctionId} not found`);
      return false;
    }

    // Check if it's already been processed or not yet ended
    if (auction.winnerNotified === true || auction.status === "ended") {
      console.log(
        `Auction ${args.auctionId} has already been processed or is ended`,
      );
      return false;
    }

    // First, ensure the auction status is updated to "ended" if needed
    const now = Date.now();
    if (now >= auction.endTime) {
      await ctx.db.patch(args.auctionId, {
        status: "ended",
      });
    }

    // Find the winning bid
    const winner = await ctx.db
      .query("bids")
      .withIndex("by_auction", (q) => q.eq("auctionId", args.auctionId))
      .order("desc")
      .first();

    if (!winner) {
      // No bids, no winner to notify
      await ctx.db.patch(args.auctionId, { winnerNotified: true });
      return false;
    }

    // Get the winner's user information
    const winnerUser = await ctx.db.get(winner.bidderId);
    if (!winnerUser || !winnerUser.email) {
      // Can't notify without an email
      return false;
    }

    // Get the coupon bundle for this auction
    if (!auction.couponBundleId) {
      console.error(`No coupon bundle found for auction ${args.auctionId}`);
      return false;
    }

    const couponBundle = await ctx.db.get(auction.couponBundleId);
    if (!couponBundle) {
      console.error(`Coupon bundle ${auction.couponBundleId} not found`);
      return false;
    }

    // Update the coupon bundle with the winner ID
    await ctx.db.patch(couponBundle._id, {
      winnerId: winner.bidderId,
    });

    // Check if coupons have already been generated for this bundle
    const existingCoupons = await ctx.db
      .query("coupons")
      .withIndex("by_bundle", (q) => q.eq("bundleId", couponBundle._id))
      .collect();

    // Generate coupons if they don't exist yet
    if (existingCoupons.length === 0) {
      // Create empty coupons without codes - they'll be generated upon redemption
      for (let i = 1; i <= couponBundle.quantity; i++) {
        // Create the individual coupon without a code
        await ctx.db.insert("coupons", {
          bundleId: couponBundle._id,
          ownerId: winner.bidderId,
          isRedeemed: false,
          redeemedBy: undefined,
          redeemedAt: undefined,
        });
      }
    }

    // ⚠️ In a real implementation, you would send an email with instructions on how to redeem coupons
    console.log(
      `Sending notification to ${winnerUser.email} for winning auction ${auction.title} with ${couponBundle.quantity} coupons`,
      `Visit the My Coupons page to view and redeem your coupons.`,
    );

    // Mark the auction as notified
    await ctx.db.patch(args.auctionId, { winnerNotified: true });
    return true;
  },
});
