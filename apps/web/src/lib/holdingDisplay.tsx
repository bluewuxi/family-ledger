import { holdingsCopy as copy } from "../i18n/investmentCopy";
import { getDisplayLocale, type UiLanguage } from "../i18n/language";
import { formatCalendarDate } from "./timeFormat";
import { translateDashboardWarning, translateHoldingWarning } from "../i18n/investmentWarnings";
import type { ReactNode } from "react";
import {
  type ValuedHoldingSummary
} from "@family-ledger/shared";
import { formatDisplayAmount, formatDisplayPrice } from "./numberFormat";
import { formatLocalDateTime } from "./timeFormat";


export function formatHoldingInstrument(holding: ValuedHoldingSummary): string {
  return holding.instrumentSymbol ? `${holding.instrumentSymbol} - ${holding.instrumentShortName}` : holding.instrumentShortName;
}

export function formatHoldingQuantity(holding: ValuedHoldingSummary, language: UiLanguage = "zh-CN"): string {
  if (holding.assetType === "cash") {
    return formatDisplayAmount(holding.quantity, getDisplayLocale(language));
  }

  return formatCompactDecimal(holding.quantity, 6, language);
}

export function formatHoldingLatestPrice(holding: ValuedHoldingSummary, presentation: "compact" | "detailed", language: UiLanguage = "zh-CN"): ReactNode {
  if (!holding.latestPrice) {
    return "-";
  }

  return (
    <>
      <span>{formatDisplayPrice(holding.latestPrice, getDisplayLocale(language))}</span>
      {presentation === "detailed" && holding.latestPriceIsEstimated ? <span className="estimate-badge">{copy("estimated", language)}</span> : null}
      {holding.latestPriceDate ? (
        <>
          <br />
          <span className="price-date-label">{formatShortPriceDate(holding.latestPriceDate, language)}</span>
        </>
      ) : null}
      {presentation === "detailed" && holding.latestPriceKind ? <><br /><span className="price-date-label">{copy(holding.latestPriceKind === "quote" ? "quoteKind" : "storedKind", language)}{holding.latestPriceSource ? ` · ${holding.latestPriceSource}` : ""}</span></> : null}
      {presentation === "detailed" && holding.quoteFetchedAt ? <><br /><span className="price-date-label">{copy("fetchedAt", language, {time: formatLocalDateTime(holding.quoteFetchedAt, "-", undefined, language)})}</span></> : null}
    </>
  );
}

export function formatHoldingWarnings(holding: ValuedHoldingSummary, language: UiLanguage = "zh-CN"): ReactNode {
  const notices = [
    ...holding.warnings.map(warning => ({id:`holding:${warning}`,label:translateHoldingWarning(warning, language)})),
    ...holding.valuationWarnings.map(warning => ({id:`valuation:${warning.instrumentId}:${warning.code}:${warning.currency}`,label:translateDashboardWarning(warning, language)}))
  ];
  const labels = [...new Map(notices.map(notice => [notice.id, notice])).values()];

  if (labels.length === 0) {
    return "-";
  }

  return (
    <div className="holding-warnings">
      {labels.map(({id,label}) => (
        <span className="warning-pill" key={id}>
          {label}
        </span>
      ))}
    </div>
  );
}

function formatCompactDecimal(value: string | number | null | undefined, maximumFractionDigits: number, language: UiLanguage = "zh-CN"): string {
  if (value === null || value === undefined) {
    return "--";
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return "--";
  }

  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) {
    return normalized;
  }

  return numericValue.toLocaleString(getDisplayLocale(language), {
    minimumFractionDigits: 0,
    maximumFractionDigits
  });
}

function formatShortPriceDate(value: string, language: UiLanguage = "zh-CN"): string {
  return language === "en" ? formatCalendarDate(value, "-", language) : value.length >= 10 ? value.slice(5) : value;
}
