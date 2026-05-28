import type { ScheduledEvent } from "aws-lambda";
import {
  ingestLatestInstrumentPrices,
  UPDATE_PRICES_JOB_NAME,
  type IngestLatestInstrumentPricesOptions,
  type InstrumentPriceIngestionResult
} from "../services/instrumentPriceIngestionService";
import { logScheduledJob, sanitizeScheduledJobError } from "../utils/scheduledJobLogging";

interface MarketDataJobEvent extends Partial<ScheduledEvent> {
  triggerSource?: IngestLatestInstrumentPricesOptions["triggerSource"];
  triggeredByUserId?: string | null;
  triggerRequestId?: string | null;
}

export interface UpdatePricesHandlerDependencies {
  ingestLatestInstrumentPrices: (options?: IngestLatestInstrumentPricesOptions) => Promise<InstrumentPriceIngestionResult>;
}

export function createUpdatePricesHandler(
  dependencies: UpdatePricesHandlerDependencies = { ingestLatestInstrumentPrices }
): (event?: MarketDataJobEvent) => Promise<void> {
  return async (event: MarketDataJobEvent = {}): Promise<void> => {
    const eventId = event.id ?? event.triggerRequestId ?? "manual";
    const eventTime = event.time ?? new Date().toISOString();

    logScheduledJob({
      jobName: UPDATE_PRICES_JOB_NAME,
      eventId,
      eventTime,
      status: "started"
    });

    try {
      const result = await dependencies.ingestLatestInstrumentPrices({
        triggerSource: event.triggerSource,
        triggeredByUserId: event.triggeredByUserId,
        triggerRequestId: event.triggerRequestId
      });
      logScheduledJob({
        jobName: UPDATE_PRICES_JOB_NAME,
        eventId,
        eventTime,
        status: "succeeded",
        jobRunId: result.jobRun.id,
        recordsInserted: result.recordsInserted,
        recordsSkipped: result.recordsSkipped
      });
    } catch (error) {
      logScheduledJob({
        jobName: UPDATE_PRICES_JOB_NAME,
        eventId,
        eventTime,
        status: "failed",
        errorMessage: sanitizeScheduledJobError(error)
      });
      throw error;
    }
  };
}

export const handler = createUpdatePricesHandler();
