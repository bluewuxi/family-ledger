import { logDependencyError } from "../utils/errorLogging";
import type { ApiErrorGroup, ApiErrorTrackingStatus } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

export interface ErrorObservation {
  fingerprint: string; summary: string; method: string; path: string; operation: string; error_code: string | null;
  log_group: string; log_stream: string; event_id: string; occurred_at: string; request_id: string | null; legacy: boolean;
}
interface GroupRow {
  id: string; fingerprint: string; summary: string; method: string; path: string; operation: string; error_code: string | null;
  first_seen_at: string; last_seen_at: string; observed_count: number; status: ApiErrorTrackingStatus;
  resolved_at: string | null; recurring: boolean; notes: string; updated_at: string; updated_by: string | null;
}
export interface ErrorEventRow { log_group: string; log_stream: string; event_id: string; occurred_at: string; request_id: string | null; legacy: boolean; }
function check(operation: string, error: unknown): void {
  if (error) { logDependencyError(`apiErrorRepository.${operation}`, error); throw new Error("Failed to access error tracking records."); }
}
function mapGroup(row: GroupRow): ApiErrorGroup {
  return { id: row.id, fingerprint: row.fingerprint, summary: row.summary, method: row.method, path: row.path,
    operation: row.operation, errorCode: row.error_code, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at,
    observedCount: row.observed_count, status: row.status, resolvedAt: row.resolved_at, recurring: row.recurring,
    notes: row.notes, updatedAt: row.updated_at, updatedBy: row.updated_by };
}
export async function observeApiErrors(events: ErrorObservation[]): Promise<number> {
  if (!events.length) return 0;
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc("observe_api_errors", { events });
  check("observe", error);
  return Number(data);
}
export async function listApiErrors(input: { from?: string; to?: string; path?: string; status?: ApiErrorTrackingStatus; offset: number; limit: number }) {
  const db = await getSupabaseAdmin();
  let query = db.from("api_error_groups").select("*", { count: "exact" });
  if (input.from) query = query.gte("last_seen_at", input.from);
  if (input.to) query = query.lte("first_seen_at", input.to);
  if (input.path) query = query.eq("path", input.path);
  if (input.status) query = query.eq("status", input.status);
  const { data, error, count } = await query.order("last_seen_at", { ascending: false }).order("id")
    .range(input.offset, input.offset + input.limit - 1).returns<GroupRow[]>();
  check("list", error);
  return { items: (data ?? []).map(mapGroup), total: count ?? 0 };
}
export async function findApiError(id: string): Promise<ApiErrorGroup | null> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.from("api_error_groups").select("*").eq("id", id).maybeSingle<GroupRow>();
  check("find", error);
  return data ? mapGroup(data) : null;
}
export async function updateApiError(id: string, status: ApiErrorTrackingStatus, notes: string, actor: string): Promise<void> {
  const db = await getSupabaseAdmin();
  const { error } = await db.rpc("update_api_error_status", { target_id: id, new_status: status, new_notes: notes, actor_id: actor });
  check("update", error);
}
export async function listApiErrorEvents(id: string, offset: number, limit: number) {
  const db = await getSupabaseAdmin();
  const { data, error, count } = await db.from("api_error_events").select("*", { count: "exact" }).eq("group_id", id)
    .order("occurred_at", { ascending: false }).order("event_id").range(offset, offset + limit - 1).returns<ErrorEventRow[]>();
  check("events", error);
  return { items: data ?? [], total: count ?? 0 };
}
