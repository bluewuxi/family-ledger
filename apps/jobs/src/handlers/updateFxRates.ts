import type { ScheduledEvent } from "aws-lambda";
import {
  FRANKFURTER_FX_JOB_NAME,
  ingestLatestFrankfurterFxRates,
  type FxRateIngestionResult
} from "../services/fxRateIngestionService";
import { logScheduledJob, sanitizeScheduledJobError } from "../utils/scheduledJobLogging";

export interface UpdateFxRatesHandlerDependencies {
  ingestLatestFrankfurterFxRates: () => Promise<FxRateIngestionResult>;
}

export function createUpdateFxRatesHandler(
  dependencies: UpdateFxRatesHandlerDependencies = { ingestLatestFrankfurterFxRates }
): (event: ScheduledEvent) => Promise<void> {
  return async (event: ScheduledEvent): Promise<void> => {
    logScheduledJob({
      jobName: FRANKFURTER_FX_JOB_NAME,
      eventId: event.id,
      eventTime: event.time,
      status: "started"
    });

    try {
      const result = await dependencies.ingestLatestFrankfurterFxRates();
      logScheduledJob({
        jobName: FRANKFURTER_FX_JOB_NAME,
        eventId: event.id,
        eventTime: event.time,
        status: "succeeded",
        jobRunId: result.jobRun.id,
        recordsInserted: result.recordsInserted,
        recordsSkipped: result.recordsSkipped
      });
    } catch (error) {
      logScheduledJob({
        jobName: FRANKFURTER_FX_JOB_NAME,
        eventId: event.id,
        eventTime: event.time,
        status: "failed",
        errorMessage: sanitizeScheduledJobError(error)
      });
      throw error;
    }
  };
}

export const handler = createUpdateFxRatesHandler();
