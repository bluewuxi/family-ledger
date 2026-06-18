import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { LEDGER_BACKUP_TABLES, type LedgerBackupRows, type LedgerBackupTableName } from "../repositories/ledgerBackupRepository";

export const LEDGER_BACKUP_VERSION = 1;
export const LEDGER_BACKUP_MIGRATION_HIGH_WATER_MARK = "20260618090000_add_monthly_reviews";
const HASH_ALGORITHM = "sha256";
const JSON_SERIALIZATION = "stable-json-v1";

export interface LedgerBackupManifestTable {
  name: LedgerBackupTableName;
  rowOrder: string;
  rowCount: number;
  checksumSha256: string;
}

export interface LedgerBackupExternalDependencies {
  supabaseAuthUsers: true;
  restoreRequiresMatchingAuthUserIdsOrRemap: true;
  userIdFields: string[];
}

export interface LedgerBackupManifest {
  version: typeof LEDGER_BACKUP_VERSION;
  backupKind: "postgres_public_ledger";
  environment: string;
  generatedAt: string;
  migrationHighWaterMark: string;
  snapshotSemantics: "database_rpc_single_statement_snapshot";
  hashAlgorithm: typeof HASH_ALGORITHM;
  jsonSerialization: typeof JSON_SERIALIZATION;
  tableOrder: LedgerBackupTableName[];
  externalDependencies: LedgerBackupExternalDependencies;
  secretsExcluded: true;
  tables: LedgerBackupManifestTable[];
  totalRows: number;
  payloadChecksumSha256: string;
  fileChecksumSha256: string;
}

export interface LedgerBackupPayload {
  manifest: LedgerBackupManifest;
  tables: LedgerBackupRows;
}

export interface LedgerBackupObject {
  key: string;
  body: Buffer;
  payload: LedgerBackupPayload;
  contentSha256: string;
}

export function createLedgerBackupObject(input: {
  environment: string;
  generatedAt: string;
  rows: LedgerBackupRows;
}): LedgerBackupObject {
  const tables = LEDGER_BACKUP_TABLES.map((table) => {
    const rows = input.rows[table.name];

    return {
      name: table.name,
      rowOrder: table.orderColumn,
      rowCount: rows.length,
      checksumSha256: sha256(stableStringify(rows))
    };
  });
  const manifestWithoutChecksums: Omit<LedgerBackupManifest, "payloadChecksumSha256" | "fileChecksumSha256"> = {
    version: LEDGER_BACKUP_VERSION,
    backupKind: "postgres_public_ledger" as const,
    environment: input.environment,
    generatedAt: input.generatedAt,
    migrationHighWaterMark: LEDGER_BACKUP_MIGRATION_HIGH_WATER_MARK,
    snapshotSemantics: "database_rpc_single_statement_snapshot" as const,
    hashAlgorithm: HASH_ALGORITHM,
    jsonSerialization: JSON_SERIALIZATION,
    tableOrder: LEDGER_BACKUP_TABLES.map((table) => table.name),
    externalDependencies: {
      supabaseAuthUsers: true,
      restoreRequiresMatchingAuthUserIdsOrRemap: true,
      userIdFields: [
        "profiles.id",
        "user_roles.user_id",
        "investment_accounts.created_by_user_id",
        "investment_accounts.updated_by_user_id",
        "instruments.created_by_user_id",
        "instruments.updated_by_user_id",
        "transactions.created_by_user_id",
        "transactions.updated_by_user_id",
        "monthly_reviews.completed_by_user_id",
        "monthly_reviews.updated_by_user_id",
        "job_runs.triggered_by_user_id"
      ]
    },
    secretsExcluded: true as const,
    tables,
    totalRows: tables.reduce((total, table) => total + table.rowCount, 0)
  };
  const payloadChecksumSha256 = sha256(
    stableStringify({
      manifest: manifestWithoutChecksums,
      tables: input.rows
    })
  );
  const payloadWithoutFileChecksum: Omit<LedgerBackupPayload, "manifest"> & {
    manifest: Omit<LedgerBackupManifest, "fileChecksumSha256">;
  } = {
    manifest: {
      ...manifestWithoutChecksums,
      payloadChecksumSha256
    },
    tables: input.rows
  };
  const fileChecksumSha256 = sha256(stableStringify(payloadWithoutFileChecksum));
  const payload: LedgerBackupPayload = {
    manifest: {
      ...payloadWithoutFileChecksum.manifest,
      fileChecksumSha256
    },
    tables: input.rows
  };
  const serialized = `${stableStringify(payload)}\n`;
  const body = gzipSync(Buffer.from(serialized, "utf8"));
  const contentSha256 = sha256(serialized);

  return {
    key: backupObjectKey(input.environment, input.generatedAt),
    body,
    payload,
    contentSha256
  };
}

