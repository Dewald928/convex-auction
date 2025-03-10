import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Get the current authenticated user
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    return await ctx.db.get(userId);
  },
});

export const createTestUsers = internalMutation({
  args: {
    count: v.number(),
  },
  handler: async (ctx, args) => {
    const users = [];

    for (let i = 0; i < args.count; i++) {
      const user = await ctx.db.insert("users", {
        email: `test${i}@test.com`,
        name: `Test User ${i}`,
      });
      users.push(user);
    }
    console.log(`users: ${users}`);
    return users;
  },
});
