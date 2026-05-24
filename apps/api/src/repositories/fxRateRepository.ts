import Decimal from "decimal.js";
import type { CreateExchangeRateInput, CurrencyCode, ExchangeRateRecord, FxRateRecord } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface FxRateRow {
  id: string;
  from_currency: FxRateRecord["fromCurrency"];
  to_currency: FxRateRecord["toCurrency"];
  rate_date: string;
  rate: string;
  rate_type: ExchangeRateRecord["rateType"];
  provider: string;
  provider_rate_date: string | null;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listLatestFxRates(fromCurrencies: CurrencyCode[]): Promise<FxRateRecord[]> {
  if (fromCurrencies.length === 0) {
    return [];
  }

  const nzdRateToUsd = await findLatestValuationRateToUsd("NZD");

  if (!nzdRateToUsd) {
    return [];
  }

  const results = await Promise.all(
    fromCurrencies.map(async (fromCurrency) => {
      const sourceRateToUsd =
        fromCurrency === "USD" ? usdSelfRate(nzdRateToUsd) : await findLatestValuationRateToUsd(fromCurrency);

      if (!sourceRateToUsd) {
        return null;
      }

      return mapUsdRateToLegacyNzdRate(sourceRateToUsd, nzdRateToUsd);
    })
  );

  return results.filter((rate): rate is FxRateRecord => rate !== null);
}

export async function listLatestValuationRatesToUsd(fromCurrencies: CurrencyCode[]): Promise<ExchangeRateRecord[]> {
  const uniqueCurrencies = [...new Set(fromCurrencies)].filter((currency) => currency !== "USD");

  if (uniqueCurrencies.length === 0) {
    return [];
  }

  const results = await Promise.all(uniqueCurrencies.map((currency) => findLatestValuationRateToUsd(currency)));
  return results.filter((rate): rate is ExchangeRateRecord => rate !== null);
}

export async function insertExchangeRateIfNotExists(
  input: CreateExchangeRateInput
): Promise<ExchangeRateRecord> {
  const supabase = await getSupabaseAdmin();
  const row = toExchangeRateInsertRow(input);
  const { data, error } = await supabase
    .from("exchange_rates")
    .insert(row)
    .select(fxRateSelect)
    .single<FxRateRow>();

  if (!error) {
    return mapExchangeRateRow(data);
  }

  if (error.code !== "23505") {
    throw new Error("Failed to insert exchange rate.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("exchange_rates")
    .select(fxRateSelect)
    .eq("from_currency", row.from_currency)
    .eq("to_currency", row.to_currency)
    .eq("rate_type", row.rate_type)
    .eq("provider", row.provider)
    .eq("rate_date", row.rate_date)
    .maybeSingle<FxRateRow>();

  if (existingError || !existing) {
    throw new Error("Failed to find existing exchange rate.");
  }

  return mapExchangeRateRow(existing);
}

const fxRateSelect = [
  "id",
  "from_currency",
  "to_currency",
  "rate_date",
  "rate",
  "rate_type",
  "provider",
  "provider_rate_date",
  "fetched_at",
  "created_at",
  "updated_at"
].join(", ");

async function findLatestValuationRateToUsd(fromCurrency: CurrencyCode): Promise<ExchangeRateRecord | null> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("exchange_rates")
    .select(fxRateSelect)
    .eq("from_currency", fromCurrency)
    .eq("to_currency", "USD")
    .eq("rate_type", "valuation")
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle<FxRateRow>();

  if (error) {
    throw new Error("Failed to list latest FX rates.");
  }

  return data ? mapExchangeRateRow(data) : null;
}

function mapUsdRateToLegacyNzdRate(
  sourceRateToUsd: ExchangeRateRecord,
  nzdRateToUsd: ExchangeRateRecord
): FxRateRecord {
  return {
    id: sourceRateToUsd.id,
    fromCurrency: sourceRateToUsd.fromCurrency,
    toCurrency: "NZD",
    rateDate: sourceRateToUsd.rateDate,
    rate: new Decimal(sourceRateToUsd.rate).dividedBy(nzdRateToUsd.rate).toFixed(10),
    source: sourceRateToUsd.provider,
    createdAt: sourceRateToUsd.createdAt,
    updatedAt: sourceRateToUsd.updatedAt
  };
}

function usdSelfRate(nzdRateToUsd: ExchangeRateRecord): ExchangeRateRecord {
  return {
    ...nzdRateToUsd,
    fromCurrency: "USD",
    rate: "1"
  };
}

function mapExchangeRateRow(row: FxRateRow): ExchangeRateRecord {
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
