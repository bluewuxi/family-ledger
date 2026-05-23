import type { CurrencyCode, FxRateRecord } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface FxRateRow {
  id: string;
  from_currency: FxRateRecord["fromCurrency"];
  to_currency: FxRateRecord["toCurrency"];
  rate_date: string;
  rate: string;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export async function listLatestFxRates(fromCurrencies: CurrencyCode[]): Promise<FxRateRecord[]> {
  if (fromCurrencies.length === 0) {
    return [];
  }

  const supabase = await getSupabaseAdmin();
  const results = await Promise.all(
    fromCurrencies.map(async (fromCurrency) => {
      const { data, error } = await supabase
        .from("fx_rates")
        .select(fxRateSelect)
        .eq("from_currency", fromCurrency)
        .eq("to_currency", "NZD")
        .order("rate_date", { ascending: false })
        .limit(1)
        .maybeSingle<FxRateRow>();

      if (error) {
        throw new Error("Failed to list latest FX rates.");
      }

      return data ? mapFxRateRow(data) : null;
    })
  );

  return results.filter((rate): rate is FxRateRecord => rate !== null);
}

const fxRateSelect = [
  "id",
  "from_currency",
  "to_currency",
  "rate_date",
  "rate",
  "source",
  "created_at",
  "updated_at"
].join(", ");

function mapFxRateRow(row: FxRateRow): FxRateRecord {
  return {
    id: row.id,
    fromCurrency: row.from_currency,
    toCurrency: row.to_currency,
    rateDate: row.rate_date,
    rate: row.rate,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
