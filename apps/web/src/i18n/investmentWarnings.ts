import type { DashboardWarning, HoldingWarning, SnapshotWarning, PortfolioTrendWarning, MonthlySummaryWarning, AccountDetailWarning } from "@family-ledger/shared";
import { holdingsCopy as copy } from "./investmentCopy";
import { formatCalendarDate } from "../lib/timeFormat";
import type { UiLanguage } from "./language";
const holdingKeys = { NEGATIVE_POSITION: "negativePosition", COST_BASIS_UNAVAILABLE: "costUnavailable" } as const satisfies Record<HoldingWarning, string>;
const valuationKeys = { MISSING_LATEST_PRICE: "missingLatest", MISSING_PREVIOUS_PRICE: "missingPrevious", MISSING_FX_RATE: "missingFx", COST_BASIS_UNAVAILABLE: "missingCost" } as const satisfies Record<DashboardWarning["code"], string>;
export function translateHoldingWarning(warning: HoldingWarning, language: UiLanguage = "zh-CN"): string {
  return copy(Object.hasOwn(holdingKeys, warning) ? holdingKeys[warning] : "warningUnavailable", language);
}
export function translateDashboardWarning(warning: DashboardWarning, language: UiLanguage = "zh-CN"): string {
  return copy(Object.hasOwn(valuationKeys, warning.code) ? valuationKeys[warning.code] : "warningUnavailable", language, { instrument: `${warning.instrumentShortName} (${warning.currency})` });
}
export function translateSnapshotWarning(warning: SnapshotWarning, language: UiLanguage = "zh-CN"): string {
  return `${warning.accountName} · ${translateDashboardWarning(warning, language)}`;
}
export function translatePortfolioTrendWarning(warning: PortfolioTrendWarning, language: UiLanguage = "zh-CN"): string {
  return warning.code === "MISSING_PRINCIPAL_FX_RATE" ? copy("principalFx", language, { date: formatCalendarDate(warning.transactionDate, "-", language), currency: warning.currency }) : copy("warningUnavailable", language);
}
const monthlyKeys = { SNAPSHOT_DATE_MISMATCH: "snapshotMismatch", MISSING_START_SNAPSHOT: "missingStart", MISSING_END_SNAPSHOT: "missingEnd", START_VALUE_UNAVAILABLE: "startUnavailable", END_VALUE_UNAVAILABLE: "endUnavailable", MISSING_OPENING_PRICE: "openingPrice", MISSING_PRINCIPAL_FX_RATE: "principalFx", MISSING_ADJUSTMENT_FX_RATE: "adjustmentFx", MISSING_DIVIDEND_FX_RATE: "dividendFx" } as const satisfies Record<MonthlySummaryWarning["code"], string>;
export function translateMonthlySummaryWarning(warning: MonthlySummaryWarning, language: UiLanguage = "zh-CN"): string {
  const fallback = copy("unknownFact", language);
  return copy(Object.hasOwn(monthlyKeys, warning.code) ? monthlyKeys[warning.code] : "warningUnavailable", language, { date: formatCalendarDate(warning.date ?? null, fallback, language), actualDate: formatCalendarDate(warning.actualDate ?? null, fallback, language), instrument: warning.instrumentShortName ?? fallback, currency: warning.currency ?? fallback });
}
export function translateAccountDetailWarning(warning: AccountDetailWarning, language: UiLanguage = "zh-CN"): string {
  const code = warning.code;
  let notice: string;
  const facts = [
    warning.instrumentShortName,
    warning.currency && `(${warning.currency})`,
    warning.date && formatCalendarDate(warning.date, "--", language)
  ].filter(Boolean).join(" · ");
  if (Object.hasOwn(holdingKeys, code)) {
    notice = [facts, translateHoldingWarning(code as HoldingWarning, language)].filter(Boolean).join(" · ");
  } else if (Object.hasOwn(valuationKeys, code)) {
    notice = copy(valuationKeys[code as DashboardWarning["code"]], language, { instrument: facts || copy("unknownFact", language) });
  }
  else if (code === "MISSING_PRINCIPAL_FX_RATE") notice = copy("principalFx", language, { date: formatCalendarDate(warning.date ?? null, "--", language), currency: warning.currency ?? "--" });
  else notice = copy("warningUnavailable", language);
  return warning.origin === "snapshot" ? copy("snapshotOrigin", language, {notice}) : notice;
}
