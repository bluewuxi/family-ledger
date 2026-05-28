import type { ScheduledEvent } from "aws-lambda";
import {
  FRANKFURTER_FX_JOB_NAME,
  ingestLatestFrankfurterFxRates,
  type IngestLatestFrankfurterFxRatesOptions,
  type FxRateIngestionResult
} from "../services/fxRateIngestionService";
import { logScheduledJob, sanitizeScheduledJobError } from "../utils/scheduledJobLogging";

interface MarketDataJobEvent extends Partial<ScheduledEvent> {
  triggerSource?: IngestLatestFrankfurterFxRatesOptions["triggerSource"];
  triggeredByUserId?: string | null;
  triggerRequestId?: string | null;
  rateDate?: string;
}

export interface UpdateFxRatesHandlerDependencies {
  ingestLatestFrankfurterFxRates: (options?: IngestLatestFrankfurterFxRatesOptions) => Promise<FxRateIngestionResult>;
}

export function createUpdateFxRatesHandler(
  dependencies: UpdateFxRatesHandlerDependencies = { ingestLatestFrankfurterFxRates }
): (event?: MarketDataJobEvent) => Promise<void> {
  return async (event: MarketDataJobEvent = {}): Promise<void> => {
    const eventId = event.id ?? event.triggerRequestId ?? "manual";
    const eventTime = event.time ?? new Date().toISOString();

    logScheduledJob({
      jobName: FRANKFURTER_FX_JOB_NAME,
      eventId,
      eventTime,
      status: "started"
    });

    try {
      const result = await dependencies.ingestLatestFrankfurterFxRates({
        triggerSource: event.triggerSource,
        triggeredByUserId: event.triggeredByUserId,
        triggerRequestId: event.triggerRequestId,
        rateDate: event.rateDate
      });
      logScheduledJob({
        jobName: FRANKFURTER_FX_JOB_NAME,
        eventId,
        eventTime,
        status: "succeeded",
        jobRunId: result.jobRun.id,
        recordsInserted: result.recordsInserted,
        recordsSkipped: result.recordsSkipped
      });
    } catch (error) {
      logScheduledJob({
        jobName: FRANKFURTER_FX_JOB_NAME,
        eventId,
        eventTime,
        status: "failed",
        errorMessage: sanitizeScheduledJobError(error)
      });
      throw error;
    }
  };
}

export const handler = createUpdateFxRatesHandler();
