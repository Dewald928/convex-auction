import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

export const placeBid = mutation({
  args: {
    auctionId: v.id("auctions"),
    amount: v.number(),
  },
  returns: v.object({
    bidId: v.id("bids"),
    wasExtended: v.boolean(),
    newEndTime: v.number(),
    extensionCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to place a bid");
    }

    const auction = await ctx.db.get(args.auctionId);
    if (!auction) {
      throw new ConvexError("Auction not found");
    }

    // Check if auction is active
    const now = Date.now();
    if (now < auction.startTime) {
      throw new ConvexError("This auction has not started yet");
    }

    // Check if auction has ended
    if (now > auction.endTime) {
      throw new ConvexError("This auction has ended");
    }

    // Check if bid is at least the starting price
    if (args.amount < auction.startingPrice) {
      throw new ConvexError(
        `Bid must be at least the starting price of ${auction.startingPrice}`,
      );
    }

    // Check if bid meets minimum increment if set
    if (
      auction.bidIncrementMinimum !== undefined &&
      args.amount < auction.currentPrice + auction.bidIncrementMinimum
    ) {
      throw new ConvexError(
        `Bid must be at least ${auction.currentPrice + auction.bidIncrementMinimum}`,
      );
    }

    // Otherwise check if bid is higher than current price
    if (args.amount <= auction.currentPrice) {
      throw new ConvexError("Bid must be higher than current price");
    }

    // Check if auction should be extended
    let newEndTime = auction.endTime;
    let newExtensionCount = auction.extensionCount || 0;
    let wasExtended = false;

    // Check if the auction has extension parameters
    if (
      auction.extensionTimeLeftMinutes !== undefined &&
      auction.extensionDurationMinutes !== undefined &&
      auction.maxExtensionsAllowed !== undefined
    ) {
      // Calculate the time left in milliseconds
      const timeLeftMs = auction.endTime - now;
      const extensionTriggerTimeMs =
        auction.extensionTimeLeftMinutes * 60 * 1000;

      // Check if the bid was placed within the extension window
      if (timeLeftMs <= extensionTriggerTimeMs) {
        // Check if we can still extend the auction
        if (newExtensionCount < auction.maxExtensionsAllowed) {
          // Calculate the new end time
          const extensionDurationMs =
            auction.extensionDurationMinutes * 60 * 1000;
          newEndTime = auction.endTime + extensionDurationMs;
          newExtensionCount += 1;
          wasExtended = true;

          // Update the scheduler to process the auction at the new end time
          // Cancel the existing scheduled job (not directly possible in Convex, so we'll just create a new one)
          await ctx.scheduler.runAt(
            newEndTime,
            internal.scheduledNotifications.processEndedAuction,
            { auctionId: args.auctionId },
          );

          // Create an auction extension event
          await ctx.db.insert("auctionEvents", {
            auctionId: args.auctionId,
            eventType: "extension",
            timestamp: now,
            data: {
              message: `Auction extended by ${auction.extensionDurationMinutes} minutes due to a bid in the final ${auction.extensionTimeLeftMinutes} minutes.`,
              newEndTime,
              extensionCount: newExtensionCount,
              extensionMinutes: auction.extensionDurationMinutes,
              bidderId: userId,
              bidAmount: args.amount,
            },
          });
        }
      }
    }

    // Insert the bid
    const bidId = await ctx.db.insert("bids", {
      auctionId: args.auctionId,
      amount: args.amount,
      bidderId: userId,
      timestamp: now,
    });

    // Update the auction with the new price and end time if extended
    await ctx.db.patch(args.auctionId, {
      currentPrice: args.amount,
      endTime: newEndTime,
      extensionCount: newExtensionCount,
    });

    // Create a bid event
    await ctx.db.insert("auctionEvents", {
      auctionId: args.auctionId,
      eventType: "bid",
      timestamp: now,
      data: {
        message: `New bid of ${args.amount} placed.`,
        bidderId: userId,
        bidAmount: args.amount,
      },
    });

    // Update auto-bid statuses for this auction
    // This will mark any auto-bids that were outbid as no longer the highest bidder
    // and trigger the auto-bid processor to find new auctions for them
    try {
      // Skip the auto-bid update for now until the module is fully registered
      // We'll handle this in a future update
      console.log(
        "Auto-bid update would happen here for auction:",
        args.auctionId,
      );
    } catch (error) {
      // If the auto-bid module isn't registered yet, this will fail silently
      console.error("Error updating auto-bid status:", error);
    }

    return {
      bidId,
      wasExtended,
      newEndTime,
      extensionCount: newExtensionCount,
    };
  },
});
