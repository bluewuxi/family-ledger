import type { InvestmentErrorDetails } from "@family-ledger/shared";
import { i18n } from "./instance";
import { formatCalendarDate } from "../lib/timeFormat";
import type { UiLanguage } from "./language";
export const investmentErrorKeys = {
  "FIELD_REQUIRED": "errors.fieldRequired",
  "FIELD_INVALID": "errors.fieldInvalid",
  "FIELD_TOO_LONG": "errors.fieldTooLong",
  "DECIMAL_INVALID": "errors.decimalInvalid",
  "DECIMAL_PRECISION": "errors.decimalPrecision",
  "POSITIVE_AMOUNT_REQUIRED": "errors.positiveAmount",
  "ACCOUNT_IN_USE": "errors.accountInUse",
  "INSTRUMENT_IN_USE": "errors.instrumentInUse",
  "INSTRUMENT_DUPLICATE": "errors.instrumentDuplicate",
  "CLASSIFIED_INSTRUMENT_CASH": "errors.classifiedCash",
  "LEGACY_EDUCATION_READ_ONLY": "errors.legacyEducation",
  "OPENING_BALANCE_EXISTS": "errors.openingExists",
  "INACTIVE_INSTRUMENT": "errors.inactiveInstrument",
  "MISSING_CASH_INSTRUMENT": "errors.missingCash",
  "INACTIVE_CASH_INSTRUMENT": "errors.inactiveCash",
  "CURRENCY_MISMATCH": "errors.currencyMismatch",
  "INSUFFICIENT_CASH": "errors.insufficientCash",
  "INSUFFICIENT_POSITION": "errors.insufficientPosition",
  "GENERATED_CASH_READ_ONLY": "errors.generatedCash",
  "TRANSACTION_TYPE_IMMUTABLE": "errors.immutableType",
  "SETTLEMENT_BEFORE_TRADE": "errors.settlementBeforeTrade",
  "DIVIDEND_TAX_EXCEEDS_GROSS": "errors.dividendTax",
  "SETTLEMENT_AMOUNT_INVALID": "errors.invalidSettlement",
  "INVALID_OPERATION_ID": "errors.invalidOperation",
  "IDEMPOTENCY_CONFLICT": "errors.idempotencyConflict",
  "LEDGER_REVISION_CONFLICT": "errors.revisionConflict",
  "REFERENCE_UNAVAILABLE": "errors.referenceUnavailable",
  "SNAPSHOT_RECALCULATION_FAILED": "errors.snapshotFailed",
  "EXTRA_PASSWORD_NOT_INITIALIZED": "errors.gateNotInitialized",
  "EXTRA_PASSWORD_REJECTED": "errors.gateRejected",
  "INVALID_REPORT_MONTH": "errors.invalidMonth",
  "FUTURE_REPORT_MONTH": "errors.futureMonth",
  "CASH_INSTRUMENT_REQUIRED": "errors.cashRequired",
  "NONCASH_INSTRUMENT_REQUIRED": "errors.noncashRequired",
  "INSTRUMENT_IDENTITY_REQUIRED": "errors.identityRequired",
  "TRANSACTION_WRITE_ROLLED_BACK": "errors.writeRolledBack",
  "MISSING_SETTLEMENT_FX": "errors.settlementFx"
} as const satisfies Record<InvestmentErrorDetails["reason"], string>;
export function translateInvestmentError(details: InvestmentErrorDetails, language: UiLanguage): string {
 const t = i18n.getFixedT(language,"investment");
 const field = "field" in details ? t(`fieldLabels.${details.field}`) : t("field");
 switch (details.reason) {
 case "FIELD_REQUIRED": return t("errors.fieldRequired", {field});
 case "FIELD_INVALID": return t("errors.fieldInvalid", {field});
 case "DECIMAL_INVALID": return t("errors.decimalInvalid", {field});
 case "POSITIVE_AMOUNT_REQUIRED": return t("errors.positiveAmount", {field});
 case "FIELD_TOO_LONG": return t("errors.fieldTooLong", {field,limit:details.limit});
 case "DECIMAL_PRECISION": return t("errors.decimalPrecision", {field,scale:details.scale});
 case "INSUFFICIENT_CASH": return t("errors.insufficientCash", {date:formatCalendarDate(details.date,"-",language)});
 case "INSUFFICIENT_POSITION": return t("errors.insufficientPosition", {date:formatCalendarDate(details.date,"-",language)});
 case "MISSING_SETTLEMENT_FX": return t("errors.settlementFx", {...details,date:formatCalendarDate(details.date,"-",language)});
 default: return t(investmentErrorKeys[details.reason]);
 }
}

export type InvestmentMessage =
 | { kind: "transaction"; key: "chooseBank" | "invalidCash" | "insufficientCash" | "insufficientPosition" | "balanceNotReady" | "generatedReadOnly" | "selectInstrument" | "unresolved" | "invalidForm" }
 | { kind: "transaction"; key: "missingCash" | "duplicateCash"; currency: string };
export function translateInvestmentMessage(message: InvestmentMessage, language: UiLanguage): string {
 const t = i18n.getFixedT(language,"transactions");
 return "currency" in message ? t(message.key, {currency:message.currency}) : t(message.key);
}
export class InvestmentMessageError extends Error {
 constructor(public readonly notice: InvestmentMessage) { super("Investment input requires attention."); }
}
