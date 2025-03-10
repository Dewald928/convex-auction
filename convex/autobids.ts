import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

// Create a new auto-bid
export const createAutoBid = mutation({
  args: {
    userId: v.optional(v.id("users")),
    maxBidAmount: v.number(),
    targetAuctionCount: v.number(),
  },
  returns: v.id("autobids"),
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await getAuthUserId(ctx));
    // const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to create an auto-bid");
    }

    // Validate inputs
    if (args.maxBidAmount <= 0) {
      throw new ConvexError("Maximum bid amount must be greater than 0");
    }

    if (args.targetAuctionCount <= 0) {
      throw new ConvexError("Target auction count must be greater than 0");
    }

    // Check if user already has an active auto-bid
    const existingAutoBids = await ctx.db
      .query("autobids")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    if (existingAutoBids.length > 0) {
      // Deactivate existing auto-bids
      for (const autoBid of existingAutoBids) {
        await ctx.db.patch(autoBid._id, { isActive: false });
      }
    }

    // Create new auto-bid
    const autobidId = await ctx.db.insert("autobids", {
      userId,
      maxBidAmount: args.maxBidAmount,
      targetAuctionCount: args.targetAuctionCount,
      createdAt: Date.now(),
      isActive: true,
      currentWinCount: 0,
      lastProcessedAt: Date.now(),
    });

    // Schedule the auto-bid processor to run immediately
    // await ctx.scheduler.runAfter(0, internal.autobids.processAutoBids, {});
    console.log(
      `✅ Created new auto-bid ${autobidId} and scheduled processing`,
    );

    return autobidId;
  },
});

// Deactivate an auto-bid
export const deactivateAutoBid = mutation({
  args: {
    autobidId: v.id("autobids"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to deactivate an auto-bid");
    }

    const autoBid = await ctx.db.get(args.autobidId);
    if (!autoBid) {
      throw new ConvexError("Auto-bid not found");
    }

    if (autoBid.userId !== userId) {
      throw new ConvexError("You can only deactivate your own auto-bids");
    }

    await ctx.db.patch(args.autobidId, { isActive: false });
    return true;
  },
});

// Get all auto-bids for the current user
export const getUserAutoBids = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const autoBids = await ctx.db
      .query("autobids")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const result = [];

    for (const autoBid of autoBids) {
      const autobidAuctions = await ctx.db
        .query("autobidAuctions")
        .withIndex("by_autobid", (q) => q.eq("autobidId", autoBid._id))
        .collect();

      const auctionsWithDetails = [];
      for (const autobidAuction of autobidAuctions) {
        const bid = await ctx.db.get(autobidAuction.bidId);
        const auction = await ctx.db.get(autobidAuction.auctionId);

        if (bid && auction) {
          // Check if this user's bid is the highest bid
          const isHighestBidder = auction.currentPrice === bid.amount;

          auctionsWithDetails.push({
            _id: autobidAuction._id,
            _creationTime: autobidAuction._creationTime,
            bidId: autobidAuction.bidId,
            currentBidAmount: bid.amount,
            isHighestBidder,
            auction: {
              _id: auction._id,
              title: auction.title,
              currentPrice: auction.currentPrice,
              status: auction.status,
              endTime: auction.endTime,
            },
          });
        }
      }

      result.push({
        ...autoBid,
        auctions: auctionsWithDetails,
      });
    }

    return result;
  },
});

