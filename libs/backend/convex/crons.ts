import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// Runs at the top of every UTC hour. Midnight in a whole-hour timezone such as Europe/Berlin
// always falls on a full UTC hour, so the day turns over on time. Each run also catches up
// whatever an interruption left undone. Half-hour timezones would need "*/15 * * * *".
crons.hourly(
  "local calendar and scheduled task catch-up",
  { minuteUTC: 0 },
  internal.scheduling.tick,
);
export default crons;
