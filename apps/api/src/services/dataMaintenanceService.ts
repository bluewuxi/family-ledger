import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type {
  AuthenticatedUser,
  CurrencyCode,
  DataMaintenanceBackupRun,
  DataMaintenanceBackupSummary,
  DataMaintenanceRetrievalKind,
  DataMaintenanceRetrievalRequest,
  DataProviderRun,
  ExchangeRateRecord,
  JobRun,
  JobRunStatus,
  JobTriggerSource,
  PaginatedResult
} from "@family-ledger/shared";
import { CURRENCY_CODES, JOB_RUN_STATUSES, JOB_TRIGGER_SOURCES } from "@family-ledger/shared";
import {
  listDataProviderRuns,
  listExchangeRates,
  listInstrumentPrices,
  listJobRuns,
  type InstrumentPriceListRecord
} from "../repositories/dataMaintenanceRepository";
import { ApiRequestError } from "../utils/apiError";

export const BACKUP_LEDGER_JOB_NAME = "backup-ledger-data";
const backupBlockedByRunningJobCode = "BACKUP_BLOCKED_BY_RUNNING_JOB";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const maxLimit = 200;
const defaultLimit = 50;
const retrievalKinds = ["exchange_rates", "instrument_prices", "all"] as const;

export async function getDataMaintenanceFxRates(
  query: Record<string, string | undefined>
): Promise<PaginatedResult<ExchangeRateRecord>> {
  const from = optionalDate("from", query.from);
  const to = optionalDate("to", query.to);
  const pagination = parsePagination(query);
  validateDateRange(from, to);

  const rows = await listExchangeRates({
    fromCurrency: optionalCurrency("fromCurrency", query.fromCurrency),
    toCurrency: optionalCurrency("toCurrency", query.toCurrency),
    from,
    to,
    provider: optionalSearchText(query.provider),
    limit: pagination.limit,
    offset: pagination.offset
  });
  return toPaginatedResult(rows, pagination.limit, pagination.offset);
}

export async function getDataMaintenanceInstrumentPrices(
  query: Record<string, string | undefined>
): Promise<PaginatedResult<InstrumentPriceListRecord>> {
  const from = optionalDate("from", query.from);
  const to = optionalDate("to", query.to);
  const pagination = parsePagination(query);
  validateDateRange(from, to);

  const rows = await listInstrumentPrices({
    instrumentId: optionalUuid("instrumentId", query.instrumentId),
    provider: optionalSearchText(query.provider),
    from,
    to,
    limit: pagination.limit,
    offset: pagination.offset
  });
  return toPaginatedResult(rows, pagination.limit, pagination.offset);
}

export async function getDataMaintenanceJobRuns(query: Record<string, string | undefined>): Promise<PaginatedResult<JobRun>> {
  const pagination = parsePagination(query);
  const rows = await listJobRuns({
    jobName: optionalSearchText(query.jobName),
    status: optionalStatus(query.status),
    triggerSource: optionalTriggerSource(query.triggerSource),
    limit: pagination.limit,
    offset: pagination.offset
  });
  return toPaginatedResult(rows.map(sanitizeJobRunForDataMaintenance), pagination.limit, pagination.offset);
}

export async function getDataMaintenanceProviderRuns(jobRunId: string): Promise<DataProviderRun[]> {
  return listDataProviderRuns(requiredUuid("jobRunId", jobRunId));
}

export async function getDataMaintenanceBackupRuns(
  query: Record<string, string | undefined>
): Promise<PaginatedResult<DataMaintenanceBackupRun> & { summary: DataMaintenanceBackupSummary }> {
  const pagination = parsePagination(query);
  const [rows, latestRows, latestSucceededRows] = await Promise.all([
    listJobRuns({
      jobName: BACKUP_LEDGER_JOB_NAME,
      status: optionalStatus(query.status),
      triggerSource: optionalTriggerSource(query.triggerSource),
      limit: pagination.limit,
      offset: pagination.offset
    }),
    listJobRuns({
      jobName: BACKUP_LEDGER_JOB_NAME,
      limit: 1,
      offset: 0
    }),
    listJobRuns({
      jobName: BACKUP_LEDGER_JOB_NAME,
      status: "succeeded",
      limit: 1,
      offset: 0
    })
  ]);
  const result = toPaginatedResult(rows.map(toBackupRunDto), pagination.limit, pagination.offset);

  return {
    ...result,
    summary: {
      latestRun: latestRows[0] ? toBackupRunDto(latestRows[0]) : null,
      latestSucceededRun: latestSucceededRows[0] ? toBackupRunDto(latestSucceededRows[0]) : null
    }
  };
}

export async function triggerDataMaintenanceRetrieval(
  body: unknown,
  user: AuthenticatedUser,
  requestId: string
): Promise<{ kind: DataMaintenanceRetrievalKind; triggered: string[]; triggerRequestId: string }> {
  const request = parseRetrievalRequest(body);
  const targetFunctions = getTargetFunctions(request.kind);

  if (targetFunctions.length === 0) {
    throw new ApiRequestError("INTERNAL_ERROR", "Market data retrieval Lambda configuration is missing.", 500);
  }

  const client = new LambdaClient({});
  const payload = JSON.stringify({
    triggerSource: "manual",
    triggeredByUserId: user.id,
    triggerRequestId: requestId,
    ...(request.rateDate ? { rateDate: request.rateDate } : {})
  });

  for (const functionName of targetFunctions) {
    await client.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "Event",
        Payload: Buffer.from(payload)
      })
    );
  }

  return { kind: request.kind, triggered: targetFunctions, triggerRequestId: requestId };
}