// Get the auto-bid orderbook - grouped by max bid amount
export const getAutoBidOrderbook = query({
  args: {},
  returns: v.array(
    v.object({
      maxBidAmount: v.number(),
      totalTargetCount: v.number(),
      userCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    // Only get active auto-bids
    const autoBids = await ctx.db
      .query("autobids")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Group by max bid amount
    const orderbook = new Map<
      number,
      { totalTargetCount: number; userCount: number }
    >();

    for (const autoBid of autoBids) {
      const maxBid = autoBid.maxBidAmount;
      const entry = orderbook.get(maxBid) || {
        totalTargetCount: 0,
        userCount: 0,
      };

      entry.totalTargetCount += autoBid.targetAuctionCount;
      entry.userCount += 1;

      orderbook.set(maxBid, entry);
    }

    // Convert to array and sort by max bid amount (descending)
    return Array.from(orderbook.entries())
      .map(([maxBidAmount, { totalTargetCount, userCount }]) => ({
        maxBidAmount,
        totalTargetCount,
        userCount,
      }))
      .sort((a, b) => b.maxBidAmount - a.maxBidAmount);
  },
});

// Internal function to process auto-bids
export const processAutoBids = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    console.log("🔄 Starting processAutoBids execution");

    // Update auction statuses if needed
    const now = Date.now();
    console.log(`🕒 Current timestamp for status update: ${now}`);

    // Get all active auto-bids sorted by max bid amount (highest first)
    const autoBids = await ctx.runQuery(
      internal.autobids.getActiveAutoBids,
      {},
    );
    console.log(`📋 Found ${autoBids.length} active auto-bids`);

    // Get all active auctions
    const auctions = await ctx.runQuery(
      internal.autobids.getActiveAuctions,
      {},
    );
    console.log(`🏷️ Found ${auctions.length} active auctions`);

    // If there are no active auctions or auto-bids, exit
    if (auctions.length === 0 || autoBids.length === 0) {
      console.log("⚠️ No active auctions or auto-bids found. Exiting.");
      return null;
    }

    // Sort auctions by current price (descending)
    const sortedAuctions = auctions.sort(
      (a, b) => b.currentPrice - a.currentPrice,
    );

    // Process auto-bids in order of max bid amount (highest first)
    for (let i = 0; i < autoBids.length; i++) {
      const autoBid = autoBids[i];
      const nextAutoBid = i < autoBids.length - 1 ? autoBids[i + 1] : null;

      console.log(
        `🔍 Processing auto-bid ${autoBid._id} with max amount ${autoBid.maxBidAmount} and target count ${autoBid.targetAuctionCount}`,
      );

      // Get current win count (completed auctions won)
      const currentWins = await ctx.runQuery(
        internal.autobids.getAutobidWinCount,
        { autobidId: autoBid._id },
      );

      // Get leading count (active auctions where autobid is leading)
      const leadingCount = await ctx.runQuery(
        internal.autobids.getAutobidLeadingCount,
        { autobidId: autoBid._id },
      );

      console.log(
        `📊 Auto-bid has won ${currentWins} auctions and is leading in ${leadingCount} active auctions`,
      );

      // Update the currentWinCount in the database to reflect the actual count
      if (currentWins !== autoBid.currentWinCount) {
        await ctx.runMutation(internal.autobids.updateAutobidWinCount, {
          autobidId: autoBid._id,
          winCount: currentWins,
        });
      }

      // Calculate how many more auctions this autobid needs to win
      // Only count completed wins toward the target
      const neededWins = Math.max(0, autoBid.targetAuctionCount - currentWins);
      console.log(`📊 Auto-bid needs to win ${neededWins} more auctions`);

      if (neededWins === 0) {
        console.log("✅ Auto-bid already has enough winning auctions");
        continue;
      }

      // We need to consider both current wins and leading bids when determining
      // how many more auctions to try to claim
      const potentialWins = currentWins + leadingCount;
      const additionalNeeded = Math.max(
        0,
        autoBid.targetAuctionCount - potentialWins,
      );

      if (additionalNeeded === 0) {
        console.log(
          "✅ Auto-bid already has enough potential winning auctions (including current leading bids)",
        );
        continue;
      }

      console.log(
        `📊 Auto-bid needs to claim ${additionalNeeded} more auctions beyond current wins and leading bids`,
      );

      // Count of auctions successfully claimed in this round
      let claimedCount = 0;

      // Try to claim auctions
      for (const auction of sortedAuctions) {
        if (claimedCount >= additionalNeeded) {
          break; // We've claimed enough auctions
        }

        // Determine bid amount based on next autobid's max amount
        // If there's no next autobid, use the current price plus minimum increment
        let bidAmount;
        if (nextAutoBid) {
          bidAmount = nextAutoBid.maxBidAmount;
        } else {
          const minIncrement = auction.bidIncrementMinimum || 1;
          bidAmount = auction.currentPrice + minIncrement;
        }

        // Check if bid amount is within max bid amount
        if (bidAmount > autoBid.maxBidAmount) {
          console.log(
            `❌ Bid amount ${bidAmount} exceeds max bid amount ${autoBid.maxBidAmount}, skipping`,
          );
          continue;
        }

        // Check if auction is already claimed by a higher autobid
        const existingClaim = await ctx.runQuery(
          internal.autobids.getExistingClaim,
          { auctionId: auction._id },
        );
        if (existingClaim) {
          console.log(
            `⚠️ Auction ${auction._id} already claimed by auto-bid ${existingClaim.autobidId}`,
          );

          // If the existing claim has a lower max bid amount, we can outbid it
          const existingAutoBid = autoBids.find(
            (ab) => ab._id === existingClaim.autobidId,
          );
          if (
            existingAutoBid &&
            existingAutoBid.maxBidAmount < autoBid.maxBidAmount
          ) {
            console.log(
              `✅ Our max bid amount ${autoBid.maxBidAmount} is higher than existing claim ${existingAutoBid.maxBidAmount}, outbidding`,
            );

            // Remove the existing claim's autobidAuction record
            await ctx.runMutation(internal.autobids.removeAutobidAuction, {
              autobidId: existingClaim.autobidId,
              auctionId: auction._id,
            });

            // Update the claim with our higher bid
            const existingAutoBidRecord = autoBids.find(
              (ab) => ab._id === existingClaim.autobidId,
            );
            if (existingAutoBidRecord) {
              console.log(
                `✅ Updating claim for auction ${auction._id} from auto-bid ${existingClaim.autobidId} to auto-bid ${autoBid._id}`,
              );

              // Place our bid
              await ctx.runMutation(internal.autobids.placeBid, {
                autobidId: autoBid._id,
                auctionId: auction._id,
                bidAmount: bidAmount,
                userId: autoBid.userId,
              });
            }

            claimedCount++;
          } else {
            console.log(
              `❌ Our max bid amount ${autoBid.maxBidAmount} is not higher than existing claim's max bid amount, cannot outbid`,
            );
          }
        } else {
          // Auction not claimed, we can claim it
          console.log(
            `✅ Claiming auction ${auction._id} with bid amount ${bidAmount}`,
          );

          // Place our bid
          await ctx.runMutation(internal.autobids.placeBid, {
            autobidId: autoBid._id,
            auctionId: auction._id,
            bidAmount: bidAmount,
            userId: autoBid.userId,
          });

          claimedCount++;
        }
      }

      console.log(`✅ Auto-bid claimed ${claimedCount} new auctions`);
    }

    console.log("✅ Finished processAutoBids execution");
    return null;
  },
});