export function validateLedgerBackupPayload(payload: LedgerBackupPayload): void {
  if (payload.manifest.version !== LEDGER_BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${String(payload.manifest.version)}.`);
  }

  if (payload.manifest.backupKind !== "postgres_public_ledger") {
    throw new Error("Backup kind is not postgres_public_ledger.");
  }

  if (payload.manifest.secretsExcluded !== true) {
    throw new Error("Backup manifest must explicitly mark secretsExcluded as true.");
  }

  if (payload.manifest.snapshotSemantics !== "database_rpc_single_statement_snapshot") {
    throw new Error("Backup snapshot semantics are unsupported.");
  }

  if (payload.manifest.hashAlgorithm !== HASH_ALGORITHM) {
    throw new Error("Backup hash algorithm is unsupported.");
  }

  if (payload.manifest.jsonSerialization !== JSON_SERIALIZATION) {
    throw new Error("Backup JSON serialization is unsupported.");
  }

  const expectedTableNames = LEDGER_BACKUP_TABLES.map((table) => table.name);
  const manifestTableNames = payload.manifest.tables.map((table) => table.name);
  const payloadTableNames = Object.keys(payload.tables).sort();
  const sortedExpectedTableNames = [...expectedTableNames].sort();

  if (JSON.stringify(manifestTableNames) !== JSON.stringify(expectedTableNames)) {
    throw new Error("Backup table list does not match the expected ledger tables.");
  }

  if (JSON.stringify(payloadTableNames) !== JSON.stringify(sortedExpectedTableNames)) {
    throw new Error("Backup payload table keys do not match the expected ledger tables.");
  }

  if (JSON.stringify(payload.manifest.tableOrder) !== JSON.stringify(expectedTableNames)) {
    throw new Error("Backup table order does not match the expected ledger tables.");
  }

  let totalRows = 0;

  for (const table of payload.manifest.tables) {
    const rows = payload.tables[table.name];
    const expectedTable = LEDGER_BACKUP_TABLES.find((candidate) => candidate.name === table.name);

    if (!Array.isArray(rows)) {
      throw new Error(`Backup table ${table.name} is missing or invalid.`);
    }

    if (!expectedTable || table.rowOrder !== expectedTable.orderColumn) {
      throw new Error(`Backup table ${table.name} row order does not match the expected order.`);
    }

    if (rows.length !== table.rowCount) {
      throw new Error(`Backup table ${table.name} row count does not match the manifest.`);
    }

    if (sha256(stableStringify(rows)) !== table.checksumSha256) {
      throw new Error(`Backup table ${table.name} checksum does not match the manifest.`);
    }

    totalRows += rows.length;
  }

  if (payload.manifest.totalRows !== totalRows) {
    throw new Error("Backup total row count does not match the manifest.");
  }

  if (payload.manifest.externalDependencies.supabaseAuthUsers !== true) {
    throw new Error("Backup must declare Supabase Auth users as external dependencies.");
  }

  const {
    payloadChecksumSha256: _payloadChecksumSha256,
    fileChecksumSha256: _fileChecksumSha256,
    ...manifestWithoutChecksums
  } = payload.manifest;
  const expectedPayloadChecksum = sha256(
    stableStringify({
      manifest: manifestWithoutChecksums,
      tables: payload.tables
    })
  );

  if (payload.manifest.payloadChecksumSha256 !== expectedPayloadChecksum) {
    throw new Error("Backup payload checksum does not match the manifest.");
  }

  const expectedFileChecksum = sha256(
    stableStringify({
      manifest: {
        ...manifestWithoutChecksums,
        payloadChecksumSha256: payload.manifest.payloadChecksumSha256
      },
      tables: payload.tables
    })
  );

  if (payload.manifest.fileChecksumSha256 !== expectedFileChecksum) {
    throw new Error("Backup file checksum does not match the manifest.");
  }
}

function backupObjectKey(environment: string, generatedAt: string): string {
  const date = new Date(generatedAt);

  if (Number.isNaN(date.valueOf())) {
    throw new Error("Backup generatedAt must be a valid ISO timestamp.");
  }

  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const safeTimestamp = generatedAt.replace(/[:.]/gu, "-");

  return `backups/${environment}/${year}/${month}/${day}/family-ledger-${environment}-${safeTimestamp}.json.gz`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
