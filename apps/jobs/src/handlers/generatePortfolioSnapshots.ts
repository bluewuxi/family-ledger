import type { ScheduledEvent } from "aws-lambda";
import { getAppBusinessDate } from "@family-ledger/shared";
import {
  generatePortfolioSnapshot,
  GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME,
  type GeneratePortfolioSnapshotResult
} from "../services/portfolioSnapshotGenerationService";
import { logScheduledJob, sanitizeScheduledJobError } from "../utils/scheduledJobLogging";

interface PortfolioSnapshotEventDetail {
  snapshotDate?: string;
}

export interface GeneratePortfolioSnapshotsHandlerDependencies {
  generatePortfolioSnapshot: (input: {
    snapshotDate: string;
    startedAt?: string;
  }) => Promise<GeneratePortfolioSnapshotResult>;
}

export function createGeneratePortfolioSnapshotsHandler(
  dependencies: GeneratePortfolioSnapshotsHandlerDependencies = { generatePortfolioSnapshot }
): (event?: Partial<ScheduledEvent<PortfolioSnapshotEventDetail>>) => Promise<void> {
  return async (event: Partial<ScheduledEvent<PortfolioSnapshotEventDetail>> = {}): Promise<void> => {
    const eventTime = event.time ?? new Date().toISOString();
    const snapshotDate = event.detail?.snapshotDate ?? getCompletedSnapshotDate(eventTime);

    logScheduledJob({
      jobName: GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME,
      eventId: event.id ?? "schedule",
      eventTime,
      status: "started"
    });

    try {
      const result = await dependencies.generatePortfolioSnapshot({
        snapshotDate,
        startedAt: eventTime
      });
      logScheduledJob({
        jobName: GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME,
        eventId: event.id ?? "schedule",
        eventTime,
        status: "succeeded",
        jobRunId: result.jobRun.id,
        recordsInserted: result.accountsWritten + 1,
        recordsSkipped: 0
      });
    } catch (error) {
      logScheduledJob({
        jobName: GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME,
        eventId: event.id ?? "schedule",
        eventTime,
        status: "failed",
        errorMessage: sanitizeScheduledJobError(error)
      });
      throw error;
    }
  };
}

export const handler = createGeneratePortfolioSnapshotsHandler();

function getCompletedSnapshotDate(eventTime: string): string {
  const scheduledInstant = new Date(eventTime);

  if (Number.isNaN(scheduledInstant.getTime())) {
    throw new Error("Scheduled event time must be a valid ISO timestamp.");
  }

  return getAppBusinessDate(new Date(scheduledInstant.getTime() - 24 * 60 * 60 * 1000));
}
