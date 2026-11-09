import type { CurrencyCode } from "./index";

/** Safe presentation facts only; never include submitted values or dependency errors. */
export const INVESTMENT_ERROR_FIELDS = [
  "request", "name", "broker", "accountType", "purpose", "baseCurrency", "marketRegion", "notes", "tradingInfo",
  "symbol", "shortName", "description", "exchange", "currency", "assetType", "isin", "provider", "priceSource",
  "priceSourceSymbol", "priceSourceExchange", "priceUpdateEnabled", "priceUpdatePriority", "sourceUrl", "sourceCheckedAt", "active",
  "accountId", "instrumentId", "transactionType", "tradeDate", "settlementDate", "quantity", "price", "grossAmount", "fee", "tax",
  "adjustmentDirection", "transactionSource", "settlementCurrency", "settlementAmount", "familyNotes", "reviewStatus",
  "extraPassword", "currentExtraPassword", "newExtraPassword", "tradingPassword", "trendRange", "recentLimit", "month"
] as const;
export type InvestmentErrorField = (typeof INVESTMENT_ERROR_FIELDS)[number];

export const INVESTMENT_SIMPLE_ERROR_REASONS = [
  "ACCOUNT_IN_USE", "INSTRUMENT_IN_USE", "INSTRUMENT_DUPLICATE", "CLASSIFIED_INSTRUMENT_CASH", "LEGACY_EDUCATION_READ_ONLY",
  "OPENING_BALANCE_EXISTS", "INACTIVE_INSTRUMENT", "GENERATED_CASH_READ_ONLY", "TRANSACTION_TYPE_IMMUTABLE",
  "SETTLEMENT_BEFORE_TRADE", "DIVIDEND_TAX_EXCEEDS_GROSS", "SETTLEMENT_AMOUNT_INVALID", "INVALID_OPERATION_ID",
  "IDEMPOTENCY_CONFLICT", "LEDGER_REVISION_CONFLICT", "REFERENCE_UNAVAILABLE", "SNAPSHOT_RECALCULATION_FAILED",
  "EXTRA_PASSWORD_NOT_INITIALIZED", "EXTRA_PASSWORD_REJECTED", "INVALID_REPORT_MONTH", "FUTURE_REPORT_MONTH",
  "CASH_INSTRUMENT_REQUIRED", "NONCASH_INSTRUMENT_REQUIRED", "INSTRUMENT_IDENTITY_REQUIRED", "TRANSACTION_WRITE_ROLLED_BACK"
] as const;
export type InvestmentErrorDetails =
  | { reason: "FIELD_REQUIRED" | "FIELD_INVALID" | "DECIMAL_INVALID" | "POSITIVE_AMOUNT_REQUIRED"; field: InvestmentErrorField }
  | { reason: "FIELD_TOO_LONG"; field: InvestmentErrorField; limit: number }
  | { reason: "DECIMAL_PRECISION"; field: InvestmentErrorField; scale: number }
  | { reason: (typeof INVESTMENT_SIMPLE_ERROR_REASONS)[number] }
  | { reason: "MISSING_CASH_INSTRUMENT" | "INACTIVE_CASH_INSTRUMENT" | "CURRENCY_MISMATCH"; currency?: CurrencyCode }
  | { reason: "INSUFFICIENT_CASH" | "INSUFFICIENT_POSITION"; date: string }
  | { reason: "MISSING_SETTLEMENT_FX"; date: string; fromCurrency: CurrencyCode; toCurrency: CurrencyCode };

const currencies = ["NZD", "USD", "HKD", "CNY", "GBP", "EUR"] as const satisfies readonly CurrencyCode[];
const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const isCurrency = (value: unknown): value is CurrencyCode => typeof value === "string" && currencies.includes(value as CurrencyCode);

/** Strictly validate both API serialization and untrusted client envelopes. */
export function parseInvestmentErrorDetails(value: unknown): InvestmentErrorDetails | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const { reason } = record;
  if (typeof reason !== "string") return undefined;
  const keys = ["reason"];
  if (["FIELD_REQUIRED", "FIELD_INVALID", "DECIMAL_INVALID", "POSITIVE_AMOUNT_REQUIRED", "FIELD_TOO_LONG", "DECIMAL_PRECISION"].includes(reason)) {
    if (!INVESTMENT_ERROR_FIELDS.includes(record.field as InvestmentErrorField)) return undefined;
    keys.push("field");
    if (reason === "FIELD_TOO_LONG" || reason === "DECIMAL_PRECISION") {
      const parameter = reason === "FIELD_TOO_LONG" ? "limit" : "scale";
      const amount = record[parameter];
      if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0 || amount > 12000) return undefined;
      keys.push(parameter);
    }
  } else if (["MISSING_CASH_INSTRUMENT", "INACTIVE_CASH_INSTRUMENT", "CURRENCY_MISMATCH"].includes(reason)) {
    if (record.currency !== undefined && !isCurrency(record.currency)) return undefined;
    keys.push("currency");
  } else if (["INSUFFICIENT_CASH", "INSUFFICIENT_POSITION"].includes(reason)) {
    if (!isDate(record.date)) return undefined;
    keys.push("date");
  } else if (reason === "MISSING_SETTLEMENT_FX") {
    if (!isDate(record.date) || !isCurrency(record.fromCurrency) || !isCurrency(record.toCurrency)) return undefined;
    keys.push("date", "fromCurrency", "toCurrency");
  } else if (!INVESTMENT_SIMPLE_ERROR_REASONS.includes(reason as (typeof INVESTMENT_SIMPLE_ERROR_REASONS)[number])) return undefined;
  if (Object.keys(record).some(key => !keys.includes(key))) return undefined;
  return { ...record } as InvestmentErrorDetails;
}

/** Parser helpers receive only internal field identifiers, never field contents. */
export function investmentFieldDetails(reason: "FIELD_REQUIRED" | "FIELD_INVALID" | "DECIMAL_INVALID" | "POSITIVE_AMOUNT_REQUIRED", field: string): { reason: "FIELD_REQUIRED" | "FIELD_INVALID" | "DECIMAL_INVALID" | "POSITIVE_AMOUNT_REQUIRED"; field: InvestmentErrorField } {
  return { reason, field: INVESTMENT_ERROR_FIELDS.includes(field as InvestmentErrorField) ? field as InvestmentErrorField : "request" };
}
