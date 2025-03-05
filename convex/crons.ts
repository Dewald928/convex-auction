import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Process auto bids for active auctions every minute
crons.interval(
  "process-auto-bids",
  { minutes: 1 },
  internal.autoBids.processActiveAuctions,
  {},
);

// Process ended auctions (existing cron job if any)
// Add any other cron jobs here

export default crons;
