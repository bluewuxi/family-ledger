import type { DashboardWarning, InvestmentPerformance, ValuationMetadata } from "@family-ledger/shared";
import { formatLocalDateTime, formatCalendarDate } from "../lib/timeFormat";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { dashboardCopy as copy } from "../i18n/investmentCopy";
import { translateDashboardWarning } from "../i18n/investmentWarnings";

export function ValuationStatus({ metadata, performance, warnings }: {
  metadata: ValuationMetadata | undefined; performance: InvestmentPerformance | undefined; warnings: DashboardWarning[];
}) {
  const {language} = useUiLanguage();
  if (!metadata) return null;
  const count = warnings.length + (performance?.warnings.length ?? 0);
  const date = (value: string) => formatCalendarDate(value, "-", language);
  const time = (value: string) => formatLocalDateTime(value, "-", undefined, language);
  const range = (from: string, to?: string | null) => to && to !== from ? copy("range", language, {from,to}) : from;
  return <details className="valuation-status">
    <summary>{copy("status", language, {detail: count ? copy("warningCount", language, {count}) : copy("statusDates", language)})}</summary>
    <p>{copy("priceCounts", language, {quoted:metadata.quotedHoldingCount,stored:metadata.storedPriceHoldingCount})}</p>
    <p>{copy("valuedAt", language, {time:time(metadata.valuedAt),dates:metadata.fxDateFrom ? range(date(metadata.fxDateFrom),metadata.fxDateTo ? date(metadata.fxDateTo) : null) : copy("noFx", language)})}</p>
    <p>{copy("priceDates", language, {dates:metadata.priceDateFrom ? range(date(metadata.priceDateFrom),metadata.priceDateTo ? date(metadata.priceDateTo) : null) : copy("noPrices", language)})} {metadata.quoteFetchedAtFrom ? copy("fetchedAt", language, {times:range(time(metadata.quoteFetchedAtFrom),metadata.quoteFetchedAtTo ? time(metadata.quoteFetchedAtTo) : null)}) : copy("storedOnly", language)}</p>
    <p>{copy("valuationHelp", language)}</p>
    {warnings.map((warning, index) => <p key={`${warning.instrumentId}:${warning.code}:${index}`}>{translateDashboardWarning(warning, language)}</p>)}
    {performance?.warnings.map(warning => <p key={`${warning.transactionDate}:${warning.currency}`}>{copy("principalWarning", language, {date:date(warning.transactionDate),currency:warning.currency})}</p>)}
  </details>;
}
