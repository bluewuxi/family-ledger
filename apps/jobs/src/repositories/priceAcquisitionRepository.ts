import type { CreateInstrumentPriceInput, CurrencyCode } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

export interface PriceAcquisitionIdentity {
  source: string;
  instrumentId: string;
  queryKind: "latest_quote" | "daily_history";
  targetDate?: string;
}
export interface PriceAcquisitionLease extends PriceAcquisitionIdentity {
  targetDate: string;
  leaseToken: string;
  attempts: number;
}
export interface DuePriceGap extends PriceAcquisitionIdentity {
  targetDate: string;
  sourceSymbol: string;
  currency: CurrencyCode;
  sourceExchange: string | null;
}
interface AcquisitionRow {
  source: string; instrument_id: string; query_kind: "latest_quote" | "daily_history";
  target_date: string; lease_token: string; attempts: number;
}
function identity(input: PriceAcquisitionIdentity) {
  if (input.queryKind === "daily_history" && !input.targetDate) throw new Error("Historical acquisition date is required.");
  return { source: input.source, instrument_id: input.instrumentId, query_kind: input.queryKind, target_date: input.targetDate ?? "1970-01-01" };
}
export async function ensurePriceAcquisition(input: PriceAcquisitionIdentity): Promise<void> {
  const db = await getSupabaseAdmin();
  const { error } = await db.rpc("ensure_price_acquisition", identity(input));
  if (error) throw new Error("Failed to queue price acquisition.");
}
export async function claimPriceAcquisition(input: PriceAcquisitionIdentity & { leaseSeconds?: number; force?: boolean }): Promise<PriceAcquisitionLease | null> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc("claim_price_acquisition", { ...identity(input), lease_seconds: input.leaseSeconds ?? 120, force_retry: input.force ?? false }).returns<AcquisitionRow[]>();
  if (error) throw new Error("Failed to claim price acquisition.");
  const row = Array.isArray(data) ? data[0] as AcquisitionRow | undefined : undefined;
  return row ? { source: row.source, instrumentId: row.instrument_id, queryKind: row.query_kind, targetDate: row.target_date, leaseToken: row.lease_token, attempts: row.attempts } : null;
}
export async function completePriceAcquisition(input: {
  leaseToken: string; status: "success" | "unavailable" | "unsupported" | "failed";
  reason?: string; retryAfterSeconds?: number; prices?: CreateInstrumentPriceInput[];
}): Promise<boolean> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc("complete_price_acquisition", { lease_token: input.leaseToken, outcome: input.status, reason: input.reason ?? null, retry_after_seconds: input.retryAfterSeconds ?? 0, prices: input.prices ?? [] });
  if (error) throw new Error("Failed to save price acquisition outcome.");
  return data === true;
}
/** Old unresolved dates cannot monopolize later work: cooldown is applied in SQL. */
export async function listDuePriceGaps(input: { throughDate: string; limit: number }): Promise<DuePriceGap[]> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc("list_due_price_gaps", { through_date: input.throughDate, batch_limit: input.limit }).returns<Array<{
    source: string; instrument_id: string; target_date: string; source_symbol: string; currency: CurrencyCode; source_exchange: string | null;
  }>>();
  if (error) throw new Error("Failed to list due price gaps.");
  const rows = (Array.isArray(data) ? data : []) as Array<{ source: string; instrument_id: string; target_date: string; source_symbol: string; currency: CurrencyCode; source_exchange: string | null }>;
  return rows.map(row => ({ source: row.source, instrumentId: row.instrument_id, queryKind: "daily_history", targetDate: row.target_date, sourceSymbol: row.source_symbol, currency: row.currency, sourceExchange: row.source_exchange }));
}

export async function countUnresolvedPriceGaps(input: { throughDate: string }): Promise<{ pending: number; needsAttention: number }> {
  const db = await getSupabaseAdmin();
  const count = async (statuses: string[]) => {
    const { count: total, error } = await db.from("price_acquisition_state").select("source", { count: "exact", head: true })
      .eq("query_kind", "daily_history").lte("target_date", input.throughDate).in("status", statuses);
    if (error) throw new Error("Failed to count unresolved price gaps.");
    return total ?? 0;
  };
  const [pending, needsAttention] = await Promise.all([count(["pending", "retry"]), count(["needs_attention"])]);
  return { pending, needsAttention };
}

export async function retryHistoricalPriceGaps(): Promise<void> {
  const db = await getSupabaseAdmin();
  const { error } = await db.rpc("retry_historical_price_gaps");
  if (error) throw new Error("Failed to request historical price retry.");
}
