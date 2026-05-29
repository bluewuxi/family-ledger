import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { JobRun } from "@family-ledger/shared";
import { createBackupLedgerDataHandler } from "../apps/jobs/src/handlers/backupLedgerData";
import { LEDGER_BACKUP_TABLES, type LedgerBackupRows } from "../apps/jobs/src/repositories/ledgerBackupRepository";
import {
  backupLedgerData,
  BACKUP_BLOCKED_BY_RUNNING_JOB_CODE,
  BACKUP_LEDGER_JOB_NAME
} from "../apps/jobs/src/services/ledgerBackupService";
import {
  createLedgerBackupObject,
  validateLedgerBackupPayload,
  type LedgerBackupPayload
} from "../apps/jobs/src/services/ledgerBackupBundle";

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const backupFile = parseBackupFile(process.argv.slice(2));

  if (backupFile) {
    validateBackupFile(backupFile);
    console.log("Backup file verification: success");
    return;
  }

  await runSelfTests();
  console.log("Backup verification: success");
}

async function runSelfTests(): Promise<void> {
  const rows = sampleBackupRows();
  const backupObject = createLedgerBackupObject({
    environment: "test",
    generatedAt: "2026-05-29T01:00:00.000Z",
    rows
  });

  validateLedgerBackupPayload(backupObject.payload);
  assert.equal(backupObject.key, "backups/test/2026/05/29/family-ledger-test-2026-05-29T01-00-00-000Z.json.gz");
  assert.equal(backupObject.payload.manifest.secretsExcluded, true);
  assert.equal(backupObject.payload.manifest.totalRows, 2);
  assert.equal(backupObject.payload.tables.investment_accounts.length, 1);

  const tamperedPayload = structuredClone(backupObject.payload);
  tamperedPayload.tables.investment_accounts.push({ id: "unexpected-account" });
  assert.throws(() => validateLedgerBackupPayload(tamperedPayload), /row count/);

  const extraTablePayload = structuredClone(backupObject.payload) as LedgerBackupPayload & {
    tables: LedgerBackupPayload["tables"] & { auth_users: unknown[] };
  };
  extraTablePayload.tables.auth_users = [];
  assert.throws(() => validateLedgerBackupPayload(extraTablePayload), /payload table keys/);

  const successCalls: string[] = [];
  let excludedJobRunId: string | null | undefined;
  const successResult = await backupLedgerData({
    environmentName: "test",
    bucketName: "backup-bucket",
    startedAt: "2026-05-29T01:00:00.000Z",
    now: fixedNow(),
    jobRunRepository: fakeJobRunRepository(successCalls, []),
    ledgerBackupRepository: {
      async exportLedgerTables(input) {
        successCalls.push("export");
        excludedJobRunId = input?.excludedJobRunId;
        return rows;
      }
    },
    ledgerBackupStorage: {
      async putLedgerBackupObject(input) {
        successCalls.push(`s3:${input.bucketName}:${input.key}:${input.manifest.totalRows}`);
      }
    }
  });

  assert.equal(successResult.totalRows, 2);
  assert.equal(excludedJobRunId, "backup-job-run-id");
  assert.ok(successCalls.includes(`job:start:${BACKUP_LEDGER_JOB_NAME}`));
  assert.ok(successCalls.includes("list-started"));
  assert.ok(successCalls.includes("export"));
  assert.ok(successCalls.some((call) => call.startsWith("s3:backup-bucket:backups/test/")));
  assert.ok(successCalls.includes("job:finish:succeeded:2:0"));

  const blockedCalls: string[] = [];
  await assert.rejects(
    backupLedgerData({
      environmentName: "test",
      bucketName: "backup-bucket",
      startedAt: "2026-05-29T01:00:00.000Z",
      now: fixedNow(),
      jobRunRepository: fakeJobRunRepository(blockedCalls, [jobRunRecord("running-job-id", "update-prices", "started")]),
      ledgerBackupRepository: {
        async exportLedgerTables() {
          blockedCalls.push("export");
          return rows;
        }
      },
      ledgerBackupStorage: {
        async putLedgerBackupObject() {
          blockedCalls.push("s3");
        }
      }
    }),
    new RegExp(BACKUP_BLOCKED_BY_RUNNING_JOB_CODE)
  );
  assert.ok(blockedCalls.includes("list-started"));
  assert.ok(blockedCalls.includes(`job:finish:failed:0:0:${BACKUP_BLOCKED_BY_RUNNING_JOB_CODE}: update-prices:running-job-id`));
  assert.equal(blockedCalls.includes("export"), false);
  assert.equal(blockedCalls.includes("s3"), false);

  const staleCalls: string[] = [];
  await withMutedConsole(() =>
    backupLedgerData({
      environmentName: "test",
      bucketName: "backup-bucket",
      startedAt: "2026-05-29T01:00:00.000Z",
      now: fixedNow(),
      jobRunRepository: fakeJobRunRepository(staleCalls, [
        jobRunRecord("stale-job-id", "update-prices", "started", "2026-05-28T23:30:00.000Z")
      ]),
      ledgerBackupRepository: {
        async exportLedgerTables() {
          staleCalls.push("export");
          return rows;
        }
      },
      ledgerBackupStorage: {
        async putLedgerBackupObject() {
          staleCalls.push("s3");
        }
      }
    })
  );
  assert.ok(staleCalls.includes("export"));
  assert.ok(staleCalls.includes("s3"));

  const blockedAfterExportCalls: string[] = [];
  let guardChecks = 0;
  await assert.rejects(
    withMutedConsole(() =>
      backupLedgerData({
        environmentName: "test",
        bucketName: "backup-bucket",
        startedAt: "2026-05-29T01:00:00.000Z",
        now: fixedNow(),
        jobRunRepository: {
          ...fakeJobRunRepository(blockedAfterExportCalls, []),
          async listStartedJobRuns(_jobNames: readonly string[], options: { startedBefore?: string; startedAfter?: string } = {}): Promise<JobRun[]> {
            blockedAfterExportCalls.push("list-started");
            guardChecks += 1;

            if (options.startedBefore) {
              return [];
            }

            return guardChecks === 1 ? [] : [jobRunRecord("late-running-job-id", "generate-portfolio-snapshots", "started")];
          }
        },
        ledgerBackupRepository: {
          async exportLedgerTables() {
            blockedAfterExportCalls.push("export");
            return rows;
          }
        },
        ledgerBackupStorage: {
          async putLedgerBackupObject() {
            blockedAfterExportCalls.push("s3");
          }
        }
      })
    ),
    new RegExp(BACKUP_BLOCKED_BY_RUNNING_JOB_CODE)
  );
  assert.ok(blockedAfterExportCalls.includes("export"));
  assert.equal(blockedAfterExportCalls.includes("s3"), false);

  const handlerCalls: string[] = [];
  const handler = createBackupLedgerDataHandler({
    getLedgerBackupConfig() {
      return { environmentName: "test", bucketName: "backup-bucket" };
    },
    async backupLedgerData(input) {
      handlerCalls.push(`${input.environmentName}:${input.bucketName}:${input.startedAt}`);
      return {
        jobRun: jobRunRecord("handler-job-run-id", BACKUP_LEDGER_JOB_NAME, "succeeded"),
        bucketName: input.bucketName,
        objectKey: "backups/test/2026/05/29/family-ledger-test-2026-05-29T01-00-00-000Z.json.gz",
        generatedAt: input.startedAt ?? "2026-05-29T01:00:00.000Z",
        totalRows: 2,
        contentSha256: "checksum"
      };
    }
  });
  await withMutedConsole(() =>
    handler({
      id: "scheduled-event-id",
      time: "2026-05-29T01:00:00.000Z"
    })
  );
  assert.deepEqual(handlerCalls, ["test:backup-bucket:2026-05-29T01:00:00.000Z"]);
}

