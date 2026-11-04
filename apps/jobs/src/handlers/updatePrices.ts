import type { Context, ScheduledEvent } from "aws-lambda";
import { recoverHistoricalPrices } from "../services/priceRecoveryService";
import { retryHistoricalPriceGaps } from "../repositories/priceAcquisitionRepository";
import { completedSnapshotDate } from "../services/snapshotRepairService";
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
  recoverHistoricalPrices?: typeof recoverHistoricalPrices;
  retryHistoricalPriceGaps?: typeof retryHistoricalPriceGaps;
}

export function createUpdatePricesHandler(
  dependencies: UpdatePricesHandlerDependencies = { ingestLatestInstrumentPrices, recoverHistoricalPrices, retryHistoricalPriceGaps }
): (event?: MarketDataJobEvent, context?: Pick<Context, "getRemainingTimeInMillis">) => Promise<void> {
  return async (event: MarketDataJobEvent = {}, context?: Pick<Context, "getRemainingTimeInMillis">): Promise<void> => {
    const eventId = event.id ?? event.triggerRequestId ?? "manual";
    const eventTime = event.time ?? new Date().toISOString();

    logScheduledJob({
      jobName: UPDATE_PRICES_JOB_NAME,
      eventId,
      eventTime,
      status: "started"
    });

    try {
      const acquisition = await Promise.allSettled([dependencies.ingestLatestInstrumentPrices({
        triggerSource: event.triggerSource,
        triggeredByUserId: event.triggeredByUserId,
        triggerRequestId: event.triggerRequestId
      })]);
      if (event.triggerSource === "manual") await dependencies.retryHistoricalPriceGaps?.();
      const coverage = await dependencies.recoverHistoricalPrices?.({ throughDate: completedSnapshotDate(eventTime),
        budgetMs: Math.max(0, Math.min(30000, (context?.getRemainingTimeInMillis() ?? 40000) - 10000)) });
      if (coverage) console.log("Historical price recovery coverage.", coverage);
      if (acquisition[0].status === "rejected") throw acquisition[0].reason;
      const result = acquisition[0].value;
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