// Internal query to get auctions that need status updates
export const getAuctionsNeedingStatusUpdate = internalQuery({
  args: {},
  returns: v.object({
    upcomingToActive: v.array(v.id("auctions")),
    activeToEnded: v.array(v.id("auctions")),
  }),
  handler: async (ctx) => {
    const now = Date.now();

    // Find auctions that should be active (were upcoming but start time has passed)
    const upcomingToActive = await ctx.db
      .query("auctions")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "upcoming"),
          q.lte(q.field("startTime"), now),
          q.gt(q.field("endTime"), now),
        ),
      )
      .collect();

    // Find auctions that should be ended (were active but end time has passed)
    const activeToEnded = await ctx.db
      .query("auctions")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.lte(q.field("endTime"), now),
        ),
      )
      .collect();

    return {
      upcomingToActive: upcomingToActive.map((auction) => auction._id),
      activeToEnded: activeToEnded.map((auction) => auction._id),
    };
  },
});

// Internal mutation to update a single auction's status
export const updateAuctionStatus = internalMutation({
  args: {
    auctionId: v.id("auctions"),
    newStatus: v.union(
      v.literal("upcoming"),
      v.literal("active"),
      v.literal("ended"),
      v.literal("canceled"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.auctionId, { status: args.newStatus });
    console.log(
      `✅ Updated auction ${args.auctionId} to status: ${args.newStatus}`,
    );
    return null;
  },
});

// Internal query to get all active auto-bids
export const getActiveAutoBids = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("autobids"),
      _creationTime: v.number(),
      userId: v.id("users"),
      maxBidAmount: v.number(),
      targetAuctionCount: v.number(),
      createdAt: v.number(),
      isActive: v.boolean(),
      currentWinCount: v.number(),
      lastProcessedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const autoBids = await ctx.db
      .query("autobids")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Sort by max bid amount (descending) and then by creation time (ascending)
    // This ensures highest bids go first, and for equal bids, the oldest (first) gets priority
    return autoBids.sort((a, b) => {
      if (b.maxBidAmount !== a.maxBidAmount) {
        return b.maxBidAmount - a.maxBidAmount;
      }
      return a.createdAt - b.createdAt;
    });
  },
});

