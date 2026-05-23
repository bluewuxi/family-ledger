import type { ScheduledEvent } from "aws-lambda";
import {
  ingestLatestInstrumentPrices,
  UPDATE_PRICES_JOB_NAME,
  type InstrumentPriceIngestionResult
} from "../services/instrumentPriceIngestionService";
import { logScheduledJob, sanitizeScheduledJobError } from "../utils/scheduledJobLogging";

export interface UpdatePricesHandlerDependencies {
  ingestLatestInstrumentPrices: () => Promise<InstrumentPriceIngestionResult>;
}

export function createUpdatePricesHandler(
  dependencies: UpdatePricesHandlerDependencies = { ingestLatestInstrumentPrices }
): (event: ScheduledEvent) => Promise<void> {
  return async (event: ScheduledEvent): Promise<void> => {
    logScheduledJob({
      jobName: UPDATE_PRICES_JOB_NAME,
      eventId: event.id,
      eventTime: event.time,
      status: "started"
    });

    try {
      const result = await dependencies.ingestLatestInstrumentPrices();
      logScheduledJob({
        jobName: UPDATE_PRICES_JOB_NAME,
        eventId: event.id,
        eventTime: event.time,
        status: "succeeded",
        jobRunId: result.jobRun.id,
        recordsInserted: result.recordsInserted,
        recordsSkipped: result.recordsSkipped
      });
    } catch (error) {
      logScheduledJob({
        jobName: UPDATE_PRICES_JOB_NAME,
        eventId: event.id,
        eventTime: event.time,
        status: "failed",
        errorMessage: sanitizeScheduledJobError(error)
      });
      throw error;
    }
  };
}

export const handler = createUpdatePricesHandler();