function validateBackupFile(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`Backup file does not exist: ${path}`);
  }

  const raw = readFileSync(path);
  const json = path.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  const payload = JSON.parse(json) as LedgerBackupPayload;

  validateLedgerBackupPayload(payload);
}

function parseBackupFile(args: string[]): string | null {
  const fileFlagIndex = args.indexOf("--file");

  if (fileFlagIndex === -1) {
    return null;
  }

  const value = args[fileFlagIndex + 1];

  if (!value) {
    throw new Error("Usage: corepack pnpm verify:backup -- --file <backup.json.gz>");
  }

  return value;
}

function sampleBackupRows(): LedgerBackupRows {
  const entries = LEDGER_BACKUP_TABLES.map((table) => [table.name, []]);
  const rows = Object.fromEntries(entries) as LedgerBackupRows;

  rows.investment_accounts = [{ id: "account-id", name: "Test Account" }];
  rows.job_runs = [{ id: "job-run-id", job_name: "previous-job", status: "succeeded" }];

  return rows;
}

function fixedNow(): () => Date {
  return () => new Date("2026-05-29T01:05:00.000Z");
}

function fakeJobRunRepository(calls: string[], startedRuns: JobRun[]) {
  return {
    async createJobRun(input: { jobName: string; jobStartedAt: string }): Promise<JobRun> {
      calls.push(`job:start:${input.jobName}`);
      return jobRunRecord("backup-job-run-id", input.jobName, "started", input.jobStartedAt);
    },
    async finishJobRun(
      _id: string,
      input: {
        status: "succeeded" | "failed";
        finishedAt: string;
        recordsInserted?: number;
        recordsSkipped?: number;
        errorMessage?: string | null;
      }
    ): Promise<JobRun> {
      calls.push(
        `job:finish:${input.status}:${input.recordsInserted ?? 0}:${input.recordsSkipped ?? 0}${
          input.errorMessage ? `:${input.errorMessage}` : ""
        }`
      );
      return {
        ...jobRunRecord("backup-job-run-id", BACKUP_LEDGER_JOB_NAME, input.status),
        jobFinishedAt: input.finishedAt,
        recordsInserted: input.recordsInserted ?? 0,
        recordsSkipped: input.recordsSkipped ?? 0,
        errorMessage: input.errorMessage ?? null
      };
    },
    async listStartedJobRuns(_jobNames: readonly string[], options: { startedBefore?: string; startedAfter?: string } = {}): Promise<JobRun[]> {
      calls.push("list-started");
      return startedRuns.filter((run) => {
        if (options.startedAfter && run.jobStartedAt < options.startedAfter) {
          return false;
        }

        if (options.startedBefore && run.jobStartedAt >= options.startedBefore) {
          return false;
        }

        return true;
      });
    }
  };
}

function jobRunRecord(id: string, jobName: string, status: JobRun["status"], startedAt = "2026-05-29T01:00:00.000Z"): JobRun {
  return {
    id,
    jobName,
    status,
    triggerSource: "schedule",
    triggeredByUserId: null,
    triggerRequestId: null,
    jobStartedAt: startedAt,
    jobFinishedAt: status === "started" ? null : "2026-05-29T01:05:00.000Z",
    recordsInserted: 0,
    recordsSkipped: 0,
    errorMessage: null,
    createdAt: startedAt,
    updatedAt: startedAt
  };
}

async function withMutedConsole(action: () => Promise<unknown>): Promise<void> {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  console.log = () => undefined;
  console.error = () => undefined;
  console.warn = () => undefined;

  try {
    await action();
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
}
