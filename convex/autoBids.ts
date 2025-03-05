import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

// Create a new auto bid configuration
export const createAutoBid = mutation({
  args: {
    maxAmount: v.number(),
    maxAuctions: v.number(),
  },
  returns: v.id("autoBids"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to create an auto bid");
    }

    // Validate inputs
    if (args.maxAmount <= 0) {
      throw new ConvexError("Maximum amount must be greater than 0");
    }

    if (args.maxAuctions <= 0) {
      throw new ConvexError("Maximum auctions must be greater than 0");
    }

    // Check if user already has an active auto bid configuration
    const existingAutoBids = await ctx.db
      .query("autoBids")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    if (existingAutoBids.length > 0) {
      // Update the existing auto bid instead of creating a new one
      const existingAutoBid = existingAutoBids[0];
      await ctx.db.patch(existingAutoBid._id, {
        maxAmount: args.maxAmount,
        maxAuctions: args.maxAuctions,
        remainingAuctions: args.maxAuctions, // Reset remaining auctions to the new max
        createdAt: Date.now(), // Update the timestamp to reflect the change
      });

      return existingAutoBid._id;
    }

    // Create a new auto bid configuration
    const autoBidId = await ctx.db.insert("autoBids", {
      userId,
      maxAmount: args.maxAmount,
      maxAuctions: args.maxAuctions,
      createdAt: Date.now(),
      isActive: true,
      auctionsParticipated: [],
      auctionsWon: [],
      remainingAuctions: args.maxAuctions,
    });

    // Process active auctions to potentially place bids immediately
    await ctx.scheduler.runAfter(
      0,
      internal.autoBids.processActiveAuctions,
      {},
    );

    return autoBidId;
  },
});

// Get the auto bid configuration for the current user
export const getMyAutoBid = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const autoBids = await ctx.db
      .query("autoBids")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    if (autoBids.length === 0) {
      return null;
    }

    return autoBids[0];
  },
});

// Get all auto bid participations for the current user
export const getMyAutoBidParticipations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const participations = await ctx.db
      .query("autoBidParticipations")
      .withIndex("by_user_auction", (q) => q.eq("userId", userId))
      .collect();

    // Fetch auction details for each participation
    const result = [];
    for (const participation of participations) {
      const auction = await ctx.db.get(participation.auctionId);
      if (auction) {
        result.push({
          ...participation,
          auction: {
            _id: auction._id,
            title: auction.title,
            currentPrice: auction.currentPrice,
            endTime: auction.endTime,
            status: auction.status,
          },
        });
      }
    }

    return result;
  },
});

// Cancel an auto bid
export const cancelAutoBid = mutation({
  args: {
    autoBidId: v.id("autoBids"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to cancel an auto bid");
    }

    // Get the auto bid
    const autoBid = await ctx.db.get(args.autoBidId);
    if (!autoBid) {
      throw new ConvexError("Auto bid not found");
    }

    // Check if the user owns this auto bid
    if (autoBid.userId !== userId) {
      throw new ConvexError("You can only cancel your own auto bids");
    }

    // Get all participations for this auto bid
    const participations = await ctx.db
      .query("autoBidParticipations")
      .withIndex("by_autoBid", (q) => q.eq("autoBidId", args.autoBidId))
      .collect();

    // Delete all participations
    for (const participation of participations) {
      await ctx.db.delete(participation._id);
      console.log(
        `Deleted participation ${participation._id} for auto bid ${args.autoBidId}`,
      );
    }

    // Delete the auto bid
    await ctx.db.delete(args.autoBidId);
    console.log(`Deleted auto bid ${args.autoBidId} for user ${userId}`);

    return null;
  },
});

// Cancel a participation in an auction
export const cancelAutoBidParticipation = mutation({
  args: {
    participationId: v.id("autoBidParticipations"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to cancel a participation");
    }

    // Get the participation
    const participation = await ctx.db.get(args.participationId);
    if (!participation) {
      throw new ConvexError("Participation not found");
    }

    // Check if the user owns this participation
    if (participation.userId !== userId) {
      throw new ConvexError(
        "You can only cancel your own auto bid participations",
      );
    }

    // Get the auto bid configuration
    const autoBid = await ctx.db.get(participation.autoBidId);
    if (autoBid) {
      // Remove this auction from the participated list if it exists
      let auctionsParticipated = autoBid.auctionsParticipated || [];
      auctionsParticipated = auctionsParticipated.filter(
        (id) => id.toString() !== participation.auctionId.toString(),
      );

      // Increment the remaining auctions count
      const remainingAuctions = Math.min(
        autoBid.maxAuctions,
        autoBid.remainingAuctions + 1,
      );

      // Update the auto bid
      await ctx.db.patch(autoBid._id, {
        auctionsParticipated,
        remainingAuctions,
        // Ensure auto bid is active if it was deactivated due to reaching max auctions
        isActive: true,
      });

      console.log(
        `Updated auto bid after canceling participation for user ${userId} in auction ${participation.auctionId}. Remaining auctions: ${remainingAuctions}`,
      );
    }

    // Delete the participation
    await ctx.db.delete(args.participationId);
    console.log(
      `Deleted participation for user ${userId} in auction ${participation.auctionId}`,
    );

    return null;
  },
});

