import type { CurrencyCode, KernelPriceAnchor } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

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

export async function listKernelPriceAnchorsByInstrumentIds(instrumentIds: string[]): Promise<KernelPriceAnchor[]> {
  if (instrumentIds.length === 0) return [];
  const supabase = await getSupabaseAdmin();
  const { data: raw, error } = await supabase.rpc("list_kernel_nta_anchors");
  if (error || !Array.isArray(raw)) throw new Error("Failed to load Kernel price anchors.");
  const data = (raw as KernelAnchorRow[]).filter(a => instrumentIds.includes(a.instrument_id));
  return data.map((row) => ({
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
  }));
}
