import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";

// Define proper types for the coupon bundle
interface CouponBundle extends Doc<"couponBundles"> {
  coupons: Doc<"coupons">[];
}

export const createAuction = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    imageUrl: v.optional(v.string()),
    startingPrice: v.number(),
    startTime: v.number(), // Unix timestamp
    endTime: v.number(), // Unix timestamp
    bidIncrementMinimum: v.optional(v.number()),
    durationInMinutes: v.optional(v.number()),
    separationTimeInMinutes: v.optional(v.number()),
    numberOfAuctions: v.optional(v.number()), // How many auctions to create in sequence
    couponDescription: v.optional(v.string()), // Description of the coupons being offered
    // Extension parameters
    extensionTimeLeftMinutes: v.optional(v.number()),
    extensionDurationMinutes: v.optional(v.number()),
    maxExtensionsAllowed: v.optional(v.number()),
  },
  returns: v.union(v.id("auctions"), v.array(v.id("auctions"))),
  handler: async (ctx, args) => {
    const userId = (await getAuthUserId(ctx)) as Id<"users">;
    if (!userId) {
      throw new Error("You must be logged in to create an auction");
    }

    // Determine initial status based on start time
    const now = Date.now();
    const status = args.startTime > now ? "upcoming" : "active";

    // Default coupon description if not provided
    const couponDesc =
      args.couponDescription || "Bundle of 10 coupons for the winning bidder";

    // If creating a single auction
    if (!args.numberOfAuctions || args.numberOfAuctions === 1) {
      // Create a single auction
      const auctionId = await ctx.db.insert("auctions", {
        title: args.title,
        description: args.description,
        imageUrl: args.imageUrl,
        startingPrice: args.startingPrice,
        currentPrice: args.startingPrice,
        startTime: args.startTime,
        endTime: args.endTime,
        bidIncrementMinimum: args.bidIncrementMinimum,
        durationInMinutes: args.durationInMinutes,
        separationTimeInMinutes: args.separationTimeInMinutes,
        creatorId: userId,
        status,
        winnerNotified: false,
        // Extension parameters
        extensionTimeLeftMinutes: args.extensionTimeLeftMinutes,
        extensionDurationMinutes: args.extensionDurationMinutes,
        maxExtensionsAllowed: args.maxExtensionsAllowed,
        extensionCount: 0, // Initialize extension count to zero
      });

      // Create a coupon bundle for this auction
      const bundleId = await ctx.db.insert("couponBundles", {
        quantity: 10, // Default to 10 coupons per auction
        description: couponDesc,
        auctionId,
        winnerId: undefined, // Will be set when auction ends
      });

      // Update the auction with the coupon bundle ID
      await ctx.db.patch(auctionId, {
        couponBundleId: bundleId,
      });

      // Schedule a notification to run at the auction's end time
      if (args.endTime > now) {
        // Schedule the notification process to run when the auction ends
        await ctx.scheduler.runAt(
          args.endTime, // Run at the auction's end time
          internal.scheduledNotifications.processEndedAuction,
          { auctionId },
        );
      }

      return auctionId;
    } else {
      // Create multiple auctions in sequence
      const auctionIds = [];
      let currentStartTime = args.startTime;

      for (let i = 0; i < args.numberOfAuctions; i++) {
        // Calculate end time based on duration
        const durationMs = args.durationInMinutes
          ? args.durationInMinutes * 60 * 1000
          : args.endTime - args.startTime;

        const endTime = currentStartTime + durationMs;

        // Create the auction
        const auctionId = await ctx.db.insert("auctions", {
          title: `${args.title} #${i + 1}`,
          description: args.description,
          imageUrl: args.imageUrl,
          startingPrice: args.startingPrice,
          currentPrice: args.startingPrice,
          startTime: currentStartTime,
          endTime: endTime,
          bidIncrementMinimum: args.bidIncrementMinimum,
          durationInMinutes: args.durationInMinutes,
          separationTimeInMinutes: args.separationTimeInMinutes,
          creatorId: userId,
          status: currentStartTime > now ? "upcoming" : "active",
          winnerNotified: false,
          // Extension parameters
          extensionTimeLeftMinutes: args.extensionTimeLeftMinutes,
          extensionDurationMinutes: args.extensionDurationMinutes,
          maxExtensionsAllowed: args.maxExtensionsAllowed,
          extensionCount: 0, // Initialize extension count to zero
        });

        // Create a coupon bundle for this auction
        const bundleId = await ctx.db.insert("couponBundles", {
          quantity: 10, // Default to 10 coupons per auction
          description: couponDesc,
          auctionId,
          winnerId: undefined, // Will be set when auction ends
        });

        // Update the auction with the coupon bundle ID
        await ctx.db.patch(auctionId, {
          couponBundleId: bundleId,
        });

        auctionIds.push(auctionId);

        // Schedule notification for this auction
        if (endTime > now) {
          await ctx.scheduler.runAt(
            endTime,
            internal.scheduledNotifications.processEndedAuction,
            { auctionId },
          );
        }

        // If this is not the last auction, calculate the next start time
        if (i < args.numberOfAuctions - 1) {
          // Calculate separation time in milliseconds
          const separationMs = args.separationTimeInMinutes
            ? args.separationTimeInMinutes * 60 * 1000
            : 0;

          // The next auction starts after the specified separation time from the current start time
          currentStartTime = currentStartTime + separationMs;
        }
      }

      return auctionIds;
    }
  },
});