// Internal query to get all active auctions
export const getActiveAuctions = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    console.log(`🕒 Current timestamp: ${now}`);

    // Now get active auctions
    const activeAuctions = await ctx.db
      .query("auctions")
      .filter((q) =>
        q.and(q.lte(q.field("startTime"), now), q.gte(q.field("endTime"), now)),
      )
      .collect();

    console.log(`📊 Active auctions found: ${activeAuctions.length}`);

    // Return active auctions without the status field to match the expected validator
    return activeAuctions;
  },
});

// Internal query to get all auto-bid auctions for a specific user
export const getAutobidAuctionsForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // First get all autobids for this user
    const userAutobids = await ctx.db
      .query("autobids")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Then get all autobidAuctions for these autobids
    const results = [];
    for (const autobid of userAutobids) {
      const autobidAuctions = await ctx.db
        .query("autobidAuctions")
        .withIndex("by_autobid", (q) => q.eq("autobidId", autobid._id))
        .collect();

      // Add each auction to the results
      for (const auction of autobidAuctions) {
        results.push({
          bidId: auction.bidId,
        });
      }
    }

    return results;
  },
});

// Internal query to get a single auto-bid
export const getAutobid = internalQuery({
  args: {
    autobidId: v.id("autobids"),
  },
  returns: v.object({
    _id: v.id("autobids"),
    userId: v.id("users"),
    isActive: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const autoBid = await ctx.db.get(args.autobidId);
    if (!autoBid) {
      throw new Error("Auto-bid not found");
    }
    return {
      _id: autoBid._id,
      userId: autoBid.userId,
      isActive: autoBid.isActive,
    };
  },
});

// Internal mutation to update auction statuses
export const updateAuctionStatuses = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    console.log(`🕒 Current timestamp for status update: ${now}`);

    // Update auctions that should be active (were upcoming but start time has passed)
    const upcomingToActive = await ctx.db
      .query("auctions")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "upcoming"),
          q.lte(q.field("startTime"), now),
          q.gt(q.field("endTime"), now),
        ),
      )
      .collect();

    console.log(
      `🔄 Updating ${upcomingToActive.length} auctions from upcoming to active`,
    );

    for (const auction of upcomingToActive) {
      await ctx.db.patch(auction._id, { status: "active" });
      console.log(`✅ Updated auction ${auction._id} from upcoming to active`);
    }

    // Update auctions that should be ended (were active but end time has passed)
    const activeToEnded = await ctx.db
      .query("auctions")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.lte(q.field("endTime"), now),
        ),
      )
      .collect();

    console.log(
      `🔄 Updating ${activeToEnded.length} auctions from active to ended`,
    );

    for (const auction of activeToEnded) {
      await ctx.db.patch(auction._id, { status: "ended" });
      console.log(`✅ Updated auction ${auction._id} from active to ended`);
    }

    return null;
  },
});

