import { getSupabaseAdmin } from "../db/supabaseServer";

export interface PriceAcquisitionIdentity {
  source: string; instrumentId: string; queryKind: "latest_quote" | "daily_history"; targetDate?: string;
}
export interface PriceAcquisitionLease extends PriceAcquisitionIdentity { leaseToken: string; targetDate: string; attempts: number; }
export async function claimDashboardQuoteBatch(input: { source: string; instrumentIds: string[]; force?: boolean }): Promise<PriceAcquisitionLease[]> {
  if (!input.instrumentIds.length) return [];
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc("claim_dashboard_quote_batch", { source: input.source, instrument_ids: input.instrumentIds, force_retry: input.force ?? false });
  if (error || !Array.isArray(data)) throw new Error("Failed to claim quote batch.");
  return (data as Array<{ instrument_id: string; target_date: string; lease_token: string; attempts: number }>).map(row => ({ source: input.source, instrumentId: row.instrument_id, queryKind: "latest_quote", targetDate: row.target_date, leaseToken: row.lease_token, attempts: row.attempts }));
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
  const { data, error } = await db.rpc("claim_price_acquisition", { ...identity(input), lease_seconds: input.leaseSeconds ?? 120, force_retry: input.force ?? false }).returns<Array<{ source: string; instrument_id: string; query_kind: "latest_quote" | "daily_history"; target_date: string; lease_token: string; attempts: number }>>();
  if (error) throw new Error("Failed to claim price acquisition.");
  const row = Array.isArray(data) ? data[0] as { source: string; instrument_id: string; query_kind: "latest_quote" | "daily_history"; target_date: string; lease_token: string; attempts: number } | undefined : undefined;
  return row ? { source: row.source, instrumentId: row.instrument_id, queryKind: row.query_kind, targetDate: row.target_date, leaseToken: row.lease_token, attempts: row.attempts } : null;
}
export async function completePriceAcquisition(input: { leaseToken: string; status: "success" | "unavailable" | "unsupported" | "failed"; reason?: string; retryAfterSeconds?: number }): Promise<boolean> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc("complete_price_acquisition", { lease_token: input.leaseToken, outcome: input.status, reason: input.reason ?? null, retry_after_seconds: input.retryAfterSeconds ?? 0, prices: [] });
  if (error) throw new Error("Failed to save price acquisition outcome.");
  return data === true;
}

export async function listPriceAcquisitionDueTimes(input: { source: string; instrumentIds: string[]; queryKind: "latest_quote" | "daily_history" }): Promise<Array<{ instrumentId: string; nextAttemptAt: string | null; status: string }>> {
  if (!input.instrumentIds.length) return [];
  const db = await getSupabaseAdmin();
  const { data, error } = await db.from("price_acquisition_state").select("instrument_id,next_attempt_at,status")
    .eq("source", input.source).eq("query_kind", input.queryKind).in("instrument_id", input.instrumentIds)
    .returns<Array<{ instrument_id: string; next_attempt_at: string | null; status: string }>>();
  if (error) throw new Error("Failed to read price acquisition due times.");
  const { data: cooling, error: coolingError } = await db.from("price_acquisition_state").select("next_attempt_at")
    .eq("source", input.source).eq("reason", "SOURCE_COOLDOWN").gt("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: false }).limit(1).returns<Array<{ next_attempt_at: string }>>();
  if (coolingError) throw new Error("Failed to read source cooldown.");
  const cooldown = cooling?.[0]?.next_attempt_at;
  return input.instrumentIds.flatMap(instrumentId => {
    const row = data?.find(item => item.instrument_id === instrumentId);
    if (!row && !cooldown) return [];
    const nextAttemptAt = cooldown && (!row?.next_attempt_at || cooldown > row.next_attempt_at) ? cooldown : row?.next_attempt_at ?? null;
    return [{ instrumentId, nextAttemptAt, status: row?.status ?? "retry" }];
  });
}
