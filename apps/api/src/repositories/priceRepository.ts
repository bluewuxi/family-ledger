import {
  selectLatestPriceRecordsByDistinctDates,
  type CreateInstrumentPriceInput,
  type InstrumentPriceRecord,
  type PriceRecord
} from "@family-ledger/shared";
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
  provider: string;
  source_symbol: string | null;
  is_adjusted: boolean;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PriceForDateRow extends PriceRow {
  as_of_date: string;
}

export async function listLatestPrices(instruments: HeldInstrumentPriceKey[]): Promise<PriceRecord[]> {
  if (instruments.length === 0) {
    return [];
  }

  const supabase = await getSupabaseAdmin();
  const results = await Promise.all(
    instruments.map(async ({ instrumentId, currency }) => {
      const { data, error } = await supabase
        .from("instrument_prices")
        .select(priceSelect)
        .eq("instrument_id", instrumentId)
        .eq("currency", currency)
        .order("price_date", { ascending: false })
        .limit(20);

      if (error) {
        throw new Error("Failed to list latest prices.");
      }

      return selectLatestPriceRecordsByDistinctDates((data as unknown as PriceRow[]).map(mapPriceRow), 2);
    })
  );

  return results.flat();
}

export async function listPricesUntil(priceDate: string): Promise<PriceRecord[]> {
  return listLatestPricesForDates([priceDate]);
}

export async function listLatestPricesForDates(
  asOfDates: string[],
  instrumentIds: string[] = []
): Promise<PriceRecord[]> {
  const uniqueDates = uniqueValues(asOfDates);

  if (uniqueDates.length === 0) {
    return [];
  }

  const supabase = await getSupabaseAdmin();
  const uniqueInstrumentIds = uniqueValues(instrumentIds);
  const { data, error } = await supabase.rpc("latest_instrument_prices_for_dates", {
    as_of_dates: uniqueDates,
    instrument_ids: uniqueInstrumentIds.length > 0 ? uniqueInstrumentIds : null
  });

  if (error) {
    throw new Error("Failed to list snapshot prices.");
  }

  return ((data ?? []) as unknown as PriceForDateRow[]).map(mapPriceRow);
}

export async function hasInstrumentPriceOnDate(input: {
  instrumentId: string;
  priceDate: string;
  currency: PriceRecord["currency"];
}): Promise<boolean> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("instrument_prices")
    .select("id")
    .eq("instrument_id", input.instrumentId)
    .eq("price_date", input.priceDate)
    .eq("currency", input.currency)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error("Failed to check instrument price.");
  }

  return data !== null;
}

export async function insertInstrumentPriceIfNotExists(
  input: CreateInstrumentPriceInput
): Promise<InstrumentPriceRecord> {
  const supabase = await getSupabaseAdmin();
  const row = toInstrumentPriceInsertRow(input);
  const { data, error } = await supabase
    .from("instrument_prices")
    .insert(row)
    .select(priceSelect)
    .single<PriceRow>();

  if (!error) {
    return mapInstrumentPriceRow(data);
  }

  if (error.code !== "23505") {
    throw new Error("Failed to insert instrument price.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("instrument_prices")
    .select(priceSelect)
    .eq("instrument_id", row.instrument_id)
    .eq("provider", row.provider)
    .eq("price_date", row.price_date)
    .maybeSingle<PriceRow>();

  if (existingError || !existing) {
    throw new Error("Failed to find existing instrument price.");
  }

  return mapInstrumentPriceRow(existing);
}

const priceSelect = [
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
  "updated_at"
].join(", ");

function mapPriceRow(row: PriceRow): PriceRecord {
  return {
    id: row.id,
    instrumentId: row.instrument_id,
    priceDate: row.price_date,
    closePrice: row.close_price,
    currency: row.currency,
    source: row.provider,
    sourceSymbol: row.source_symbol,
    isAdjusted: row.is_adjusted,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInstrumentPriceRow(row: PriceRow): InstrumentPriceRecord {
  return {
    id: row.id,
    instrumentId: row.instrument_id,
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

function toInstrumentPriceInsertRow(input: CreateInstrumentPriceInput) {
  return {
    instrument_id: input.instrumentId,
    price_date: input.priceDate,
    close_price: input.closePrice,
    currency: input.currency,
    provider: input.provider,
    source_symbol: input.sourceSymbol ?? null,
    is_adjusted: input.isAdjusted ?? false,
    fetched_at: input.fetchedAt ?? null
  };
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}
