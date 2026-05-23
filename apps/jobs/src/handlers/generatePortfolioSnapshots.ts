import type { ScheduledEvent } from "aws-lambda";
import { logScheduledJob } from "../utils/scheduledJobLogging";

const GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME = "generate-portfolio-snapshots";

export async function handler(event: ScheduledEvent): Promise<void> {
  // TODO: Stage 4 will calculate daily portfolio values.
  logScheduledJob({
    jobName: GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME,
    eventId: event.id,
    eventTime: event.time,
    status: "not_implemented"
  });
}
