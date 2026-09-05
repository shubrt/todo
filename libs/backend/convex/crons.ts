import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// Frequent UTC polling follows the owner's local calendar and catches up after interruptions.
crons.interval(
  "local calendar and scheduled task catch-up",
  { minutes: 1 },
  internal.scheduling.tick,
);
export default crons;
