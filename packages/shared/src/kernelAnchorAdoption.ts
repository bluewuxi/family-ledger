import Decimal from "decimal.js";
import type { CreateKernelPriceAnchorInput } from "./index";

export interface KernelAnchorAdoptionCandidate extends Required<CreateKernelPriceAnchorInput> {
  instrumentId: string;
  priceId: string;
}
export interface KernelAnchorAdoptionExport {
  instruments: Array<Record<string, unknown>>;
  instrument_prices: Array<Record<string, unknown>>;
  kernel_price_anchors: Array<Record<string, unknown>>;
}

/** Read-only preparation from exact local exports. This never connects to a database. */
export function prepareKernelAnchorAdoption(data: KernelAnchorAdoptionExport, candidates: KernelAnchorAdoptionCandidate[]) {
  const seen = new Set<string>();
  return candidates.map(candidate => {
    const target = data.instruments.find(row => row.id === candidate.instrumentId);
    if (!target || target.exchange !== "KERNEL" || target.currency !== "NZD" || target.price_source !== "kernel_estimate"
      || target.price_source_symbol !== "USF.NZ" || target.price_source_exchange !== "NZX") throw new Error("Invalid configured Kernel target.");
    const price = data.instrument_prices.find(row => row.id === candidate.priceId);
    if (!price || price.provider !== "Kernel Anchor" || price.is_estimated !== false) throw new Error("Missing or protected existing actual price.");
    if (data.instrument_prices.some(row => row.instrument_id === candidate.instrumentId && row.price_date === candidate.anchorDate
      && row.provider === "manual" && !new Decimal(String(row.close_price)).eq(candidate.kernelUnitPrice))) {
      throw new Error("Existing manual price conflict.");
    }
    if (price.instrument_id !== candidate.instrumentId || price.price_date !== candidate.anchorDate
      || typeof price.close_price !== "string" || !new Decimal(price.close_price).eq(candidate.kernelUnitPrice)
      || new Decimal(price.close_price).decimalPlaces() > candidate.actualPricePrecision) throw new Error("Existing actual price conflict.");
    const date = new Date(`${candidate.anchorDate}T00:00Z`);
    const value = new Decimal(candidate.kernelUnitPrice);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== candidate.anchorDate
      || !value.isFinite() || value.lte(0) || !Number.isInteger(candidate.actualPricePrecision)
      || candidate.actualPricePrecision < value.decimalPlaces() || candidate.actualPricePrecision > 10
      || !candidate.actualSource.trim() || candidate.actualSource.length > 200) throw new Error("Invalid actual anchor evidence.");
    const exists = data.kernel_price_anchors.some(row => row.instrument_id === candidate.instrumentId
      && row.anchor_date === candidate.anchorDate && !row.derived_from_anchor_id
      && new Decimal(String(row.kernel_unit_price)).eq(value));
    const duplicate = seen.has(candidate.priceId); seen.add(candidate.priceId);
    return { ...candidate, existingPriceId: candidate.priceId, action: exists || duplicate ? "already_present" as const : "prepare_actual_root" as const };
  });
}
