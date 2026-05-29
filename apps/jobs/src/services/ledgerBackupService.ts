import type { JobRun } from "@family-ledger/shared";
import {
  createJobRun as defaultCreateJobRun,
  finishJobRun as defaultFinishJobRun,
  listStartedJobRuns as defaultListStartedJobRuns
} from "../repositories/jobRunRepository";
import {
  exportLedgerTables as defaultExportLedgerTables,
  type LedgerBackupRows
} from "../repositories/ledgerBackupRepository";
import { putLedgerBackupObject as defaultPutLedgerBackupObject } from "../storage/ledgerBackupStorage";
import { BACKUP_BLOCKING_JOB_NAMES } from "./backupBlockingJobs";
import { createLedgerBackupObject, type LedgerBackupManifest } from "./ledgerBackupBundle";

export const BACKUP_LEDGER_JOB_NAME = "backup-ledger-data";
export const BACKUP_BLOCKED_BY_RUNNING_JOB_CODE = "BACKUP_BLOCKED_BY_RUNNING_JOB";
export const BACKUP_BLOCKING_JOB_STALE_AFTER_MS = 60 * 60 * 1000;

interface JobRunRepository {
  createJobRun(input: { jobName: string; jobStartedAt: string }): Promise<JobRun>;
  finishJobRun(
    id: string,
    input: {
      status: "succeeded" | "failed";
      finishedAt: string;
      recordsInserted?: number;
      recordsSkipped?: number;
      errorMessage?: string | null;
    }
  ): Promise<JobRun>;
  listStartedJobRuns(jobNames: readonly string[], options?: { startedBefore?: string; startedAfter?: string }): Promise<JobRun[]>;
}

interface LedgerBackupRepository {
  exportLedgerTables(input?: { excludedJobRunId?: string | null }): Promise<LedgerBackupRows>;
}

interface LedgerBackupStorage {
  putLedgerBackupObject(input: {
    bucketName: string;
    key: string;
    body: Buffer;
    contentSha256: string;
    manifest: LedgerBackupManifest;
  }): Promise<void>;
}

export interface BackupLedgerDataOptions {
  environmentName: string;
  bucketName: string;
  startedAt?: string;
  now?: () => Date;
  blockingJobNames?: readonly string[];
  blockingJobStaleAfterMs?: number;
  jobRunRepository?: JobRunRepository;
  ledgerBackupRepository?: LedgerBackupRepository;
  ledgerBackupStorage?: LedgerBackupStorage;
}

export interface BackupLedgerDataResult {
  jobRun: JobRun;
  bucketName: string;
  objectKey: string;
  generatedAt: string;
  totalRows: number;
  contentSha256: string;
}

export class BackupBlockedByRunningJobError extends Error {
  readonly blockingJobRuns: JobRun[];

  constructor(blockingJobRuns: JobRun[]) {
    super(
      `${BACKUP_BLOCKED_BY_RUNNING_JOB_CODE}: ${blockingJobRuns
        .map((run) => `${run.jobName}:${run.id}`)
        .join(", ")}`
    );
    this.name = "BackupBlockedByRunningJobError";
    this.blockingJobRuns = blockingJobRuns;
  }
}

export async function backupLedgerData(options: BackupLedgerDataOptions): Promise<BackupLedgerDataResult> {
  const now = options.now ?? (() => new Date());
  const startedAt = options.startedAt ?? now().toISOString();
  const jobRunRepository = options.jobRunRepository ?? {
    createJobRun: defaultCreateJobRun,
    finishJobRun: defaultFinishJobRun,
    listStartedJobRuns: defaultListStartedJobRuns
  };
  const ledgerBackupRepository = options.ledgerBackupRepository ?? {
    exportLedgerTables: defaultExportLedgerTables
  };
  const ledgerBackupStorage = options.ledgerBackupStorage ?? {
    putLedgerBackupObject: defaultPutLedgerBackupObject
  };
  const jobRun = await jobRunRepository.createJobRun({
    jobName: BACKUP_LEDGER_JOB_NAME,
    jobStartedAt: startedAt
  });

  try {
    const blockingJobNames = options.blockingJobNames ?? BACKUP_BLOCKING_JOB_NAMES;
    const blockingJobStaleAfterMs = options.blockingJobStaleAfterMs ?? BACKUP_BLOCKING_JOB_STALE_AFTER_MS;
    await assertNoRunningBlockingJobs(jobRunRepository, blockingJobNames, startedAt, blockingJobStaleAfterMs);
    const rows = await ledgerBackupRepository.exportLedgerTables({ excludedJobRunId: jobRun.id });
    await assertNoRunningBlockingJobs(jobRunRepository, blockingJobNames, now().toISOString(), blockingJobStaleAfterMs);
    const backupObject = createLedgerBackupObject({
      environment: options.environmentName,
      generatedAt: startedAt,
      rows
    });

    await ledgerBackupStorage.putLedgerBackupObject({
      bucketName: options.bucketName,
      key: backupObject.key,
      body: backupObject.body,
      contentSha256: backupObject.contentSha256,
      manifest: backupObject.payload.manifest
    });

    const finishedJobRun = await jobRunRepository.finishJobRun(jobRun.id, {
      status: "succeeded",
      finishedAt: now().toISOString(),
      recordsInserted: backupObject.payload.manifest.totalRows,
      recordsSkipped: 0
    });

    return {
      jobRun: finishedJobRun,
      bucketName: options.bucketName,
      objectKey: backupObject.key,
      generatedAt: startedAt,
      totalRows: backupObject.payload.manifest.totalRows,
      contentSha256: backupObject.contentSha256
    };
  } catch (error) {
    await markJobRunFailedBestEffort(jobRunRepository, jobRun.id, now().toISOString(), sanitizeErrorMessage(error));
    throw error;
  }
}

async function assertNoRunningBlockingJobs(
  jobRunRepository: JobRunRepository,
  blockingJobNames: readonly string[],
  referenceTime: string,
  staleAfterMs: number
): Promise<void> {
  const startedAfter = new Date(new Date(referenceTime).getTime() - staleAfterMs).toISOString();
  const [blockingJobRuns, staleJobRuns] = await Promise.all([
    jobRunRepository.listStartedJobRuns(blockingJobNames, { startedAfter }),
    jobRunRepository.listStartedJobRuns(blockingJobNames, { startedBefore: startedAfter })
  ]);

  if (staleJobRuns.length > 0) {
    console.warn("Ignoring stale started batch jobs while checking backup guard.", {
      staleAfterMs,
      staleJobRuns: staleJobRuns.map((run) => ({
        id: run.id,
        jobName: run.jobName,
        jobStartedAt: run.jobStartedAt
      }))
    });
  }

  if (blockingJobRuns.length > 0) {
    throw new BackupBlockedByRunningJobError(blockingJobRuns);
  }
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }

  return "Unknown ledger backup error.";
}

async function markJobRunFailedBestEffort(
  jobRunRepository: JobRunRepository,
  jobRunId: string,
  finishedAt: string,
  errorMessage: string
): Promise<void> {
  try {
    await jobRunRepository.finishJobRun(jobRunId, {
      status: "failed",
      finishedAt,
      errorMessage
    });
  } catch (failureMarkingError) {
    console.error("Failed to mark ledger backup job run as failed.", {
      jobRunId,
      errorMessage: sanitizeErrorMessage(failureMarkingError)
    });
  }
}
