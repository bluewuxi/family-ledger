import type { CreateInstrumentPriceInput, CurrencyCode, InstrumentPriceRecord, PriceSource } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

export interface PriceEnabledInstrument {
  id: string;
  name: string;
  currency: CurrencyCode;
  priceSource: PriceSource;
  priceSourceSymbol: string;
  exchange: string | null;
  priceSourceExchange: string | null;
}

interface InstrumentRow {
  id: string;
  name: string;
  currency: CurrencyCode;
  price_source: PriceSource;
  price_source_symbol: string | null;
  exchange: string | null;
  price_source_exchange: string | null;
}

interface PriceRow {
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
}

export interface InsertInstrumentPriceResult {
  record: InstrumentPriceRecord;
  inserted: boolean;
}

export async function listPriceEnabledInstrumentsBySource(input: {
  priceSource: PriceSource;
  sourceSymbols?: string[];
}): Promise<PriceEnabledInstrument[]> {
  if (input.sourceSymbols && input.sourceSymbols.length === 0) {
    return [];
  }

  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("instruments")
    .select(["id", "name", "currency", "price_source", "price_source_symbol", "exchange", "price_source_exchange"].join(", "))
    .eq("price_source", input.priceSource)
    .eq("price_update_enabled", true)
    .not("price_source_symbol", "is", null)
    .order("price_update_priority", { ascending: true })
    .order("name", { ascending: true });

  if (input.sourceSymbols) {
    query = query.in("price_source_symbol", input.sourceSymbols);
  }

  const { data, error } = await query.returns<InstrumentRow[]>();

  if (error) {
    throw new Error("Failed to list price-enabled instruments.");
  }

  return data.map(mapInstrumentRow);
}

export async function insertInstrumentPriceIfNotExists(
  input: CreateInstrumentPriceInput
): Promise<InsertInstrumentPriceResult> {
  const supabase = await getSupabaseAdmin();
  const row = toInstrumentPriceInsertRow(input);
  const { data, error } = await supabase
    .from("instrument_prices")
    .insert(row)
    .select(priceSelect)
    .single<PriceRow>();

  if (!error) {
    return { record: mapInstrumentPriceRow(data), inserted: true };
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

  return { record: mapInstrumentPriceRow(existing), inserted: false };
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

function mapInstrumentRow(row: InstrumentRow): PriceEnabledInstrument {
  if (!row.price_source_symbol) {
    throw new Error("Price-enabled instrument is missing price source symbol.");
  }

  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    priceSource: row.price_source,
    priceSourceSymbol: row.price_source_symbol,
    exchange: row.exchange,
    priceSourceExchange: row.price_source_exchange
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
