import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { JobRun } from "@family-ledger/shared";
import { createBackupLedgerDataHandler } from "../apps/jobs/src/handlers/backupLedgerData";
import { LEDGER_BACKUP_TABLES, normalizeLedgerBackupRows, type LedgerBackupRows } from "../apps/jobs/src/repositories/ledgerBackupRepository";
import {
  backupLedgerData,
  BACKUP_BLOCKED_BY_RUNNING_JOB_CODE,
  BACKUP_LEDGER_JOB_NAME
} from "../apps/jobs/src/services/ledgerBackupService";
import {
  createLedgerBackupObject,
  validateLedgerBackupPayload,
  prepareLedgerRestoreRows,
  stableStringify,
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
  assert.equal(backupObject.payload.manifest.version, 6);
  const version5 = structuredClone(backupObject.payload);
  version5.manifest.version = 5;
  const educationTables = ["education_reserve_funds", "education_reserve_entries"];
  version5.manifest.tables = version5.manifest.tables.filter(t => !educationTables.includes(t.name));
  version5.manifest.tableOrder = version5.manifest.tableOrder.filter(t => !educationTables.includes(t));
  for (const name of educationTables) delete (version5.tables as unknown as Record<string, unknown>)[name];
  const { payloadChecksumSha256: _v5p, fileChecksumSha256: _v5f, ...v5manifest } = version5.manifest;
  const v5hash = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
  version5.manifest.payloadChecksumSha256 = v5hash({ manifest: v5manifest, tables: version5.tables });
  version5.manifest.fileChecksumSha256 = v5hash({ manifest: { ...v5manifest, payloadChecksumSha256: version5.manifest.payloadChecksumSha256 }, tables: version5.tables });
  assert.deepEqual(prepareLedgerRestoreRows(version5).education_reserve_entries, []);
  const privateMetadata = { card_number: "6222333344440001", "信用卡卡号": "6222333344440001" };
  const spendingBackup = createLedgerBackupObject({ environment: "test", generatedAt: "2026-10-01T00:00:00Z", rows: {
    ...rows,
    spending_accounts: [{ id: "credit", source_format: "ccb_credit" }, { id: "bnz", source_format: "bnz" }],
    statement_rows: [{ account_id: "credit", source_metadata: privateMetadata, fingerprint: "unchanged" },
      { account_id: "bnz", source_metadata: { "This Party Account": "02-0000-1234567-001", "Other Party Account": "03-9999-7654321-002" } }],
    account_statements: [{ account_id: "credit", status: "preview", preview_token: "old", parser_version: "bank-csv-1", preview: { rows: [{ source_metadata: privateMetadata }], errors: [] } }]
  } });
  const cleanSpending = prepareLedgerRestoreRows(spendingBackup.payload);
  assert(!JSON.stringify(cleanSpending).includes("6222333344440001"));
  assert.equal((cleanSpending.statement_rows[0] as Record<string, unknown>).account_number_last4, "0001");
  assert.equal((cleanSpending.statement_rows[0] as Record<string, unknown>).fingerprint, "unchanged");
  assert.equal((cleanSpending.statement_rows[1] as Record<string, unknown>).account_number_last4, "7001");
  assert.equal((cleanSpending.statement_rows[1] as Record<string, unknown>).counterparty_account_last4, "1002");
  assert.equal((cleanSpending.account_statements[0] as Record<string, unknown>).preview_token, null);
  assert.equal((cleanSpending.account_statements[0] as Record<string, unknown>).total_count, 1);
  const previous = structuredClone(backupObject.payload);
  previous.manifest.version = 2;
  const newTables = ["spending_accounts", "account_statements", "statement_rows", "kernel_price_anchors", "education_reserve_funds", "education_reserve_entries"];
  previous.manifest.tables = previous.manifest.tables.filter((table) => !newTables.includes(table.name));
  previous.manifest.tableOrder = previous.manifest.tableOrder.filter((name) => !newTables.includes(name));
  for (const name of newTables) delete (previous.tables as unknown as Record<string, unknown>)[name];
  const { payloadChecksumSha256: _oldPayload, fileChecksumSha256: _oldFile, ...oldManifest } = previous.manifest;
  const hash = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
  previous.manifest.payloadChecksumSha256 = hash({ manifest: oldManifest, tables: previous.tables });
  previous.manifest.fileChecksumSha256 = hash({ manifest: { ...oldManifest, payloadChecksumSha256: previous.manifest.payloadChecksumSha256 }, tables: previous.tables });
  validateLedgerBackupPayload(previous);
  assert.deepEqual(prepareLedgerRestoreRows(previous).statement_rows, []);
  assert.deepEqual(prepareLedgerRestoreRows(previous).account_statements, []);
  assert.deepEqual(prepareLedgerRestoreRows(previous).spending_accounts, []);
  const asVersion3 = (value: LedgerBackupPayload) => {
    const copy = structuredClone(value);
    copy.manifest.version = 3;
    const removed = ["kernel_price_anchors", "education_reserve_funds", "education_reserve_entries"];
    copy.manifest.tables = copy.manifest.tables.filter((table) => !removed.includes(table.name));
    copy.manifest.tableOrder = copy.manifest.tableOrder.filter((name) => !removed.includes(name));
    delete (copy.tables as unknown as Record<string, unknown>).kernel_price_anchors;
    delete (copy.tables as unknown as Record<string, unknown>).education_reserve_funds;
    delete (copy.tables as unknown as Record<string, unknown>).education_reserve_entries;
    const {payloadChecksumSha256: _p, fileChecksumSha256: _f, ...manifest} = copy.manifest;
    copy.manifest.payloadChecksumSha256 = hash({manifest,tables:copy.tables});
    copy.manifest.fileChecksumSha256 = hash({manifest:{...manifest,payloadChecksumSha256:copy.manifest.payloadChecksumSha256},tables:copy.tables});
    return copy;
  };
  assert.deepEqual(prepareLedgerRestoreRows(asVersion3(backupObject.payload)).statement_rows, []);
  const version4 = structuredClone(backupObject.payload);
  version4.manifest.version = 4;
  version4.manifest.tables = version4.manifest.tables.filter((table) => !["kernel_price_anchors", "education_reserve_funds", "education_reserve_entries"].includes(table.name));
  version4.manifest.tableOrder = version4.manifest.tableOrder.filter((name) => !["kernel_price_anchors", "education_reserve_funds", "education_reserve_entries"].includes(name));
  delete (version4.tables as unknown as Record<string, unknown>).kernel_price_anchors;
  delete (version4.tables as unknown as Record<string, unknown>).education_reserve_funds;
  delete (version4.tables as unknown as Record<string, unknown>).education_reserve_entries;
  version4.tables.instrument_prices = [{ id: "legacy-price", close_price: "1.23" }];
  const version4Prices = version4.manifest.tables.find((table) => table.name === "instrument_prices");
  assert(version4Prices);
  version4Prices.rowCount = 1;
  version4Prices.checksumSha256 = hash(version4.tables.instrument_prices);
  version4.manifest.totalRows += 1;
  {
    const { payloadChecksumSha256: _p, fileChecksumSha256: _f, ...manifest } = version4.manifest;
    version4.manifest.payloadChecksumSha256 = hash({ manifest, tables: version4.tables });
    version4.manifest.fileChecksumSha256 = hash({
      manifest: { ...manifest, payloadChecksumSha256: version4.manifest.payloadChecksumSha256 },
      tables: version4.tables
    });
  }
  const restoredVersion4 = prepareLedgerRestoreRows(version4);
  assert.deepEqual(restoredVersion4.kernel_price_anchors, []);
  assert.equal((restoredVersion4.instrument_prices[0] as Record<string, unknown>).is_estimated, false);
  const withLegacySpending = createLedgerBackupObject({environment:"test",generatedAt:"2026-09-26T00:00:00Z",rows:{...rows,spending_accounts:[{id:"old-account"}]}});
  assert.throws(()=>prepareLedgerRestoreRows(asVersion3(withLegacySpending.payload)),/Legacy spending tables must be empty/);
  const legacySource = { ...rows, portfolio_snapshot_headers: undefined, portfolio_snapshots: [{
    id: "snapshot-id", snapshot_date: "2026-05-29", usd_to_nzd_rate: "1.6", usd_to_cny_rate: "7",
    notes: "preserve", created_at: "2026-05-29T01:00:00Z", updated_at: "2026-05-29T02:00:00Z",
    total_market_value_nzd: "123.456789", total_market_value_usd: "99"
  }] };
  const legacyObject = createLedgerBackupObject({ environment: "test", generatedAt: "2026-05-29T01:00:00Z",
    rows: normalizeLedgerBackupRows(legacySource) });
  validateLedgerBackupPayload(legacyObject.payload);
  assert.equal(legacyObject.payload.manifest.version, 1);
  assert.equal(legacyObject.payload.tables.portfolio_snapshots?.length, 1);
  assert.equal("portfolio_snapshot_headers" in legacyObject.payload.tables, false);
  const restored = prepareLedgerRestoreRows(legacyObject.payload);
  assert.equal("portfolio_snapshots" in restored, false);
  assert.deepEqual(restored.portfolio_snapshot_headers, [{
    id: "snapshot-id", snapshot_date: "2026-05-29", usd_to_nzd_rate: "1.6", usd_to_cny_rate: "7",
    notes: "preserve", created_at: "2026-05-29T01:00:00Z", updated_at: "2026-05-29T02:00:00Z"
  }]);
  assert.equal((restored.investment_accounts[0] as { purpose: string }).purpose, "investment");
  assert.deepEqual(prepareLedgerRestoreRows(backupObject.payload).portfolio_snapshot_headers, []);
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
