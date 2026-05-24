import type {
  CurrencyCode,
  DataKind,
  DataProviderRun,
  ExchangeRateRecord,
  InstrumentPriceRecord,
  JobRun,
  JobRunStatus,
  JobTriggerSource
} from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

export interface InstrumentPriceListRecord extends InstrumentPriceRecord {
  instrumentName: string;
  instrumentSymbol: string | null;
}

interface ExchangeRateRow {
  id: string;
  rate_date: string;
  from_currency: CurrencyCode;
  to_currency: CurrencyCode;
  rate: string;
  rate_type: ExchangeRateRecord["rateType"];
  provider: string;
  provider_rate_date: string | null;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

interface InstrumentPriceRow {
  id: string;
  instrument_id: string;
  price_date: string;
  close_price: string;
  currency: CurrencyCode;
  provider: string;
  source_symbol: string | null;
  is_adjusted: boolean;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
  instruments: { name: string; symbol: string | null } | null;
}

interface JobRunRow {
  id: string;
  job_name: string;
  status: JobRunStatus;
  trigger_source: JobTriggerSource;
  triggered_by_user_id: string | null;
  trigger_request_id: string | null;
  job_started_at: string;
  job_finished_at: string | null;
  records_inserted: number;
  records_skipped: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface DataProviderRunRow {
  id: string;
  job_run_id: string;
  provider: string;
  data_kind: DataKind;
  status: JobRunStatus;
  provider_started_at: string;
  provider_finished_at: string | null;
  records_inserted: number;
  records_skipped: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export async function listExchangeRates(input: {
  fromCurrency?: CurrencyCode;
  toCurrency?: CurrencyCode;
  from?: string;
  to?: string;
  provider?: string;
  limit: number;
  offset: number;
}): Promise<ExchangeRateRecord[]> {
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("exchange_rates")
    .select(exchangeRateSelect)
    .not("from_currency", "eq", "USD")
    .order("rate_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(input.offset, input.offset + input.limit);

  if (input.fromCurrency) {
    query = query.eq("from_currency", input.fromCurrency);
  }
  if (input.toCurrency) {
    query = query.eq("to_currency", input.toCurrency);
  }
  if (input.from) {
    query = query.gte("rate_date", input.from);
  }
  if (input.to) {
    query = query.lte("rate_date", input.to);
  }
  if (input.provider) {
    query = query.ilike("provider", `%${input.provider}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Failed to list exchange rates.");
  }

  return (data as unknown as ExchangeRateRow[]).map(mapExchangeRateRow);
}

export async function listInstrumentPrices(input: {
  instrumentId?: string;
  provider?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}): Promise<InstrumentPriceListRecord[]> {
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("instrument_prices")
    .select(instrumentPriceSelect)
    .order("price_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(input.offset, input.offset + input.limit);

  if (input.instrumentId) {
    query = query.eq("instrument_id", input.instrumentId);
  }
  if (input.from) {
    query = query.gte("price_date", input.from);
  }
  if (input.to) {
    query = query.lte("price_date", input.to);
  }
  if (input.provider) {
    query = query.ilike("provider", `%${input.provider}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Failed to list instrument prices.");
  }

  return (data as unknown as InstrumentPriceRow[]).map(mapInstrumentPriceRow);
}

export async function listJobRuns(input: {
  jobName?: string;
  status?: JobRunStatus;
  triggerSource?: JobTriggerSource;
  limit: number;
  offset: number;
}): Promise<JobRun[]> {
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("job_runs")
    .select(jobRunSelect)
    .order("job_started_at", { ascending: false })
    .range(input.offset, input.offset + input.limit);

  if (input.jobName) {
    query = query.eq("job_name", input.jobName);
  }
  if (input.status) {
    query = query.eq("status", input.status);
  }
  if (input.triggerSource) {
    query = query.eq("trigger_source", input.triggerSource);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Failed to list job runs.");
  }

  return (data as unknown as JobRunRow[]).map(mapJobRunRow);
}

export async function listDataProviderRuns(jobRunId: string): Promise<DataProviderRun[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("data_provider_runs")
    .select(dataProviderRunSelect)
    .eq("job_run_id", jobRunId)
    .order("provider_started_at", { ascending: false });

  if (error) {
    throw new Error("Failed to list data provider runs.");
  }

  return (data as unknown as DataProviderRunRow[]).map(mapDataProviderRunRow);
}

const exchangeRateSelect = [
  "id",
  "rate_date",
  "from_currency",
  "to_currency",
  "rate",
  "rate_type",
  "provider",
  "provider_rate_date",
  "fetched_at",
  "created_at",
  "updated_at"
].join(", ");

const instrumentPriceSelect = [
  "id",
  "instrument_id",
  "price_date",
  "close_price",
  "currency",
  "provider",
  "source_symbol",
  "is_adjusted",
  "fetched_at",
  "created_at",
  "updated_at",
  "instruments(name, symbol)"
].join(", ");

const jobRunSelect = [
  "id",
  "job_name",
  "status",
  "trigger_source",
  "triggered_by_user_id",
  "trigger_request_id",
  "job_started_at",
  "job_finished_at",
  "records_inserted",
  "records_skipped",
  "error_message",
  "created_at",
  "updated_at"
].join(", ");

const dataProviderRunSelect = [
  "id",
  "job_run_id",
  "provider",
  "data_kind",
  "status",
  "provider_started_at",
  "provider_finished_at",
  "records_inserted",
  "records_skipped",
  "error_message",
  "created_at",
  "updated_at"
].join(", ");

function mapExchangeRateRow(row: ExchangeRateRow): ExchangeRateRecord {
  return {
    id: row.id,
    rateDate: row.rate_date,
    fromCurrency: row.from_currency,
    toCurrency: row.to_currency,
    rate: row.rate,
    rateType: row.rate_type,
    provider: row.provider,
    providerRateDate: row.provider_rate_date,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInstrumentPriceRow(row: InstrumentPriceRow): InstrumentPriceListRecord {
  return {
    id: row.id,
    instrumentId: row.instrument_id,
    instrumentName: row.instruments?.name ?? "",
    instrumentSymbol: row.instruments?.symbol ?? null,
    priceDate: row.price_date,
    closePrice: row.close_price,
    currency: row.currency,
    provider: row.provider,
    sourceSymbol: row.source_symbol,
    isAdjusted: row.is_adjusted,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapJobRunRow(row: JobRunRow): JobRun {
  return {
    id: row.id,
    jobName: row.job_name,
    status: row.status,
    triggerSource: row.trigger_source,
    triggeredByUserId: row.triggered_by_user_id,
    triggerRequestId: row.trigger_request_id,
    jobStartedAt: row.job_started_at,
    jobFinishedAt: row.job_finished_at,
    recordsInserted: row.records_inserted,
    recordsSkipped: row.records_skipped,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDataProviderRunRow(row: DataProviderRunRow): DataProviderRun {
  return {
    id: row.id,
    jobRunId: row.job_run_id,
    provider: row.provider,
    dataKind: row.data_kind,
    status: row.status,
    providerStartedAt: row.provider_started_at,
    providerFinishedAt: row.provider_finished_at,
    recordsInserted: row.records_inserted,
    recordsSkipped: row.records_skipped,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
