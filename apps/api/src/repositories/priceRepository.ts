import type { PriceRecord } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface HeldInstrumentPriceKey {
  instrumentId: string;
  currency: PriceRecord["currency"];
}

interface PriceRow {
  id: string;
  instrument_id: string;
  price_date: string;
  close_price: string;
  currency: PriceRecord["currency"];
  source: string | null;
  source_symbol: string | null;
  is_adjusted: boolean;
  created_at: string;
  updated_at: string;
}

export async function listLatestPrices(instruments: HeldInstrumentPriceKey[]): Promise<PriceRecord[]> {
  if (instruments.length === 0) {
    return [];
  }

  const supabase = await getSupabaseAdmin();
  const results = await Promise.all(
    instruments.map(async ({ instrumentId, currency }) => {
      const { data, error } = await supabase
        .from("prices")
        .select(priceSelect)
        .eq("instrument_id", instrumentId)
        .eq("currency", currency)
        .order("price_date", { ascending: false })
        .limit(2);

      if (error) {
        throw new Error("Failed to list latest prices.");
      }

      return (data as unknown as PriceRow[]).map(mapPriceRow);
    })
  );

  return results.flat();
}

const priceSelect = [
  "id",
  "instrument_id",
  "price_date",
  "close_price",
  "currency",
  "source",
  "source_symbol",
  "is_adjusted",
  "created_at",
  "updated_at"
].join(", ");

function mapPriceRow(row: PriceRow): PriceRecord {
  return {
    id: row.id,
    instrumentId: row.instrument_id,
    priceDate: row.price_date,
    closePrice: row.close_price,
    currency: row.currency,
    source: row.source,
    sourceSymbol: row.source_symbol,
    isAdjusted: row.is_adjusted,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
