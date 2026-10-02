import type { CurrencyCode, KernelPriceAnchor } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

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

export async function listKernelPriceAnchorsByInstrumentIds(instrumentIds: string[]): Promise<KernelPriceAnchor[]> {
  if (instrumentIds.length === 0) return [];
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("kernel_price_anchors")
    .select([
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
    ].join(", "))
    .in("instrument_id", instrumentIds)
    .order("anchor_date", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<KernelAnchorRow[]>();
  if (error) throw new Error("Failed to load Kernel price anchors.");
  return data.map((row) => ({
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
