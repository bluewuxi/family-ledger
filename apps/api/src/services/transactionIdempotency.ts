import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { ApiRequestError } from "../utils/apiError";

export interface TransactionCreateIntent { key: string; fingerprint: string }
export function transactionCreateIntent(key: string | undefined, input: Record<string, unknown>): TransactionCreateIntent {
  if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new ApiRequestError("VALIDATION_ERROR", "请刷新页面后重试，交易请求缺少有效的操作编号。", 400);
  }
  const numeric = new Set(["quantity", "price", "grossAmount", "fee", "tax"]);
  const fields = ["accountId", "instrumentId", "transactionType", "tradeDate", "settlementDate", "quantity", "price", "grossAmount", "fee", "tax", "currency", "adjustmentDirection", "notes"];
  const canonical = Object.fromEntries(fields.map(field => {
    let value = input[field] ?? (field === "fee" || field === "tax" ? "0" : null);
    if (typeof value === "string") {
      value = value.trim() || null;
      if (value === null && (field === "fee" || field === "tax")) value = "0";
      if (numeric.has(field) && typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) value = new Decimal(value).toString();
    }
    return [field, value];
  }));
  return { key, fingerprint: createHash("sha256").update(JSON.stringify(canonical)).digest("hex") };
}
