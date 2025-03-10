import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
// NOTE: this is only a mock evironment, so it won't make db entries
test("Create auctions", async () => {
  const t = convexTest(schema);
  const asAdmin = t.withIdentity({
    name: "brood",
  });
  const result = await asAdmin.mutation(api.auctions.createAuction, {
    title: "Test Auction",
    description: "Test Description",
    startingPrice: 10,
    startTime: Date.now() + 1000 * 60,
    endTime: Date.now() + 1000 * 60 * 10,
    bidIncrementMinimum: 1,
    numberOfAuctions: 10,
    separationTimeInMinutes: 0,
  });
  expect(result).toBeDefined();
});
