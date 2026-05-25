import type { DashboardQuoteRecord } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface DashboardQuoteRow {
  id: string;
  instrument_id: string;
  quote_date: string;
  quote_price: string;
  currency: DashboardQuoteRecord["currency"];
  provider: string;
  source_symbol: string | null;
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertDashboardQuoteInput {
  instrumentId: string;
  quoteDate: string;
  quotePrice: string;
  currency: DashboardQuoteRecord["currency"];
  provider: string;
  sourceSymbol?: string | null;
  fetchedAt: string;
}

export async function listDashboardQuotes(instrumentIds: string[]): Promise<DashboardQuoteRecord[]> {
  if (instrumentIds.length === 0) {
    return [];
  }

  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("dashboard_instrument_quotes")
    .select(dashboardQuoteSelect)
    .in("instrument_id", instrumentIds)
    .returns<DashboardQuoteRow[]>();

  if (error) {
    throw new Error("Failed to list dashboard quotes.");
  }

  return data.map(mapDashboardQuoteRow);
}

export async function upsertDashboardQuote(input: UpsertDashboardQuoteInput): Promise<DashboardQuoteRecord> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("dashboard_instrument_quotes")
    .upsert(toDashboardQuoteRow(input), { onConflict: "instrument_id,provider" })
    .select(dashboardQuoteSelect)
    .single<DashboardQuoteRow>();

  if (error) {
    throw new Error("Failed to upsert dashboard quote.");
  }

  return mapDashboardQuoteRow(data);
}

const dashboardQuoteSelect = [
  "id",
  "instrument_id",
  "quote_date",
  "quote_price",
  "currency",
  "provider",
  "source_symbol",
  "fetched_at",
  "created_at",
  "updated_at"
].join(", ");

function mapDashboardQuoteRow(row: DashboardQuoteRow): DashboardQuoteRecord {
  return {
    id: row.id,
    instrumentId: row.instrument_id,
    quoteDate: row.quote_date,
    quotePrice: row.quote_price,
    currency: row.currency,
    provider: row.provider,
    sourceSymbol: row.source_symbol,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toDashboardQuoteRow(input: UpsertDashboardQuoteInput) {
  return {
    instrument_id: input.instrumentId,
    quote_date: input.quoteDate,
    quote_price: input.quotePrice,
    currency: input.currency,
    provider: input.provider,
    source_symbol: input.sourceSymbol ?? null,
    fetched_at: input.fetchedAt
  };
}