// Process all active auctions for auto bidding (called by cron job)
export const processActiveAuctions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find all active auctions
    const activeAuctions = await ctx.db
      .query("auctions")
      .filter((q) =>
        q.and(q.lt(q.field("startTime"), now), q.gt(q.field("endTime"), now)),
      )
      .collect();

    console.log(
      `Processing auto bids for ${activeAuctions.length} active auctions`,
    );

    if (activeAuctions.length === 0) {
      return 0;
    }

    // Get all active auto bid configurations
    const activeAutoBids = await ctx.db
      .query("autoBids")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .filter((q) => q.gt(q.field("remainingAuctions"), 0))
      .collect();

    if (activeAutoBids.length === 0) {
      console.log("No active auto bid configurations found");
      return 0;
    }

    // Get all existing active participations for all users
    const allActiveParticipations = await ctx.db
      .query("autoBidParticipations")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Create a map of user IDs to their active participation count
    const userParticipationCounts = new Map();

    // Count active participations per user
    for (const participation of allActiveParticipations) {
      const userId = participation.userId;
      userParticipationCounts.set(
        userId,
        (userParticipationCounts.get(userId) || 0) + 1,
      );
    }

    // Create a map of auction IDs to users already participating
    const auctionParticipants = new Map();
    for (const participation of allActiveParticipations) {
      if (!auctionParticipants.has(participation.auctionId)) {
        auctionParticipants.set(participation.auctionId, new Set());
      }
      auctionParticipants
        .get(participation.auctionId)
        .add(participation.userId);
    }

    // Filter auto bids to only include those that haven't reached their max
    const eligibleAutoBids = activeAutoBids.filter((autoBid) => {
      const currentParticipations =
        userParticipationCounts.get(autoBid.userId) || 0;
      return currentParticipations < autoBid.maxAuctions;
    });

    console.log(
      `Found ${eligibleAutoBids.length} eligible auto bids out of ${activeAutoBids.length} total`,
    );

    // First, create participations for all eligible auctions
    for (const auction of activeAuctions) {
      // Get users already participating in this auction
      const existingParticipants =
        auctionParticipants.get(auction._id) || new Set();

      // Filter auto bids to only include those not already participating in this auction
      const eligibleForThisAuction = eligibleAutoBids.filter(
        (autoBid) => !existingParticipants.has(autoBid.userId),
      );

      if (eligibleForThisAuction.length > 0) {
        await processAutoBidsForAuction(
          ctx,
          auction._id,
          eligibleForThisAuction,
        );
      }
    }

    // Now, process all active participations for all auctions
    // This ensures we try to place bids in all auctions where users are participating
    for (const auction of activeAuctions) {
      await processParticipationsForAuction(ctx, auction._id);
    }

    return activeAuctions.length;
  },
});

