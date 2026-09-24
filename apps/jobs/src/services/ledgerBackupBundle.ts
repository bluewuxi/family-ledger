import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { LEDGER_BACKUP_TABLES, type LedgerBackupRows, type LedgerBackupTableName } from "../repositories/ledgerBackupRepository";

export const LEDGER_BACKUP_VERSION = 3;
export const LEDGER_BACKUP_MIGRATION_HIGH_WATER_MARK = "20260923090000_add_spending_statements";
const HASH_ALGORITHM = "sha256";
const JSON_SERIALIZATION = "stable-json-v1";

export interface LedgerBackupManifestTable {
  name: LedgerBackupTableName | "portfolio_snapshots";
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
  version: 1 | 2 | typeof LEDGER_BACKUP_VERSION;
  backupKind: "postgres_public_ledger";
  environment: string;
  generatedAt: string;
  migrationHighWaterMark: string;
  snapshotSemantics: "database_rpc_single_statement_snapshot";
  hashAlgorithm: typeof HASH_ALGORITHM;
  jsonSerialization: typeof JSON_SERIALIZATION;
  tableOrder: Array<LedgerBackupTableName | "portfolio_snapshots">;
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
  const legacy = Array.isArray(input.rows.portfolio_snapshots);
  const tableDefinitions = LEDGER_BACKUP_TABLES.filter((table) => !legacy || !["spending_accounts", "account_statements", "statement_rows"].includes(table.name)).map((table) =>
    legacy && table.name === "portfolio_snapshot_headers" ? { name: "portfolio_snapshots" as const, orderColumn: "id" } : table);
  const payloadRows = Object.fromEntries(tableDefinitions.map((table) => [table.name, input.rows[table.name]])) as LedgerBackupRows;
  const tables = tableDefinitions.map((table) => {
    const rows = input.rows[table.name];
    if (!rows) throw new Error(`Missing backup table ${table.name}.`);

    return {
      name: table.name,
      rowOrder: table.orderColumn,
      rowCount: rows.length,
      checksumSha256: sha256(stableStringify(rows))
    };
  });
  const manifestWithoutChecksums: Omit<LedgerBackupManifest, "payloadChecksumSha256" | "fileChecksumSha256"> = {
    version: legacy ? 1 : LEDGER_BACKUP_VERSION,
    backupKind: "postgres_public_ledger" as const,
    environment: input.environment,
    generatedAt: input.generatedAt,
    migrationHighWaterMark: legacy ? "20260922090000_add_account_purposes_and_snapshot_view" : LEDGER_BACKUP_MIGRATION_HIGH_WATER_MARK,
    snapshotSemantics: "database_rpc_single_statement_snapshot" as const,
    hashAlgorithm: HASH_ALGORITHM,
    jsonSerialization: JSON_SERIALIZATION,
    tableOrder: tableDefinitions.map((table) => table.name),
    externalDependencies: {
      supabaseAuthUsers: true,
      restoreRequiresMatchingAuthUserIdsOrRemap: true,
      userIdFields: [
        "profiles.id",
        ...["spending_accounts", "account_statements", "statement_rows"].flatMap((table) => [`${table}.created_by_user_id`, `${table}.updated_by_user_id`]),
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
      tables: payloadRows
    })
  );
  const payloadWithoutFileChecksum: Omit<LedgerBackupPayload, "manifest"> & {
    manifest: Omit<LedgerBackupManifest, "fileChecksumSha256">;
  } = {
    manifest: {
      ...manifestWithoutChecksums,
      payloadChecksumSha256
    },
    tables: payloadRows
  };
  const fileChecksumSha256 = sha256(stableStringify(payloadWithoutFileChecksum));
  const payload: LedgerBackupPayload = {
    manifest: {
      ...payloadWithoutFileChecksum.manifest,
      fileChecksumSha256
    },
    tables: payloadRows
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
  if (payload.manifest.version !== 1 && payload.manifest.version !== 2 && payload.manifest.version !== LEDGER_BACKUP_VERSION) {
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

  const currentTableNames = LEDGER_BACKUP_TABLES.map((table) => table.name).filter((name) => payload.manifest.version === 3 || !["spending_accounts", "account_statements", "statement_rows"].includes(name));
  const manifestTableNames = payload.manifest.tables.map((table) => table.name);
  const legacyTableNames = currentTableNames.map((name) => name === "portfolio_snapshot_headers" ? "portfolio_snapshots" : name);
  const acceptsLegacySnapshots = JSON.stringify(manifestTableNames) === JSON.stringify(legacyTableNames);
  const expectedTableNames = acceptsLegacySnapshots ? legacyTableNames : currentTableNames;
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
    const expectedTable = String(table.name) === "portfolio_snapshots" && acceptsLegacySnapshots
      ? { name: "portfolio_snapshots", orderColumn: "id" }
      : LEDGER_BACKUP_TABLES.find((candidate) => candidate.name === table.name);

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

export function stableStringify(value: unknown): string {
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

/** Validate the original checksums first, then map stored data for the current schema. */
export function prepareLedgerRestoreRows(payload: LedgerBackupPayload): LedgerBackupRows {
  validateLedgerBackupPayload(payload);
  const source = payload.tables as unknown as Record<string, unknown[]>;
  const rows = {} as LedgerBackupRows;
  for (const table of LEDGER_BACKUP_TABLES) {
    if (table.name === "portfolio_snapshot_headers" && !source[table.name]) {
      rows[table.name] = source.portfolio_snapshots.map((value) => {
        const snapshot = value as Record<string, unknown>;
        return Object.fromEntries(["id", "snapshot_date", "usd_to_nzd_rate", "usd_to_cny_rate", "notes", "created_at", "updated_at"]
          .map((key) => [key, snapshot[key]]));
      });
    } else {
      rows[table.name] = structuredClone(source[table.name] ?? []);
    }
  }
  rows.investment_accounts = rows.investment_accounts.map((value) => {
    const account = value as Record<string, unknown>;
    const purpose = account.purpose ?? "investment";
    if (!["investment", "daily_expense", "education"].includes(String(purpose))) throw new Error("Invalid account purpose in backup.");
    return { ...account, purpose };
  });
  return rows;
}
