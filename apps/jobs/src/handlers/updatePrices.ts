import type { ScheduledEvent } from "aws-lambda";
import { logScheduledJob } from "../utils/scheduledJobLogging";

const UPDATE_PRICES_JOB_NAME = "update-prices";

export async function handler(event: ScheduledEvent): Promise<void> {
  // TODO: Stage 4 will update US/HK/CN/NZ instrument prices.
  logScheduledJob({
    jobName: UPDATE_PRICES_JOB_NAME,
    eventId: event.id,
    eventTime: event.time,
    status: "not_implemented"
  });
}