function toBackupRunDto(jobRun: JobRun): DataMaintenanceBackupRun {
  return {
    id: jobRun.id,
    status: jobRun.status,
    triggerSource: jobRun.triggerSource ?? null,
    startedAt: jobRun.jobStartedAt ?? null,
    finishedAt: jobRun.jobFinishedAt ?? null,
    durationSeconds: calculateDurationSeconds(jobRun.jobStartedAt, jobRun.jobFinishedAt),
    recordsInserted: Number.isFinite(jobRun.recordsInserted) ? jobRun.recordsInserted : null,
    friendlyFailureReason: toFriendlyBackupFailureReason(jobRun)
  };
}

function sanitizeJobRunForDataMaintenance(jobRun: JobRun): JobRun {
  if (jobRun.jobName !== BACKUP_LEDGER_JOB_NAME) {
    return jobRun;
  }

  return {
    ...jobRun,
    errorMessage: toFriendlyBackupFailureReason(jobRun)
  };
}

function calculateDurationSeconds(startedAt: string | null, finishedAt: string | null): number | null {
  if (!startedAt || !finishedAt) {
    return null;
  }

  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(finishedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs) || finishedMs < startedMs) {
    return null;
  }

  return Math.round((finishedMs - startedMs) / 1000);
}

function toFriendlyBackupFailureReason(jobRun: JobRun): string | null {
  if (jobRun.status !== "failed") {
    return null;
  }

  if (jobRun.errorMessage?.includes(backupBlockedByRunningJobCode)) {
    return "有批处理任务仍在运行，备份会稍后重试。";
  }

  return "备份失败，请查看后台日志。";
}

function parseRetrievalRequest(body: unknown): DataMaintenanceRetrievalRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body must be an object.", 400);
  }

  const kind = (body as { kind?: unknown }).kind;
  const rateDate = optionalDate("rateDate", (body as { rateDate?: unknown }).rateDate as string | undefined);

  if (!retrievalKinds.includes(kind as DataMaintenanceRetrievalKind)) {
    throw new ApiRequestError("VALIDATION_ERROR", "kind must be exchange_rates, instrument_prices, or all.", 400);
  }

  return { kind: kind as DataMaintenanceRetrievalKind, ...(rateDate ? { rateDate } : {}) };
}

function getTargetFunctions(kind: DataMaintenanceRetrievalKind): string[] {
  const fxFunctionName = process.env.UPDATE_FX_RATES_FUNCTION_NAME;
  const priceFunctionName = process.env.UPDATE_PRICES_FUNCTION_NAME;

  if (kind === "exchange_rates") {
    return fxFunctionName ? [fxFunctionName] : [];
  }

  if (kind === "instrument_prices") {
    return priceFunctionName ? [priceFunctionName] : [];
  }

  return fxFunctionName && priceFunctionName ? [fxFunctionName, priceFunctionName] : [];
}

function optionalCurrency(name: string, value: string | undefined): CurrencyCode | undefined {
  if (!value) {
    return undefined;
  }

  if (!CURRENCY_CODES.includes(value as CurrencyCode)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${name} must be a supported currency code.`, 400);
  }

  return value as CurrencyCode;
}

function optionalStatus(value: string | undefined): JobRunStatus | undefined {
  if (!value) {
    return undefined;
  }

  if (!JOB_RUN_STATUSES.includes(value as JobRunStatus)) {
    throw new ApiRequestError("VALIDATION_ERROR", "status must be started, succeeded, or failed.", 400);
  }

  return value as JobRunStatus;
}

function optionalTriggerSource(value: string | undefined): JobTriggerSource | undefined {
  if (!value) {
    return undefined;
  }

  if (!JOB_TRIGGER_SOURCES.includes(value as JobTriggerSource)) {
    throw new ApiRequestError("VALIDATION_ERROR", "triggerSource must be schedule or manual.", 400);
  }

  return value as JobTriggerSource;
}

function optionalDate(name: string, value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!datePattern.test(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${name} must use YYYY-MM-DD format.`, 400);
  }

  return value;
}

function validateDateRange(from: string | undefined, to: string | undefined): void {
  if (from && to && from > to) {
    throw new ApiRequestError("VALIDATION_ERROR", "from cannot be after to.", 400);
  }
}

function optionalUuid(name: string, value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return requiredUuid(name, value);
}

function requiredUuid(name: string, value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${name} must be a valid UUID.`, 400);
  }

  return value;
}

function optionalSearchText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

function parseLimit(value: string | undefined): number {
  if (!value) {
    return defaultLimit;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new ApiRequestError("VALIDATION_ERROR", `limit must be an integer between 1 and ${maxLimit}.`, 400);
  }

  return limit;
}

function parseOffset(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const offset = Number(value);

  if (!Number.isInteger(offset) || offset < 0) {
    throw new ApiRequestError("VALIDATION_ERROR", "offset must be a non-negative integer.", 400);
  }

  return offset;
}

function parsePagination(query: Record<string, string | undefined>): { limit: number; offset: number } {
  return {
    limit: parseLimit(query.limit),
    offset: parseOffset(query.offset)
  };
}

function toPaginatedResult<T>(rows: T[], limit: number, offset: number): PaginatedResult<T> {
  return {
    items: rows.slice(0, limit),
    pagination: {
      limit,
      offset,
      hasMore: rows.length > limit
    }
  };
}
