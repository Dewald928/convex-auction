import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Get coupons for a specific user
export const getMyCoupons = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("You must be logged in to view your coupons");
    }

    // Find all coupon bundles where this user is the winner
    const couponBundles = await ctx.db
      .query("couponBundles")
      .filter((q) => q.eq(q.field("winnerId"), userId))
      .collect();

    // For each bundle, get the coupons
    const bundleResults = await Promise.all(
      couponBundles.map(async (bundle) => {
        const coupons = await ctx.db
          .query("coupons")
          .withIndex("by_bundle", (q) => q.eq("bundleId", bundle._id))
          .collect();

        // Get auction details
        const auction = await ctx.db.get(bundle.auctionId);

        return {
          bundle,
          coupons,
          auction: auction
            ? {
                title: auction.title,
                auctionId: auction._id,
              }
            : null,
        };
      }),
    );

    // Find all coupons directly owned by this user (that aren't part of the bundles we already got)
    const individualCoupons = await ctx.db
      .query("coupons")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();

    // Filter out coupons that are already part of the bundles we processed
    const bundleCouponIds = new Set();
    bundleResults.forEach((result) => {
      result.coupons.forEach((coupon) => {
        bundleCouponIds.add(coupon._id);
      });
    });

    const individualResults = [];
    for (const coupon of individualCoupons) {
      // Skip if we already have this coupon from a bundle
      if (bundleCouponIds.has(coupon._id)) {
        continue;
      }

      // Get the bundle and auction for context
      const bundle = await ctx.db.get(coupon.bundleId);
      if (!bundle) continue;

      const auction = await ctx.db.get(bundle.auctionId);

      individualResults.push({
        bundle,
        coupons: [coupon],
        auction: auction
          ? {
              title: auction.title,
              auctionId: auction._id,
            }
          : null,
      });
    }

    // Combine both result sets
    return [...bundleResults, ...individualResults];
  },
});

// Redeem a coupon
export const redeemCoupon = mutation({
  args: {
    couponId: v.id("coupons"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("You must be logged in to redeem a coupon");
    }

    // Get the coupon
    const coupon = await ctx.db.get(args.couponId);
    if (!coupon) {
      throw new Error("Coupon not found");
    }

    // Check if already redeemed
    if (coupon.isRedeemed) {
      throw new Error("This coupon has already been redeemed");
    }

    // Verify that this user owns the coupon, either directly or via the bundle
    if (coupon.ownerId !== userId) {
      // If not directly owned, check bundle ownership
      const bundle = await ctx.db.get(coupon.bundleId);
      if (!bundle) {
        throw new Error("Coupon bundle not found");
      }

      // Verify that this user owns the bundle
      if (bundle.winnerId !== userId) {
        throw new Error("You do not own this coupon");
      }
    }

    // Get the bundle to get the auction ID for the code
    const bundle = await ctx.db.get(coupon.bundleId);
    if (!bundle) {
      throw new Error("Coupon bundle not found");
    }

    // Generate a unique redemption code
    const randomSuffix = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
    const code = `COUPON-${bundle.auctionId.slice(-6)}-${randomSuffix}`;

    // Mark as redeemed and set the code
    await ctx.db.patch(args.couponId, {
      code,
      isRedeemed: true,
      redeemedBy: userId,
      redeemedAt: Date.now(),
    });

    return {
      success: true,
      message: "Coupon redeemed successfully",
      code,
    };
  },
});

// Transfer ownership of a coupon to another user
export const transferCoupon = mutation({
  args: {
    couponId: v.id("coupons"),
    recipientId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("You must be logged in to transfer a coupon");
    }

    // Get the coupon
    const coupon = await ctx.db.get(args.couponId);
    if (!coupon) {
      throw new Error("Coupon not found");
    }

    // Check if already redeemed
    if (coupon.isRedeemed) {
      throw new Error("Redeemed coupons cannot be transferred");
    }

    // Verify that this user owns the coupon, either directly or via the bundle
    if (coupon.ownerId !== userId) {
      // If not directly owned, check bundle ownership
      const bundle = await ctx.db.get(coupon.bundleId);
      if (!bundle) {
        throw new Error("Coupon bundle not found");
      }

      // Verify that this user owns the bundle
      if (bundle.winnerId !== userId) {
        throw new Error("You do not own this coupon");
      }
    }

    // Verify recipient exists
    const recipient = await ctx.db.get(args.recipientId);
    if (!recipient) {
      throw new Error("Recipient not found");
    }

    // Transfer ownership
    await ctx.db.patch(args.couponId, {
      ownerId: args.recipientId,
    });

    return {
      success: true,
      message: "Coupon transferred successfully",
    };
  },
});
