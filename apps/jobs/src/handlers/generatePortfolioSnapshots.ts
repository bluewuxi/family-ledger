import type { ScheduledEvent } from "aws-lambda";
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
): (event: ScheduledEvent<PortfolioSnapshotEventDetail>) => Promise<void> {
  return async (event: ScheduledEvent<PortfolioSnapshotEventDetail>): Promise<void> => {
    const snapshotDate = event.detail?.snapshotDate ?? event.time.slice(0, 10);

    logScheduledJob({
      jobName: GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME,
      eventId: event.id,
      eventTime: event.time,
      status: "started"
    });

    try {
      const result = await dependencies.generatePortfolioSnapshot({
        snapshotDate,
        startedAt: event.time
      });
      logScheduledJob({
        jobName: GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME,
        eventId: event.id,
        eventTime: event.time,
        status: "succeeded",
        jobRunId: result.jobRun.id,
        recordsInserted: result.accountsWritten + 1,
        recordsSkipped: 0
      });
    } catch (error) {
      logScheduledJob({
        jobName: GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME,
        eventId: event.id,
        eventTime: event.time,
        status: "failed",
        errorMessage: sanitizeScheduledJobError(error)
      });
      throw error;
    }
  };
}

export const handler = createGeneratePortfolioSnapshotsHandler();
