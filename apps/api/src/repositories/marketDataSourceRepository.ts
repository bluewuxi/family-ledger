import { kernelNtaRpcArguments, type KernelNtaPlan } from "@family-ledger/shared";
import type {
  CurrencyCode,
  DataProviderRun,
  KernelPriceAnchor,
  PriceSource
} from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface KernelInstrumentRow {
  id: string;
  price_update_enabled: boolean;
}

interface KernelAnchorRow {
  proxy_value_type: "open" | "nta";
  proxy_announcement_id: number | null;
  proxy_published_at: string | null;
  derived_from_anchor_id: string | null;
  id: string;
  instrument_id: string;
  anchor_date: string;
  kernel_unit_price: string;
  proxy_symbol: string;
  proxy_currency: CurrencyCode;
  proxy_close: string;
  proxy_price_date: string;
  proxy_fetched_at: string;
  created_by_user_id: string;
  created_at: string;
}

interface ProviderRunRow {
  id: string;
  job_run_id: string;
  provider: string;
  data_kind: DataProviderRun["dataKind"];
  status: DataProviderRun["status"];
  provider_started_at: string;
  provider_finished_at: string | null;
  records_inserted: number;
  records_skipped: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export async function findKernelEstimateInstrument(): Promise<KernelInstrumentRow | null> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("instruments")
    .select("id, price_update_enabled")
    .eq("symbol", "KERNEL_SP500_UNHEDGED")
    .eq("exchange", "KERNEL")
    .maybeSingle<KernelInstrumentRow>();
  if (error) throw new Error("Failed to load the Kernel estimate instrument.");
  return data;
}

export async function countEnabledPriceTargets(priceSource: PriceSource, sourceSymbols?: string[]): Promise<number> {
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("instruments")
    .select("id", { count: "exact", head: true })
    .eq("price_source", priceSource)
    .eq("price_update_enabled", true);
  if (sourceSymbols) query = query.in("price_source_symbol", sourceSymbols);
  const { count, error } = await query;
  if (error) throw new Error("Failed to count configured market-data targets.");
  return count ?? 0;
}

export async function findLatestProviderRun(provider: string): Promise<DataProviderRun | null> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("data_provider_runs")
    .select(providerRunSelect)
    .eq("provider", provider)
    .order("provider_started_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<ProviderRunRow>();
  if (error) throw new Error("Failed to load the latest data-source run.");
  return data ? mapProviderRun(data) : null;
}

export async function listKernelPriceAnchors(): Promise<KernelPriceAnchor[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase.rpc("list_kernel_nta_anchors");
  if (error || !Array.isArray(data)) throw new Error("Failed to load Kernel price anchors.");
  return (data as KernelAnchorRow[]).map(mapKernelAnchor);
}

const providerRunSelect = [
  "id",
  "job_run_id",
  "provider",
  "data_kind",
  "status",
  "provider_started_at",
  "provider_finished_at",
  "records_inserted",
  "records_skipped",
  "error_message",
  "created_at",
  "updated_at"
].join(", ");

function mapKernelAnchor(row: KernelAnchorRow): KernelPriceAnchor {
  return {
    proxyValueType: row.proxy_value_type, proxyAnnouncementId: row.proxy_announcement_id,
    proxyPublishedAt: row.proxy_published_at, derivedFromAnchorId: row.derived_from_anchor_id,
    id: row.id,
    instrumentId: row.instrument_id,
    anchorDate: row.anchor_date,
    kernelUnitPrice: row.kernel_unit_price,
    proxySymbol: row.proxy_symbol,
    proxyCurrency: row.proxy_currency,
    proxyClose: row.proxy_close,
    proxyPriceDate: row.proxy_price_date,
    proxyFetchedAt: row.proxy_fetched_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at
  };
}

function mapProviderRun(row: ProviderRunRow): DataProviderRun {
  return {
    id: row.id,
    jobRunId: row.job_run_id,
    provider: row.provider,
    dataKind: row.data_kind,
    status: row.status,
    providerStartedAt: row.provider_started_at,
    providerFinishedAt: row.provider_finished_at,
    recordsInserted: row.records_inserted,
    recordsSkipped: row.records_skipped,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function refreshKernelNta(plan: KernelNtaPlan): Promise<{ pending_snapshot_from: string | null; refresh_token: string; changed_count: number }> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc("refresh_kernel_nta", kernelNtaRpcArguments(plan));
  if (error || !data) throw new Error("Kernel NTA atomic refresh failed.");
  return data;
}
export async function completeKernelNtaSnapshots(instrumentId: string, token: string): Promise<void> {
  const db = await getSupabaseAdmin();
  const { error } = await db.rpc("complete_kernel_nta_snapshots", { p_instrument_id: instrumentId, p_refresh_token: token });
  if (error) throw new Error("Kernel NTA snapshot completion failed.");
}