// Create test auctions for debugging
export const createTestAuctions = internalMutation({
  args: {
    count: v.number(),
    startingPrice: v.optional(v.number()),
  },
  returns: v.array(v.id("auctions")),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to create test auctions");
    }

    const now = Date.now();
    const startingPrice = args.startingPrice || 10;
    const auctionIds = [];

    for (let i = 0; i < args.count; i++) {
      // Create an auction that starts now and ends in 1 hour
      const auctionId = await ctx.db.insert("auctions", {
        title: `Test Auction ${i + 1}`,
        description: "This is a test auction for debugging the autobidder",
        startingPrice,
        currentPrice: startingPrice,
        startTime: now,
        endTime: now + 60 * 60 * 1000, // 1 hour from now
        creatorId: userId,
        status: "active",
        bidIncrementMinimum: 1,
      });

      auctionIds.push(auctionId);
      console.log(`✅ Created test auction ${auctionId}`);
    }

    return auctionIds;
  },
});

// Delete an auto-bid
export const deleteAutoBid = mutation({
  args: {
    autobidId: v.id("autobids"),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to delete an auto-bid");
    }

    // Get the auto-bid
    const autoBid = await ctx.db.get(args.autobidId);
    if (!autoBid) {
      return {
        success: false,
        message: "Auto-bid not found",
      };
    }

    // Check if the auto-bid belongs to the user
    if (autoBid.userId !== userId) {
      throw new ConvexError("You can only delete your own auto-bids");
    }

    // Get all autobidAuctions for this autobid
    const autobidAuctions = await ctx.db
      .query("autobidAuctions")
      .withIndex("by_autobid", (q) => q.eq("autobidId", args.autobidId))
      .collect();

    console.log(
      `🗑️ Deleting ${autobidAuctions.length} autobidAuctions for autobid ${args.autobidId}`,
    );

    // Delete all autobidAuctions
    for (const autobidAuction of autobidAuctions) {
      await ctx.db.delete(autobidAuction._id);
    }

    // Delete the auto-bid
    await ctx.db.delete(args.autobidId);
    console.log(`🗑️ Deleted autobid ${args.autobidId}`);

    return {
      success: true,
      message: "Auto-bid deleted successfully",
    };
  },
});

// Delete all auto-bids for the current user
export const deleteAllAutoBids = mutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    count: v.number(),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to delete your auto-bids");
    }

    // Get all auto-bids for this user
    const autoBids = await ctx.db
      .query("autobids")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    console.log(
      `🗑️ Found ${autoBids.length} autobids to delete for user ${userId}`,
    );

    let deletedCount = 0;

    // Delete each auto-bid and its associated autobidAuctions
    for (const autoBid of autoBids) {
      // Get all autobidAuctions for this autobid
      const autobidAuctions = await ctx.db
        .query("autobidAuctions")
        .withIndex("by_autobid", (q) => q.eq("autobidId", autoBid._id))
        .collect();

      console.log(
        `🗑️ Deleting ${autobidAuctions.length} autobidAuctions for autobid ${autoBid._id}`,
      );

      // Delete all autobidAuctions
      for (const autobidAuction of autobidAuctions) {
        await ctx.db.delete(autobidAuction._id);
      }

      // Delete the auto-bid
      await ctx.db.delete(autoBid._id);
      console.log(`🗑️ Deleted autobid ${autoBid._id}`);

      deletedCount++;
    }

    return {
      success: true,
      message: `Successfully deleted ${deletedCount} auto-bids`,
      count: deletedCount,
    };
  },
});

// Create test. Create 100 auctions, 200 users with a autobid each with random max bid amount and target auction count
export const createTest = mutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to create test auctions");
    }
    console.log(`userId: ${userId}`);

    await ctx.runMutation(internal.autobids.createTestAuctions, {
      count: 100,
      startingPrice: 10,
    });

    const usersIds = await ctx.runMutation(internal.users.createTestUsers, {
      count: 10,
    });

    for (const userId of usersIds) {
      await createAutoBid(ctx, {
        userId,
        maxBidAmount: Math.floor(Math.random() * 1000),
        targetAuctionCount: Math.max(1, Math.floor(Math.random() * 10)),
      });
    }

    return {
      success: true,
      message: "Test auctions created successfully",
    };
  },
});

