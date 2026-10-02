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

export interface KernelEstimateWrite {
  priceDate: string;
  closePrice: string;
  fetchedAt: string;
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
  const { data, error } = await supabase
    .from("kernel_price_anchors")
    .select(kernelAnchorSelect)
    .order("anchor_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .returns<KernelAnchorRow[]>();
  if (error) throw new Error("Failed to load Kernel price anchors.");
  return data.map(mapKernelAnchor);
}

export async function saveKernelPriceAnchor(input: {
  instrumentId: string;
  anchorDate: string;
  kernelUnitPrice: string;
  proxySymbol: string;
  proxyCurrency: CurrencyCode;
  proxyClose: string;
  proxyPriceDate: string;
  proxyFetchedAt: string;
  createdByUserId: string;
  estimates: KernelEstimateWrite[];
}): Promise<KernelPriceAnchor> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase.rpc("save_kernel_price_anchor", {
    p_target_instrument_id: input.instrumentId,
    p_anchor_date: input.anchorDate,
    p_kernel_unit_price: input.kernelUnitPrice,
    p_proxy_symbol: input.proxySymbol,
    p_proxy_currency: input.proxyCurrency,
    p_proxy_close: input.proxyClose,
    p_proxy_price_date: input.proxyPriceDate,
    p_proxy_fetched_at: input.proxyFetchedAt,
    p_created_by_user_id: input.createdByUserId,
    p_estimates: input.estimates.map((estimate) => ({
      price_date: estimate.priceDate,
      close_price: estimate.closePrice,
      fetched_at: estimate.fetchedAt
    }))
  });
  if (error || !data) throw new Error("Failed to save the Kernel price anchor.");
  const row = (Array.isArray(data) ? data[0] : data) as KernelAnchorRow | undefined;
  if (!row) throw new Error("Kernel price anchor save returned no row.");
  return mapKernelAnchor(row);
}

const kernelAnchorSelect = [
  "id",
  "instrument_id",
  "anchor_date",
  "kernel_unit_price",
  "proxy_symbol",
  "proxy_currency",
  "proxy_close",
  "proxy_price_date",
  "proxy_fetched_at",
  "created_by_user_id",
  "created_at"
].join(", ");

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
