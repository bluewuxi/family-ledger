import type { CreateInstrumentInput, Instrument, UpdateInstrumentInput } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface InstrumentRow {
  id: string;
  symbol: string | null;
  name: string;
  description: string | null;
  market_region: Instrument["marketRegion"];
  exchange: string | null;
  currency: Instrument["currency"];
  asset_type: Instrument["assetType"];
  isin: string | null;
  provider: string | null;
  price_source: Instrument["priceSource"];
  price_source_symbol: string | null;
  price_source_exchange: string | null;
  price_update_enabled: boolean;
  price_update_priority: number;
  source_url: string | null;
  source_checked_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export class InstrumentNotFoundError extends Error {
  constructor() {
    super("Instrument was not found.");
  }
}

export class InstrumentDuplicateError extends Error {
  constructor() {
    super("An instrument with the same market, exchange, and symbol already exists.");
  }
}

export class InstrumentInUseError extends Error {
  constructor() {
    super("Instrument cannot be deleted because it has transaction or price history.");
  }
}

export async function listInstruments(): Promise<Instrument[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("instruments")
    .select(instrumentSelect)
    .order("market_region", { ascending: true })
    .order("exchange", { ascending: true })
    .order("symbol", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Failed to list instruments.");
  }

  return (data as unknown as InstrumentRow[]).map(mapInstrumentRow);
}

export async function findInstrumentById(id: string): Promise<Instrument | null> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("instruments")
    .select(instrumentSelect)
    .eq("id", id)
    .maybeSingle<InstrumentRow>();

  if (error) {
    throw new Error("Failed to find instrument.");
  }

  return data ? mapInstrumentRow(data) : null;
}

export async function createInstrument(input: CreateInstrumentInput, userId: string): Promise<Instrument> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("instruments")
    .insert({
      ...toInstrumentRow(input),
      created_by_user_id: userId,
      updated_by_user_id: userId
    })
    .select(instrumentSelect)
    .single<InstrumentRow>();

  if (error) {
    if (error.code === "23505") {
      throw new InstrumentDuplicateError();
    }

    throw new Error("Failed to create instrument.");
  }

  return mapInstrumentRow(data);
}

export async function updateInstrument(
  id: string,
  input: UpdateInstrumentInput,
  userId: string
): Promise<Instrument> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("instruments")
    .update({
      ...toInstrumentUpdateRow(input),
      updated_by_user_id: userId
    })
    .eq("id", id)
    .select(instrumentSelect)
    .maybeSingle<InstrumentRow>();

  if (error) {
    if (error.code === "23505") {
      throw new InstrumentDuplicateError();
    }

    throw new Error("Failed to update instrument.");
  }

  if (!data) {
    throw new InstrumentNotFoundError();
  }

  return mapInstrumentRow(data);
}

export async function deleteInstrument(id: string): Promise<void> {
  const supabase = await getSupabaseAdmin();
  const [transactionReference, priceReference] = await Promise.all([
    supabase.from("transactions").select("id").eq("instrument_id", id).limit(1).maybeSingle<{ id: string }>(),
    supabase.from("instrument_prices").select("id").eq("instrument_id", id).limit(1).maybeSingle<{ id: string }>()
  ]);

  if (transactionReference.error || priceReference.error) {
    throw new Error("Failed to check instrument usage.");
  }

  if (transactionReference.data || priceReference.data) {
    throw new InstrumentInUseError();
  }

  const { data, error } = await supabase
    .from("instruments")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    if (error.code === "23503") {
      throw new InstrumentInUseError();
    }

    throw new Error("Failed to delete instrument.");
  }

  if (!data) {
    throw new InstrumentNotFoundError();
  }
}

const instrumentSelect = [
  "id",
  "symbol",
  "name",
  "description",
  "market_region",
  "exchange",
  "currency",
  "asset_type",
  "isin",
  "provider",
  "price_source",
  "price_source_symbol",
  "price_source_exchange",
  "price_update_enabled",
  "price_update_priority",
  "source_url",
  "source_checked_at",
  "created_by_user_id",
  "updated_by_user_id",
  "notes",
  "created_at",
  "updated_at"
].join(", ");

function mapInstrumentRow(row: InstrumentRow): Instrument {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    description: row.description,
    marketRegion: row.market_region,
    exchange: row.exchange,
    currency: row.currency,
    assetType: row.asset_type,
    isin: row.isin,
    provider: row.provider,
    priceSource: row.price_source,
    priceSourceSymbol: row.price_source_symbol,
    priceSourceExchange: row.price_source_exchange,
    priceUpdateEnabled: row.price_update_enabled,
    priceUpdatePriority: row.price_update_priority,
    sourceUrl: row.source_url,
    sourceCheckedAt: row.source_checked_at,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toInstrumentRow(input: CreateInstrumentInput) {
  return {
    symbol: input.symbol ?? null,
    name: input.name,
    description: input.description ?? null,
    market_region: input.marketRegion,
    exchange: input.exchange ?? null,
    currency: input.currency,
    asset_type: input.assetType,
    isin: input.isin ?? null,
    provider: input.provider ?? null,
    price_source: input.priceSource,
    price_source_symbol: input.priceSourceSymbol ?? null,
    price_source_exchange: input.priceSourceExchange ?? null,
    price_update_enabled: input.priceUpdateEnabled,
    price_update_priority: input.priceUpdatePriority,
    source_url: input.sourceUrl ?? null,
    source_checked_at: input.sourceCheckedAt ?? null,
    notes: input.notes ?? null
  };
}

function toInstrumentUpdateRow(input: UpdateInstrumentInput) {
  return {
    ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.marketRegion !== undefined ? { market_region: input.marketRegion } : {}),
    ...(input.exchange !== undefined ? { exchange: input.exchange } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    ...(input.assetType !== undefined ? { asset_type: input.assetType } : {}),
    ...(input.isin !== undefined ? { isin: input.isin } : {}),
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.priceSource !== undefined ? { price_source: input.priceSource } : {}),
    ...(input.priceSourceSymbol !== undefined ? { price_source_symbol: input.priceSourceSymbol } : {}),
    ...(input.priceSourceExchange !== undefined ? { price_source_exchange: input.priceSourceExchange } : {}),
    ...(input.priceUpdateEnabled !== undefined ? { price_update_enabled: input.priceUpdateEnabled } : {}),
    ...(input.priceUpdatePriority !== undefined ? { price_update_priority: input.priceUpdatePriority } : {}),
    ...(input.sourceUrl !== undefined ? { source_url: input.sourceUrl } : {}),
    ...(input.sourceCheckedAt !== undefined ? { source_checked_at: input.sourceCheckedAt } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {})
  };
}