// Clear all tables
export const clearAllTables = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to clear all tables");
    }

    // Delete all autobidAuctions first (due to foreign key relationships)
    const autobidAuctions = await ctx.db.query("autobidAuctions").collect();
    console.log(`🗑️ Deleting ${autobidAuctions.length} autobidAuctions`);
    for (const autobidAuction of autobidAuctions) {
      await ctx.db.delete(autobidAuction._id);
    }

    // Delete all autobids
    const autobids = await ctx.db.query("autobids").collect();
    console.log(`🗑️ Deleting ${autobids.length} autobids`);
    for (const autobid of autobids) {
      await ctx.db.delete(autobid._id);
    }

    // Delete all bids
    const bids = await ctx.db.query("bids").collect();
    console.log(`🗑️ Deleting ${bids.length} bids`);
    for (const bid of bids) {
      await ctx.db.delete(bid._id);
    }

    // Delete all auctions
    const auctions = await ctx.db.query("auctions").collect();
    console.log(`🗑️ Deleting ${auctions.length} auctions`);
    for (const auction of auctions) {
      await ctx.db.delete(auction._id);
    }

    // Delete all coupons
    const coupons = await ctx.db.query("coupons").collect();
    console.log(`🗑️ Deleting ${coupons.length} coupons`);
    for (const coupon of coupons) {
      await ctx.db.delete(coupon._id);
    }

    // Delete all bundles
    const bundles = await ctx.db.query("couponBundles").collect();
    console.log(`🗑️ Deleting ${bundles.length} bundles`);
    for (const bundle of bundles) {
      await ctx.db.delete(bundle._id);
    }

    // Delete all test users
    const testUsers = await ctx.db.query("users").collect();
    console.log(`🗑️ Deleting ${testUsers.length} test users`);
    for (const user of testUsers) {
      if (user.email?.includes("test")) {
        await ctx.db.delete(user._id);
      }
    }

    console.log("✅ All tables cleared successfully");
    return null;
  },
});

// Internal mutation to remove an autobidAuction record
export const removeAutobidAuction = internalMutation({
  args: {
    autobidId: v.id("autobids"),
    auctionId: v.id("auctions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Find the autobidAuction record using the by_autobid index
    const autobidAuctions = await ctx.db
      .query("autobidAuctions")
      .withIndex("by_autobid", (q) => q.eq("autobidId", args.autobidId))
      .collect();

    // Find the specific record for this auction
    const autobidAuction = autobidAuctions.find(
      (record) => record.auctionId === args.auctionId,
    );

    if (autobidAuction) {
      // Delete the record
      await ctx.db.delete(autobidAuction._id);
      console.log(
        `🗑️ Removed autobidAuction record for autobid ${args.autobidId} and auction ${args.auctionId}`,
      );
    }

    return null;
  },
});

// Internal mutation to place a bid
export const placeBid = internalMutation({
  args: {
    autobidId: v.id("autobids"),
    auctionId: v.id("auctions"),
    bidAmount: v.number(),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      // Place the actual bid
      const bid = await ctx.db.insert("bids", {
        auctionId: args.auctionId,
        amount: args.bidAmount,
        bidderId: args.userId,
        timestamp: Date.now(),
      });
      console.log(
        `✅ Placed bid of ${args.bidAmount} on auction ${args.auctionId}`,
      );

      // Check if there's an existing autobidAuction record for this auction
      const existingRecord = await ctx.db
        .query("autobidAuctions")
        .withIndex("by_auction", (q) => q.eq("auctionId", args.auctionId))
        .first();

      if (existingRecord) {
        // Update the existing record with the new bid ID
        await ctx.db.patch(existingRecord._id, {
          autobidId: args.autobidId,
          bidId: bid,
        });
        console.log(
          `✅ Updated autobidAuction record for autobid ${args.autobidId} and auction ${args.auctionId}`,
        );
      } else {
        // Create a new autobidAuction record
        await ctx.db.insert("autobidAuctions", {
          autobidId: args.autobidId,
          auctionId: args.auctionId,
          bidId: bid,
        });
        console.log(
          `✅ Created autobidAuction record for autobid ${args.autobidId} and auction ${args.auctionId}`,
        );
      }

      // Update the auction's current price
      await ctx.db.patch(args.auctionId, {
        currentPrice: args.bidAmount,
      });
      console.log(
        `✅ Updated auction ${args.auctionId} current price to ${args.bidAmount}`,
      );
    } catch (error) {
      console.error(`❌ Error placing bid: ${error}`);
    }

    return null;
  },
});

