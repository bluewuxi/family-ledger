import type { Context, ScheduledEvent } from "aws-lambda";
import { assertCompletedSnapshotDate, completedSnapshotDate, maintainPortfolioSnapshots } from "../services/snapshotRepairService";
import {
  generatePortfolioSnapshot,
  GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME,
  type GeneratePortfolioSnapshotResult
} from "../services/portfolioSnapshotGenerationService";
import { logScheduledJob, sanitizeScheduledJobError } from "../utils/scheduledJobLogging";

interface PortfolioSnapshotEventDetail {
  snapshotDate?: string;
  catchupFrom?: string;
}

export interface GeneratePortfolioSnapshotsHandlerDependencies {
  maintain?: typeof maintainPortfolioSnapshots;
  generatePortfolioSnapshot: (input: {
    snapshotDate: string;
    startedAt?: string;
  }) => Promise<GeneratePortfolioSnapshotResult>;
}

export function createGeneratePortfolioSnapshotsHandler(
  dependencies: GeneratePortfolioSnapshotsHandlerDependencies = { generatePortfolioSnapshot, maintain: maintainPortfolioSnapshots }
): (event?: Partial<ScheduledEvent<PortfolioSnapshotEventDetail>>, context?: Pick<Context,"getRemainingTimeInMillis">) => Promise<void> {
  return async (event: Partial<ScheduledEvent<PortfolioSnapshotEventDetail>> = {}, context?: Pick<Context,"getRemainingTimeInMillis">): Promise<void> => {
    const eventTime = event.time ?? new Date().toISOString();
    const snapshotDate = event.detail?.snapshotDate ?? completedSnapshotDate(eventTime);

    logScheduledJob({
      jobName: GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME,
      eventId: event.id ?? "schedule",
      eventTime,
      status: "started"
    });

    try {
      assertCompletedSnapshotDate(snapshotDate,completedSnapshotDate(eventTime));
      if (!event.detail?.snapshotDate && dependencies.maintain) {
        const count = await dependencies.maintain({eventTime,catchupFrom: event.detail?.catchupFrom,budgetMs: Math.max(0,Math.min(240000,(context?.getRemainingTimeInMillis() ?? 250000)-10000))});
        logScheduledJob({jobName: GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME,eventId: event.id ?? "schedule",eventTime,status: "succeeded",recordsInserted: count,recordsSkipped: 0});
        return;
      }
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
