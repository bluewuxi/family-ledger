import type { ScheduledEvent } from "aws-lambda";
import {
  FUNDROCK_PRICE_JOB_NAME,
  ingestLatestFundRockPieUnitPrices,
  type FundRockPriceIngestionResult
} from "../services/fundRockPriceIngestionService";
import { logScheduledJob, sanitizeScheduledJobError } from "../utils/scheduledJobLogging";

export interface UpdatePricesHandlerDependencies {
  ingestLatestFundRockPieUnitPrices: () => Promise<FundRockPriceIngestionResult>;
}

export function createUpdatePricesHandler(
  dependencies: UpdatePricesHandlerDependencies = { ingestLatestFundRockPieUnitPrices }
): (event: ScheduledEvent) => Promise<void> {
  return async (event: ScheduledEvent): Promise<void> => {
    logScheduledJob({
      jobName: FUNDROCK_PRICE_JOB_NAME,
      eventId: event.id,
      eventTime: event.time,
      status: "started"
    });

    try {
      const result = await dependencies.ingestLatestFundRockPieUnitPrices();
      logScheduledJob({
        jobName: FUNDROCK_PRICE_JOB_NAME,
        eventId: event.id,
        eventTime: event.time,
        status: "succeeded",
        jobRunId: result.jobRun.id,
        recordsInserted: result.recordsInserted,
        recordsSkipped: result.recordsSkipped
      });
    } catch (error) {
      logScheduledJob({
        jobName: FUNDROCK_PRICE_JOB_NAME,
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
