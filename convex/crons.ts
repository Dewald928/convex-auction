import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run the auto-bid processor every minute
crons.interval(
  "process-autobids",
  { minutes: 1 },
  internal.autobids.processAutoBids,
  {},
);

export default crons;