// Get current bids for an autobid
export const getAutobidCurrentBids = internalQuery({
  args: {
    autobidId: v.id("autobids"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("autobidAuctions")
      .withIndex("by_autobid", (q) => q.eq("autobidId", args.autobidId))
      .collect();
  },
});

// Get existing claim for an auction
export const getExistingClaim = internalQuery({
  args: {
    auctionId: v.id("auctions"),
  },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const claims = await ctx.db
      .query("autobidAuctions")
      .withIndex("by_auction", (q) => q.eq("auctionId", args.auctionId))
      .collect();

    return claims.length > 0 ? claims[0] : null;
  },
});

// Get the count of completed auctions won by an autobid
export const getAutobidWinCount = internalQuery({
  args: {
    autobidId: v.id("autobids"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    // Get all autobidAuctions records for this autobid
    const autobidAuctions = await ctx.db
      .query("autobidAuctions")
      .withIndex("by_autobid", (q) => q.eq("autobidId", args.autobidId))
      .collect();

    if (autobidAuctions.length === 0) {
      return 0;
    }

    // Get all auction IDs and bid IDs
    const auctionIds = autobidAuctions.map((record) => record.auctionId);
    const bidIds = autobidAuctions.map((record) => record.bidId);

    // Fetch all auctions and bids in parallel
    const [auctions, bids] = await Promise.all([
      Promise.all(auctionIds.map((id) => ctx.db.get(id))),
      Promise.all(bidIds.map((id) => ctx.db.get(id))),
    ]);

    // Current time
    const now = Date.now();

    // Count completed auctions where this autobid had the winning bid
    let winCount = 0;

    for (let i = 0; i < auctions.length; i++) {
      const auction = auctions[i];
      const bid = bids[i];

      if (
        auction &&
        bid &&
        auction.endTime < now &&
        bid.amount === auction.currentPrice
      ) {
        winCount++;
      }
    }

    return winCount;
  },
});

// Get the count of active auctions where an autobid is currently leading
export const getAutobidLeadingCount = internalQuery({
  args: {
    autobidId: v.id("autobids"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    // Get all autobidAuctions records for this autobid
    const autobidAuctions = await ctx.db
      .query("autobidAuctions")
      .withIndex("by_autobid", (q) => q.eq("autobidId", args.autobidId))
      .collect();

    if (autobidAuctions.length === 0) {
      return 0;
    }

    // Get all auction IDs and bid IDs
    const auctionIds = autobidAuctions.map((record) => record.auctionId);
    const bidIds = autobidAuctions.map((record) => record.bidId);

    // Fetch all auctions and bids in parallel
    const [auctions, bids] = await Promise.all([
      Promise.all(auctionIds.map((id) => ctx.db.get(id))),
      Promise.all(bidIds.map((id) => ctx.db.get(id))),
    ]);

    // Current time
    const now = Date.now();

    // Count active auctions where this autobid has the highest bid
    let leadingCount = 0;

    for (let i = 0; i < auctions.length; i++) {
      const auction = auctions[i];
      const bid = bids[i];

      if (
        auction &&
        bid &&
        auction.status === "active" &&
        auction.endTime > now &&
        bid.amount === auction.currentPrice
      ) {
        leadingCount++;
      }
    }

    return leadingCount;
  },
});

// Internal mutation to update autobid current win count
export const updateAutobidWinCount = internalMutation({
  args: {
    autobidId: v.id("autobids"),
    winCount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.autobidId, { currentWinCount: args.winCount });
    console.log(
      `✅ Updated autobid ${args.autobidId} current win count to ${args.winCount}`,
    );
    return null;
  },
});
