import type { ScheduledEvent } from "aws-lambda";
import { getLedgerBackupConfig } from "../config/backupConfig";
import {
  backupLedgerData,
  BACKUP_LEDGER_JOB_NAME,
  type BackupLedgerDataResult,
  type BackupLedgerDataOptions
} from "../services/ledgerBackupService";
import { logScheduledJob, sanitizeScheduledJobError } from "../utils/scheduledJobLogging";

type BackupLedgerDataEvent = Partial<ScheduledEvent>;

export interface BackupLedgerDataHandlerDependencies {
  backupLedgerData: (options: Pick<BackupLedgerDataOptions, "environmentName" | "bucketName" | "startedAt">) => Promise<BackupLedgerDataResult>;
  getLedgerBackupConfig: () => { environmentName: string; bucketName: string };
}

export function createBackupLedgerDataHandler(
  dependencies: BackupLedgerDataHandlerDependencies = { backupLedgerData, getLedgerBackupConfig }
): (event?: BackupLedgerDataEvent) => Promise<void> {
  return async (event: BackupLedgerDataEvent = {}): Promise<void> => {
    const eventTime = event.time ?? new Date().toISOString();
    const eventId = event.id ?? "schedule";
    const config = dependencies.getLedgerBackupConfig();

    logScheduledJob({
      jobName: BACKUP_LEDGER_JOB_NAME,
      eventId,
      eventTime,
      status: "started"
    });

    try {
      const result = await dependencies.backupLedgerData({
        environmentName: config.environmentName,
        bucketName: config.bucketName,
        startedAt: eventTime
      });
      logScheduledJob({
        jobName: BACKUP_LEDGER_JOB_NAME,
        eventId,
        eventTime,
        status: "succeeded",
        jobRunId: result.jobRun.id,
        recordsInserted: result.totalRows,
        recordsSkipped: 0
      });
    } catch (error) {
      logScheduledJob({
        jobName: BACKUP_LEDGER_JOB_NAME,
        eventId,
        eventTime,
        status: "failed",
        errorMessage: sanitizeScheduledJobError(error)
      });
      throw error;
    }
  };
}

export const handler = createBackupLedgerDataHandler();
