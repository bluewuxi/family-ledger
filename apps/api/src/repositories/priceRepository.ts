import { logDependencyError, logError } from "../utils/errorLogging";
import {
  selectLatestPriceRecordsByDistinctDates,
  type CreateInstrumentPriceInput,
  type InstrumentPriceRecord,
  type PriceRecord
} from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";
import { readAllRows } from "./readAllRows";

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
  is_estimated: boolean;
  fetched_at: string | null;
  source_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PriceForDateRow extends PriceRow {
  as_of_date: string;
}

// Mutation planning needs alternate providers/dates after removing an owned price.
export async function listPricesForTransactionWrite(instrumentIds: string[], toDate: string): Promise<Array<PriceRecord & { sourceTransactionId: string | null }>> {
  if (instrumentIds.length === 0) return [];
  const supabase = await getSupabaseAdmin();
  const { data, error } = await readAllRows(supabase.from("instrument_prices").select(priceSelect)
    .in("instrument_id", uniqueValues(instrumentIds)).lte("price_date", toDate)
    .order("id").returns<PriceRow[]>());
  if (error) { logDependencyError("priceRepository.listPricesForTransactionWrite", error, []); throw new Error("Failed to load transaction valuation prices."); }
  return data.map(row => ({ ...mapPriceRow(row), sourceTransactionId: row.source_transaction_id }));
}

export async function listLatestPrices(instruments: HeldInstrumentPriceKey[]): Promise<PriceRecord[]> {
  if (instruments.length === 0) {
    return [];
  }

  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase.rpc("latest_price_candidates", {
    // GET RPC arrays otherwise use PostgreSQL array syntax instead of JSON.
    price_keys: JSON.stringify(instruments.map(key => ({ instrument_id: key.instrumentId, currency: key.currency })))
  }, { get: true });
  if (error?.code === "PGRST202") {
    // Rolling compatibility: use the former read path until the migration is applied.
    console.info(JSON.stringify({ event: "api-timing", operation: "prices.legacyCompatibility", rows: instruments.length }));
    return (await Promise.all(instruments.map(async key => {
      const result = await supabase.from("instrument_prices").select(priceSelect)
        .eq("instrument_id", key.instrumentId).eq("currency", key.currency).order("price_date", { ascending: false }).limit(20);
      if (result.error) { logDependencyError("priceRepository.listLatestPrices.compatibility", result.error); throw new Error("Failed to list latest prices."); }
      return selectLatestPriceRecordsByDistinctDates((result.data as unknown as PriceRow[]).map(mapPriceRow), 2);
    }))).flat();
  }
  if (error) { logDependencyError("priceRepository.listLatestPrices", error); throw new Error("Failed to list latest prices."); }
  const groups = new Map<string, PriceRecord[]>();
  for (const row of (data ?? []) as PriceRow[]) {
    const key = `${row.instrument_id}:${row.currency}`;
    const records = groups.get(key) ?? [];
    records.push(mapPriceRow(row)); groups.set(key, records);
  }
  return [...groups.values()].flatMap(records => selectLatestPriceRecordsByDistinctDates(records, 2));
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
    logDependencyError("priceRepository.listLatestPricesForDates", error, []);
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
    logDependencyError("priceRepository.hasInstrumentPriceOnDate", error, []);
    throw new Error("Failed to check instrument price.");
  }

  return data !== null;
}

export async function deletePriceBySourceTransactionId(sourceTransactionId: string): Promise<void> {
  const supabase = await getSupabaseAdmin();
  const { error } = await supabase
    .from("instrument_prices")
    .delete()
    .eq("source_transaction_id", sourceTransactionId);

  if (error) {
    logDependencyError("priceRepository.deletePriceBySourceTransactionId", error, []);
    throw new Error("Failed to delete transaction-generated instrument price.");
  }
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
    logDependencyError("priceRepository.insertInstrumentPriceIfNotExists", error);
    throw new Error("Failed to insert instrument price.");
  }
  logError("priceRepository.insertInstrumentPriceIfNotExists.existing", error, "INFO");

  const { data: existing, error: existingError } = await supabase
    .from("instrument_prices")
    .select(priceSelect)
    .eq("instrument_id", row.instrument_id)
    .eq("provider", row.provider)
    .eq("price_date", row.price_date)
    .maybeSingle<PriceRow>();

  if (existingError || !existing) {
    logDependencyError("priceRepository.insertInstrumentPriceIfNotExists", existingError, []);
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
  "is_estimated",
  "fetched_at",
  "source_transaction_id",
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
    isEstimated: row.is_estimated,
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
    isEstimated: row.is_estimated,
    fetchedAt: row.fetched_at,
    sourceTransactionId: row.source_transaction_id,
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
    is_estimated: input.isEstimated ?? false,
    fetched_at: input.fetchedAt ?? null,
    source_transaction_id: input.sourceTransactionId ?? null
  };
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}
