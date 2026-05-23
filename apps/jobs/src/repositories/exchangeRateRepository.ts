import type { CreateExchangeRateInput, CurrencyCode, ExchangeRateRecord } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

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

export interface InsertExchangeRateResult {
  record: ExchangeRateRecord;
  inserted: boolean;
}

export async function insertExchangeRateIfNotExists(
  input: CreateExchangeRateInput
): Promise<InsertExchangeRateResult> {
  const supabase = await getSupabaseAdmin();
  const row = toExchangeRateInsertRow(input);
  const { data, error } = await supabase
    .from("exchange_rates")
    .insert(row)
    .select(exchangeRateSelect)
    .single<ExchangeRateRow>();

  if (!error) {
    return { record: mapExchangeRateRow(data), inserted: true };
  }

  if (error.code !== "23505") {
    throw new Error("Failed to insert exchange rate.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("exchange_rates")
    .select(exchangeRateSelect)
    .eq("from_currency", row.from_currency)
    .eq("to_currency", row.to_currency)
    .eq("rate_type", row.rate_type)
    .eq("provider", row.provider)
    .eq("rate_date", row.rate_date)
    .maybeSingle<ExchangeRateRow>();

  if (existingError || !existing) {
    throw new Error("Failed to find existing exchange rate.");
  }

  return { record: mapExchangeRateRow(existing), inserted: false };
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

function toExchangeRateInsertRow(input: CreateExchangeRateInput) {
  return {
    rate_date: input.rateDate,
    from_currency: input.fromCurrency,
    to_currency: input.toCurrency ?? "USD",
    rate: input.rate,
    rate_type: input.rateType ?? "valuation",
    provider: input.provider,
    provider_rate_date: input.providerRateDate ?? null,
    fetched_at: input.fetchedAt ?? null
  };
}