// Internal function to process auto bids for an auction
async function processAutoBidsForAuction(
  ctx: MutationCtx,
  auctionId: Id<"auctions">,
  activeAutoBids: Doc<"autoBids">[],
) {
  // Get the auction
  const auction = await ctx.db.get(auctionId);
  if (!auction) {
    console.error(`Auction ${auctionId} not found`);
    return null;
  }

  // Check if auction is active
  const now = Date.now();
  if (now < auction.startTime || now > auction.endTime) {
    console.log(`Auction ${auctionId} is not active`);
    return null;
  }

  // Get existing participations for this auction
  const existingParticipations = await ctx.db
    .query("autoBidParticipations")
    .withIndex("by_auction_active", (q) =>
      q.eq("auctionId", auctionId).eq("isActive", true),
    )
    .collect();

  // Create a map of user IDs to their existing participations
  const userParticipations = new Map();
  for (const participation of existingParticipations) {
    userParticipations.set(participation.userId, participation);
  }

  // For each active auto bid configuration, check if it should participate in this auction
  for (const autoBid of activeAutoBids) {
    // Skip if user already has a participation for this auction
    if (userParticipations.has(autoBid.userId)) {
      continue;
    }

    // Double-check the actual number of active participations for this user
    const activeParticipations = await ctx.db
      .query("autoBidParticipations")
      .withIndex("by_user_auction", (q) => q.eq("userId", autoBid.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Get the number of auctions won
    const auctionsWon = autoBid.auctionsWon || [];

    // Skip if user has already won the maximum number of auctions
    if (auctionsWon.length >= autoBid.maxAuctions) {
      console.log(
        `Skipping auto bid for user ${autoBid.userId} - already won ${auctionsWon.length} auctions (max: ${autoBid.maxAuctions})`,
      );

      // Update the auto bid to deactivate it if they've won the maximum number of auctions
      if (autoBid.isActive && auctionsWon.length >= autoBid.maxAuctions) {
        await ctx.db.patch(autoBid._id, {
          isActive: false,
        });
      }

      continue;
    }

    // Skip if user has already reached the maximum number of active participations
    if (activeParticipations.length >= autoBid.maxAuctions) {
      console.log(
        `Skipping auto bid for user ${autoBid.userId} - already participating in ${activeParticipations.length} auctions (max: ${autoBid.maxAuctions})`,
      );

      // Update the remainingAuctions field to match reality
      if (
        autoBid.remainingAuctions !==
        autoBid.maxAuctions - activeParticipations.length
      ) {
        await ctx.db.patch(autoBid._id, {
          remainingAuctions: Math.max(
            0,
            autoBid.maxAuctions - activeParticipations.length,
          ),
        });
      }

      continue;
    }

    // Create a new participation for this auction
    const participationId = await ctx.db.insert("autoBidParticipations", {
      autoBidId: autoBid._id,
      auctionId,
      userId: autoBid.userId,
      maxAmount: autoBid.maxAmount,
      isActive: true,
      createdAt: Date.now(),
    });

    console.log(
      `Created auto bid participation for user ${autoBid.userId} in auction ${auctionId}`,
    );

    // Update the auto bid to track participation and decrement remaining auctions
    const auctionsParticipated = autoBid.auctionsParticipated || [];
    auctionsParticipated.push(auctionId);

    // Calculate the correct remaining auctions based on actual participations
    const remainingAuctions = Math.max(
      0,
      autoBid.maxAuctions - activeParticipations.length - 1,
    );

    // Update the auto bid
    await ctx.db.patch(autoBid._id, {
      auctionsParticipated,
      remainingAuctions,
      // Keep auto bid active until they've won the maximum number of auctions
      isActive: true,
    });

    // Add to the map to prevent duplicate participations
    userParticipations.set(autoBid.userId, {
      _id: participationId,
      autoBidId: autoBid._id,
      auctionId,
      userId: autoBid.userId,
      maxAmount: autoBid.maxAmount,
      isActive: true,
      createdAt: Date.now(),
    });
  }

  // Now process all participations for this auction
  await processParticipationsForAuction(ctx, auctionId);
  return null;
}

// Process participations for a specific auction
async function processParticipationsForAuction(
  ctx: MutationCtx,
  auctionId: Id<"auctions">,
) {
  // Get the auction
  const auction = await ctx.db.get(auctionId);
  if (!auction) {
    console.error(`Auction ${auctionId} not found`);
    return null;
  }

  // Get all active participations for this auction
  const participations = await ctx.db
    .query("autoBidParticipations")
    .withIndex("by_auction_active", (q) =>
      q.eq("auctionId", auctionId).eq("isActive", true),
    )
    .collect();

  if (participations.length === 0) {
    console.log(`No active participations for auction ${auctionId}`);
    return null;
  }

  // Sort participations by max amount (highest first) and then by creation time (earliest first)
  participations.sort((a, b) => {
    if (a.maxAmount !== b.maxAmount) {
      return b.maxAmount - a.maxAmount; // Highest max amount first
    }
    return a.createdAt - b.createdAt; // Earliest creation time first
  });

  // Get the current highest bid for this auction
  const highestBid = await getHighestBidForAuction(ctx, auctionId);

  // Calculate the next valid bid amount
  const minIncrement = auction.bidIncrementMinimum || 1;
  const nextBidAmount = auction.currentPrice + minIncrement;

  // Get all bids for this auction to check if users need to respond to outbids
  const recentBids = await ctx.db
    .query("bids")
    .withIndex("by_auction", (q) => q.eq("auctionId", auctionId))
    .order("desc")
    .take(5); // Get the most recent bids

  // Try each participation in order until one successfully places a bid
  for (const participation of participations) {
    // Skip if this user already has the highest bid
    if (highestBid && highestBid.bidderId === participation.userId) {
      console.log(`User ${participation.userId} already has the highest bid`);
      continue;
    }

    // Check if this user has been outbid
    const hasBeenOutbid =
      recentBids.length > 0 &&
      participation.lastBidId &&
      recentBids[0]._id.toString() !== participation.lastBidId.toString();

    // Skip if this participation can't afford the next bid
    if (participation.maxAmount < nextBidAmount) {
      console.log(
        `Participation (${participation.maxAmount}) cannot afford next bid (${nextBidAmount})`,
      );
      continue;
    }

    // If the user hasn't been outbid and doesn't have the highest bid, they might not need to bid yet
    // This prevents unnecessary bidding wars between auto bidders
    if (
      !hasBeenOutbid &&
      highestBid?.bidderId.toString() !== participation.userId.toString() &&
      participation.lastBidAmount
    ) {
      // Only bid if this is the highest participation by max amount
      // This ensures only the auto bidder with the highest max will bid first
      if (participation !== participations[0]) {
        console.log(
          `User ${participation.userId} hasn't been outbid and isn't the highest participation, skipping`,
        );
        continue;
      }
    }

    // Try to place a bid with this participation
    try {
      // If the user has been outbid and their max amount is higher than the current price,
      // they should place a new bid
      const bidId = await ctx.db.insert("bids", {
        auctionId,
        amount: nextBidAmount,
        bidderId: participation.userId,
        timestamp: Date.now(),
      });

      // Update the auction's current price
      await ctx.db.patch(auctionId, {
        currentPrice: nextBidAmount,
      });

      // Update the participation with the latest bid information
      await ctx.db.patch(participation._id, {
        lastBidId: bidId,
        lastBidAmount: nextBidAmount,
      });

      // Create an auction event for the auto bid
      await ctx.db.insert("auctionEvents", {
        auctionId,
        eventType: "autoBid",
        timestamp: Date.now(),
        data: {
          message: `Auto bid placed for $${nextBidAmount.toFixed(2)}`,
          bidderId: participation.userId,
          bidAmount: nextBidAmount,
        },
      });

      console.log(
        `Auto bid placed for auction ${auctionId} by user ${participation.userId} for ${nextBidAmount}`,
      );

      // Schedule another check in case other participations need to respond
      await ctx.scheduler.runAfter(1000, internal.autoBids.onNewBid, {
        auctionId,
        bidId,
      });

      // Successfully placed a bid, so we can stop trying other participations
      return bidId;
    } catch (error) {
      console.error(`Error placing auto bid: ${error}`);
      // Continue to the next participation
      continue;
    }
  }

  // If we get here, no participation was able to place a bid
  console.log(
    `No participation was able to place a bid for auction ${auctionId}`,
  );
  return null;
}

// Helper function to get the highest bid for an auction
async function getHighestBidForAuction(
  ctx: QueryCtx | MutationCtx,
  auctionId: Id<"auctions">,
) {
  const bids = await ctx.db
    .query("bids")
    .withIndex("by_auction", (q) => q.eq("auctionId", auctionId))
    .order("desc")
    .take(1);

  return bids.length > 0 ? bids[0] : null;
}

// Schedule auto bid processing when a new bid is placed
export const onNewBid = internalMutation({
  args: {
    auctionId: v.id("auctions"),
    bidId: v.id("bids"),
  },
  handler: async (ctx, args) => {
    // First, process participations for the auction where the bid was placed
    await processParticipationsForAuction(ctx, args.auctionId);

    // Get the bid to find out which user placed it
    const bid = await ctx.db.get(args.bidId);
    if (!bid) {
      console.error(`Bid ${args.bidId} not found`);
      return null;
    }

    // Get all active auctions
    const now = Date.now();
    const activeAuctions = await ctx.db
      .query("auctions")
      .filter((q) =>
        q.and(q.lt(q.field("startTime"), now), q.gt(q.field("endTime"), now)),
      )
      .collect();

    // Get all active participations for the user who was outbid
    // This allows their auto bids to try other auctions if they can't win this one
    const outbidParticipations = await ctx.db
      .query("autoBidParticipations")
      .withIndex("by_auction_active", (q) =>
        q.eq("auctionId", args.auctionId).eq("isActive", true),
      )
      .filter((q) => q.neq(q.field("userId"), bid.bidderId))
      .collect();

    // Get unique user IDs of outbid users
    const outbidUserIds = new Set(outbidParticipations.map((p) => p.userId));

    // Optimize participations for outbid users
    for (const userId of outbidUserIds) {
      await optimizeAutoBidParticipations(ctx, userId);
    }

    // Process all other active auctions for outbid users
    for (const auction of activeAuctions) {
      // Skip the auction where the bid was just placed
      if (auction._id === args.auctionId) continue;

      // Get participations for this auction
      const auctionParticipations = await ctx.db
        .query("autoBidParticipations")
        .withIndex("by_auction_active", (q) =>
          q.eq("auctionId", auction._id).eq("isActive", true),
        )
        .collect();

      // Check if any outbid users are participating in this auction
      const hasOutbidUsers = auctionParticipations.some((p) =>
        outbidUserIds.has(p.userId),
      );

      // If any outbid users are participating, process this auction
      if (hasOutbidUsers) {
        await processParticipationsForAuction(ctx, auction._id);
      }
    }

    return null;
  },
});

// Update auto bid status when an auction ends
export const updateAutoBidOnAuctionEnd = internalMutation({
  args: {
    auctionId: v.id("auctions"),
    winnerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Get all participations for this auction
    const participations = await ctx.db
      .query("autoBidParticipations")
      .withIndex("by_auction_active", (q) =>
        q.eq("auctionId", args.auctionId).eq("isActive", true),
      )
      .collect();

    // Process each participation
    for (const participation of participations) {
      // Get the auto bid configuration
      const autoBid = await ctx.db.get(participation.autoBidId);
      if (!autoBid) continue;

      // If this user won the auction, update their auto bid configuration
      if (args.winnerId && args.winnerId === participation.userId) {
        // Add to auctions won
        const auctionsWon = autoBid.auctionsWon || [];
        auctionsWon.push(args.auctionId);

        // Update the auto bid with won auction
        const updates: {
          auctionsWon: Id<"auctions">[];
          isActive?: boolean;
        } = {
          auctionsWon,
        };

        // If they've won the maximum number of auctions, deactivate the auto bid
        if (auctionsWon.length >= autoBid.maxAuctions) {
          updates.isActive = false;
          console.log(
            `User ${participation.userId} has won ${auctionsWon.length} auctions (max: ${autoBid.maxAuctions}). Deactivating auto bid.`,
          );
        }

        await ctx.db.patch(autoBid._id, updates);

        console.log(
          `User ${participation.userId} won auction ${args.auctionId}. Updated won auctions list (${auctionsWon.length}/${autoBid.maxAuctions}).`,
        );
      }

      // Remove this auction from the participated list if it exists
      let auctionsParticipated = autoBid.auctionsParticipated || [];
      auctionsParticipated = auctionsParticipated.filter(
        (id) => id.toString() !== args.auctionId.toString(),
      );

      // Update the auto bid's auctionsParticipated list
      await ctx.db.patch(autoBid._id, {
        auctionsParticipated,
      });

      // Delete the participation
      await ctx.db.delete(participation._id);

      console.log(
        `Deleted participation for user ${participation.userId} in ended auction ${args.auctionId}`,
      );
    }

    return null;
  },
});

// Check if the current user can participate in a specific auction with auto bid
export const canParticipateInAuction = query({
  args: {
    auctionId: v.id("auctions"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { canParticipate: false, reason: "Not logged in" };
    }

    // Check if user already has a participation for this auction
    const existingParticipation = await ctx.db
      .query("autoBidParticipations")
      .withIndex("by_user_auction", (q) =>
        q.eq("userId", userId).eq("auctionId", args.auctionId),
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (existingParticipation) {
      return {
        canParticipate: false,
        reason: "Already participating in this auction",
        participation: existingParticipation,
      };
    }

    // Check if user has an active auto bid configuration
    const autoBid = await ctx.db
      .query("autoBids")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!autoBid) {
      return {
        canParticipate: false,
        reason: "No active auto bid configuration",
      };
    }

    // Get the number of auctions won
    const auctionsWon = autoBid.auctionsWon || [];

    // Check if user has already won the maximum number of auctions
    if (auctionsWon.length >= autoBid.maxAuctions) {
      return {
        canParticipate: false,
        reason: `You have already won the maximum number of auctions (${autoBid.maxAuctions}).`,
        autoBid,
        auctionsWonCount: auctionsWon.length,
      };
    }

    // Get all active participations for this user
    const activeParticipations = await ctx.db
      .query("autoBidParticipations")
      .withIndex("by_user_auction", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Check if user has already reached the maximum number of active participations
    if (activeParticipations.length >= autoBid.maxAuctions) {
      return {
        canParticipate: false,
        reason: `Maximum number of auctions (${autoBid.maxAuctions}) reached. You are currently participating in ${activeParticipations.length} auctions.`,
        autoBid,
        activeParticipationsCount: activeParticipations.length,
      };
    }

    // Calculate the correct remaining auctions
    const remainingAuctions = Math.max(
      0,
      autoBid.maxAuctions - activeParticipations.length,
    );

    return {
      canParticipate: true,
      autoBid,
      remainingAuctions,
      activeParticipationsCount: activeParticipations.length,
      auctionsWonCount: auctionsWon.length,
    };
  },
});

// Enable auto bidding for a specific auction
export const enableAutoBidForAuction = mutation({
  args: {
    auctionId: v.id("auctions"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to enable auto bidding");
    }

    // Check if the auction exists and is active
    const auction = await ctx.db.get(args.auctionId);
    if (!auction) {
      throw new ConvexError("Auction not found");
    }

    const now = Date.now();
    if (now < auction.startTime || now > auction.endTime) {
      throw new ConvexError("Auction is not active");
    }

    // Check if user already has a participation for this auction
    const existingParticipation = await ctx.db
      .query("autoBidParticipations")
      .withIndex("by_user_auction", (q) =>
        q.eq("userId", userId).eq("auctionId", args.auctionId),
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (existingParticipation) {
      throw new ConvexError("You are already auto bidding in this auction");
    }

    // Check if user has an active auto bid configuration
    const autoBid = await ctx.db
      .query("autoBids")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!autoBid) {
      throw new ConvexError("You don't have an active auto bid configuration");
    }

    // Get all active participations for this user
    const activeParticipations = await ctx.db
      .query("autoBidParticipations")
      .withIndex("by_user_auction", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Get the number of auctions won
    const auctionsWon = autoBid.auctionsWon || [];

    // Check if user has already won the maximum number of auctions
    if (auctionsWon.length >= autoBid.maxAuctions) {
      throw new ConvexError(
        `You have already won the maximum number of auctions (${autoBid.maxAuctions}). Cannot participate in more auctions.`,
      );
    }

    // Check if user has already reached the maximum number of active participations
    if (activeParticipations.length >= autoBid.maxAuctions) {
      throw new ConvexError(
        `Maximum number of auctions (${autoBid.maxAuctions}) reached. You are currently participating in ${activeParticipations.length} auctions.`,
      );
    }

    // Create a new participation for this auction
    const participationId = await ctx.db.insert("autoBidParticipations", {
      autoBidId: autoBid._id,
      auctionId: args.auctionId,
      userId,
      maxAmount: autoBid.maxAmount,
      isActive: true,
      createdAt: Date.now(),
    });

    // Update the auto bid to track participation and decrement remaining auctions
    const auctionsParticipated = autoBid.auctionsParticipated || [];
    auctionsParticipated.push(args.auctionId);

    // Calculate the correct remaining auctions based on actual participations
    const remainingAuctions = Math.max(
      0,
      autoBid.maxAuctions - activeParticipations.length - 1,
    );

    // Update the auto bid
    await ctx.db.patch(autoBid._id, {
      auctionsParticipated,
      remainingAuctions,
      // Keep auto bid active until they've won the maximum number of auctions
      isActive: true,
    });

    // Process participations for this auction to potentially place a bid immediately
    await processParticipationsForAuction(ctx, args.auctionId);

    return participationId;
  },
});

// Get the total number of active participations for the current user
export const getActiveParticipationsCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return 0;
    }

    // Count active participations
    const participations = await ctx.db
      .query("autoBidParticipations")
      .withIndex("by_user_auction", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return participations.length;
  },
});

// Fix inconsistencies in auto bid data (admin function)
export const fixAutoBidInconsistencies = mutation({
  args: {
    userId: v.optional(v.id("users")), // Optional: fix only for a specific user
  },
  handler: async (ctx, args) => {
    // Get all auto bids
    let autoBidsQuery = ctx.db.query("autoBids");

    // If userId is provided, filter by that user
    if (args.userId) {
      autoBidsQuery = autoBidsQuery.filter((q) =>
        q.eq(q.field("userId"), args.userId),
      );
    }

    const autoBids = await autoBidsQuery.collect();

    console.log(`Fixing inconsistencies for ${autoBids.length} auto bids`);

    const results = [];

    // Process each auto bid
    for (const autoBid of autoBids) {
      // Get all active participations for this user
      const activeParticipations = await ctx.db
        .query("autoBidParticipations")
        .withIndex("by_user_auction", (q) => q.eq("userId", autoBid.userId))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      // Calculate the correct remaining auctions
      const correctRemainingAuctions = Math.max(
        0,
        autoBid.maxAuctions - activeParticipations.length,
      );

      // Get the number of auctions won
      const auctionsWon = autoBid.auctionsWon || [];

      // Determine if the auto bid should be active
      // Auto bid should be active if the user hasn't won the maximum number of auctions
      const shouldBeActive = auctionsWon.length < autoBid.maxAuctions;

      // Check if there's an inconsistency
      if (
        autoBid.remainingAuctions !== correctRemainingAuctions ||
        autoBid.isActive !== shouldBeActive
      ) {
        console.log(
          `Fixing auto bid for user ${autoBid.userId}: ` +
            `remainingAuctions ${autoBid.remainingAuctions} -> ${correctRemainingAuctions}, ` +
            `isActive ${autoBid.isActive} -> ${shouldBeActive}, ` +
            `active participations: ${activeParticipations.length}, ` +
            `auctions won: ${auctionsWon.length}/${autoBid.maxAuctions}`,
        );

        // Update the auto bid
        await ctx.db.patch(autoBid._id, {
          remainingAuctions: correctRemainingAuctions,
          isActive: shouldBeActive,
        });

        results.push({
          userId: autoBid.userId,
          autoBidId: autoBid._id,
          oldRemainingAuctions: autoBid.remainingAuctions,
          newRemainingAuctions: correctRemainingAuctions,
          oldIsActive: autoBid.isActive,
          newIsActive: shouldBeActive,
          activeParticipations: activeParticipations.length,
          auctionsWon: auctionsWon.length,
          maxAuctions: autoBid.maxAuctions,
        });
      }
    }

    return results;
  },
});

// Optimize auto bid participations by canceling participations in auctions where the user is outbid
// and can't compete, and moving on to other available auctions
async function optimizeAutoBidParticipations(
  ctx: MutationCtx,
  userId: Id<"users">,
) {
  // Get the user's auto bid configuration
  const autoBid = await ctx.db
    .query("autoBids")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("isActive"), true))
    .first();

  if (!autoBid) {
    console.log(`No active auto bid found for user ${userId}`);
    return null;
  }

  // Get all participations for this user (both active and inactive)
  const allParticipations = await ctx.db
    .query("autoBidParticipations")
    .withIndex("by_user_auction", (q) => q.eq("userId", userId))
    .collect();

  // Get active participations
  const activeParticipations = allParticipations.filter((p) => p.isActive);

  if (activeParticipations.length === 0) {
    console.log(`No active participations found for user ${userId}`);
    return null;
  }

  // Get current time
  const now = Date.now();

  // Get all active auctions
  const activeAuctions = await ctx.db
    .query("auctions")
    .filter((q) =>
      q.and(q.lt(q.field("startTime"), now), q.gt(q.field("endTime"), now)),
    )
    .collect();

  // Create a map of auction IDs to auctions for quick lookup
  const auctionMap = new Map();
  for (const auction of activeAuctions) {
    auctionMap.set(auction._id.toString(), auction);
  }

  // Create a map of auction IDs to participations for quick lookup
  const participationMap = new Map();
  for (const participation of allParticipations) {
    participationMap.set(participation.auctionId.toString(), participation);
  }

  // Evaluate each participation to determine if it's competitive
  const participationsToKeep = [];
  const participationsToCancel = [];

  for (const participation of activeParticipations) {
    const auction = auctionMap.get(participation.auctionId.toString());

    // Skip if auction not found or not active
    if (!auction) continue;

    // Calculate the next valid bid amount
    const minIncrement = auction.bidIncrementMinimum || 1;
    const nextBidAmount = auction.currentPrice + minIncrement;

    // Check if this participation can afford the next bid
    if (participation.maxAmount < nextBidAmount) {
      // This participation can't afford the next bid, mark for cancellation
      participationsToCancel.push(participation);
    } else {
      // This participation can afford the next bid, keep it
      participationsToKeep.push(participation);
    }
  }

  // If we have fewer participations to keep than the max auctions,
  // we can cancel some participations and look for better auctions
  if (
    participationsToKeep.length < autoBid.maxAuctions &&
    participationsToCancel.length > 0
  ) {
    console.log(
      `User ${userId} has ${participationsToKeep.length} competitive participations and ${participationsToCancel.length} non-competitive participations`,
    );

    // Delete non-competitive participations
    for (const participation of participationsToCancel) {
      // Remove this auction from the participated list if it exists
      let auctionsParticipated = autoBid.auctionsParticipated || [];
      auctionsParticipated = auctionsParticipated.filter(
        (id) => id.toString() !== participation.auctionId.toString(),
      );

      // Update the auto bid's auctionsParticipated list
      await ctx.db.patch(autoBid._id, {
        auctionsParticipated,
      });

      // Delete the participation
      await ctx.db.delete(participation._id);

      console.log(
        `Deleted non-competitive participation for user ${userId} in auction ${participation.auctionId}`,
      );
    }

    // Update the auto bid's remaining auctions count
    const remainingAuctions = Math.min(
      autoBid.maxAuctions,
      autoBid.maxAuctions - participationsToKeep.length,
    );

    await ctx.db.patch(autoBid._id, {
      remainingAuctions,
      isActive: true,
    });

    console.log(
      `Updated auto bid for user ${userId}. Remaining auctions: ${remainingAuctions}`,
    );

    // Find new auctions to participate in
    const participatingAuctionIds = new Set(
      [...participationsToKeep].map((p) => p.auctionId.toString()),
    );

    const availableAuctions = activeAuctions.filter(
      (auction) => !participatingAuctionIds.has(auction._id.toString()),
    );

    // Sort available auctions by current price (lowest first)
    availableAuctions.sort((a, b) => a.currentPrice - b.currentPrice);

    // Calculate how many new auctions we can participate in
    const slotsAvailable = autoBid.maxAuctions - participationsToKeep.length;
    const auctionsToJoin = availableAuctions.slice(0, slotsAvailable);

    console.log(
      `User ${userId} can join ${auctionsToJoin.length} new auctions`,
    );

    let newParticipationsCount = 0;
    let reactivatedCount = 0;

    // Create or reactivate participations for these auctions
    for (const auction of auctionsToJoin) {
      // Skip if the user can't afford the minimum bid
      if (autoBid.maxAmount < auction.currentPrice) continue;

      // Check if we already have a participation for this auction (active or inactive)
      const existingParticipation = participationMap.get(
        auction._id.toString(),
      );

      if (existingParticipation) {
        // Reactivate the existing participation
        await ctx.db.patch(existingParticipation._id, {
          isActive: true,
          maxAmount: autoBid.maxAmount, // Update with current max amount
        });

        reactivatedCount++;

        console.log(
          `Reactivated existing participation for user ${userId} in auction ${auction._id}`,
        );
      } else {
        // Create a new participation
        await ctx.db.insert("autoBidParticipations", {
          autoBidId: autoBid._id,
          auctionId: auction._id,
          userId,
          maxAmount: autoBid.maxAmount,
          isActive: true,
          createdAt: Date.now(),
        });

        newParticipationsCount++;

        console.log(
          `Created new participation for user ${userId} in auction ${auction._id}`,
        );
      }

      // Update the auto bid to track participation if it's a new auction
      if (!existingParticipation) {
        const auctionsParticipated = autoBid.auctionsParticipated || [];
        auctionsParticipated.push(auction._id);

        await ctx.db.patch(autoBid._id, {
          auctionsParticipated,
        });
      }

      // Process this auction immediately to try to place a bid
      await processParticipationsForAuction(ctx, auction._id);
    }

    // Update the auto bid's remaining auctions count again
    const finalRemainingAuctions = Math.max(
      0,
      autoBid.maxAuctions - participationsToKeep.length - auctionsToJoin.length,
    );

    await ctx.db.patch(autoBid._id, {
      remainingAuctions: finalRemainingAuctions,
    });

    return {
      canceledCount: participationsToCancel.length,
      newParticipationsCount,
      reactivatedCount,
    };
  }

  return null;
}

// Optimize auto bid participations for the current user
export const optimizeMyAutoBidParticipations = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be logged in to optimize auto bids");
    }

    const result = await optimizeAutoBidParticipations(ctx, userId);

    if (!result) {
      return {
        success: false,
        message: "No optimizations were needed or possible",
      };
    }

    return {
      success: true,
      canceledCount: result.canceledCount,
      newParticipationsCount: result.newParticipationsCount,
      reactivatedCount: result.reactivatedCount,
      message: `Canceled ${result.canceledCount} non-competitive participations, joined ${result.newParticipationsCount} new auctions, and reactivated ${result.reactivatedCount} existing participations`,
    };
  },
});