export const listAuctions = query({
  args: {
    onlyMine: v.optional(v.boolean()),
    paginationOpts: v.optional(paginationOptsValidator),
    sortBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    // Use the pagination options if provided, otherwise use default
    const paginationOpts = args.paginationOpts || {
      numItems: 10,
      cursor: null,
    };

    // Get all auctions first to sort them globally
    let allAuctions;
    if (args.onlyMine && userId) {
      allAuctions = await ctx.db
        .query("auctions")
        .withIndex("by_creator", (q) => q.eq("creatorId", userId))
        .collect();
    } else {
      allAuctions = await ctx.db.query("auctions").collect();
    }

    // Add user info for each auction creator
    const auctionsWithUsers = await Promise.all(
      allAuctions.map(async (auction) => {
        const creator = await ctx.db.get(auction.creatorId as Id<"users">);

        // Get the highest bid for this auction
        const highestBid = await ctx.db
          .query("bids")
          .withIndex("by_auction", (q) => q.eq("auctionId", auction._id))
          .order("desc")
          .first();

        // Get the user's highest bid for this auction (if they have one)
        let myHighestBid = null;
        if (userId) {
          const myBids = await ctx.db
            .query("bids")
            .withIndex("by_auction", (q) => q.eq("auctionId", auction._id))
            .filter((q) => q.eq(q.field("bidderId"), userId))
            .order("desc")
            .first();

          if (myBids) {
            myHighestBid = myBids;
          }
        }

        // Determine auction status
        const now = Date.now();
        let status;
        if (now < auction.startTime) {
          status = "upcoming";
        } else if (now < auction.endTime) {
          status = "active";
        } else {
          status = "ended";
        }

        return {
          ...auction,
          creatorName: creator?.email ?? "Unknown",
          highestBid: highestBid || null,
          myBid: myHighestBid || null,
          computedStatus: status,
        };
      }),
    );

    // Sort auctions globally: active first, then upcoming, then ended
    const sortedAuctions = [...auctionsWithUsers].sort((a, b) => {
      // Active auctions first
      if (a.computedStatus === "active" && b.computedStatus !== "active")
        return -1;
      if (a.computedStatus !== "active" && b.computedStatus === "active")
        return 1;

      // Then upcoming auctions ordered by start time (earliest first)
      if (a.computedStatus === "upcoming" && b.computedStatus === "upcoming") {
        return a.startTime - b.startTime;
      }

      if (a.computedStatus === "upcoming" && b.computedStatus !== "upcoming")
        return -1;
      if (a.computedStatus !== "upcoming" && b.computedStatus === "upcoming")
        return 1;

      // Finally, ended auctions (most recently ended first)
      return b.endTime - a.endTime;
    });

    // Apply pagination manually
    const startIndex = paginationOpts.cursor
      ? parseInt(paginationOpts.cursor)
      : 0;
    const endIndex = startIndex + (paginationOpts.numItems || 10);
    const paginatedAuctions = sortedAuctions.slice(startIndex, endIndex);

    const isDone = endIndex >= sortedAuctions.length;
    const continueCursor = isDone ? null : endIndex.toString();

    return {
      auctions: paginatedAuctions,
      isDone,
      continueCursor,
      totalCount: sortedAuctions.length,
    };
  },
});

export const getAuctionDetails = query({
  args: {
    auctionId: v.id("auctions"),
  },
  handler: async (ctx, args) => {
    const auction = await ctx.db.get(args.auctionId);
    if (!auction) {
      throw new Error("Auction not found");
    }

    const bids = await ctx.db
      .query("bids")
      .withIndex("by_auction", (q) => q.eq("auctionId", args.auctionId))
      .order("desc")
      .collect();

    const bidsWithUsers = await Promise.all(
      bids.map(async (bid) => {
        const bidder = await ctx.db.get(bid.bidderId);
        return {
          ...bid,
          bidderName: bidder?.email ?? "Unknown",
        };
      }),
    );

    const creator = await ctx.db.get(auction.creatorId as Id<"users">);

    // Fetch the coupon bundle if available
    let couponBundle: CouponBundle | null = null;
    if (auction.couponBundleId) {
      const bundleDoc = await ctx.db.get(auction.couponBundleId);

      // If bundle exists, fetch associated coupons
      if (bundleDoc) {
        const coupons = await ctx.db
          .query("coupons")
          .withIndex("by_bundle", (q) => q.eq("bundleId", bundleDoc._id))
          .collect();

        // Add coupons to the bundle
        couponBundle = {
          ...bundleDoc,
          coupons: coupons,
        };
      }
    }

    return {
      ...auction,
      creatorName: creator?.email ?? "Unknown",
      bids: bidsWithUsers,
      couponBundle: couponBundle,
    };
  },
});
