import Decimal from "decimal.js";
import { getKernelValuationDateForNzxSession } from "@family-ledger/shared";

/** Validate reference shape after original-version checksum verification and normalization. */
export function validateKernelAnchorRestore(values: unknown[]): void {
  const anchors = values as Array<Record<string, unknown>>;
  const referenceFields = ["proxy_close", "proxy_price_date", "proxy_fetched_at", "proxy_announcement_id", "proxy_published_at"];
  for (const anchor of anchors) {
    const price = new Decimal(String(anchor.kernel_unit_price));
    if (!price.isFinite() || price.lte(0)) throw new Error("Invalid Kernel actual price.");
    if (anchor.actual_price_precision !== null && anchor.actual_price_precision !== undefined
      && (!Number.isInteger(anchor.actual_price_precision) || Number(anchor.actual_price_precision) < 0
        || Number(anchor.actual_price_precision) > 10 || price.decimalPlaces() > Number(anchor.actual_price_precision))) {
      throw new Error("Invalid Kernel actual precision.");
    }
    if (anchor.proxy_value_type === "pending") {
      if (referenceFields.some(field => anchor[field] !== null) || anchor.derived_from_anchor_id !== null
        || typeof anchor.actual_source !== "string" || !anchor.actual_source.trim() || anchor.actual_source.length > 200
        || !Number.isInteger(anchor.actual_price_precision)) throw new Error("Invalid Kernel pending reference.");
    } else if (anchor.proxy_value_type === "nta") {
      if (referenceFields.some(field => anchor[field] === null || anchor[field] === undefined)
        || !new Decimal(String(anchor.proxy_close)).isPositive()
        || !Number.isSafeInteger(anchor.proxy_announcement_id) || Number(anchor.proxy_announcement_id) <= 0
        || !Number.isFinite(Date.parse(String(anchor.proxy_published_at)))
        || getKernelValuationDateForNzxSession(String(anchor.proxy_price_date)) !== anchor.anchor_date) {
        throw new Error("Invalid Kernel NTA reference.");
      }
    } else if (anchor.proxy_value_type !== "open") throw new Error("Unknown Kernel reference type.");
    if (anchor.derived_from_anchor_id) {
      const root = anchors.find(row => row.id === anchor.derived_from_anchor_id);
      if (!root || root.derived_from_anchor_id || anchor.proxy_value_type !== "nta"
        || root.instrument_id !== anchor.instrument_id || root.anchor_date !== anchor.anchor_date
        || !new Decimal(String(root.kernel_unit_price)).eq(price) || root.created_by_user_id !== anchor.created_by_user_id) {
        throw new Error("Invalid Kernel derived reference root.");
      }
    }
  }
}
