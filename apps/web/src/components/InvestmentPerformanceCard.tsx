import { useUiLanguage } from "../i18n/LanguageProvider";
import { dashboardCopy as copy } from "../i18n/investmentCopy";
import { formatCalendarDate } from "../lib/timeFormat";
import type { InvestmentPerformance, SnapshotDisplayCurrency } from "@family-ledger/shared";
import { LoadingState } from "./LoadingState";
import { CurrencyFlagIcon } from "./CurrencySelect";
import { formatDisplayPercent, formatSignedDisplayAmount, formatSignedDisplayWholeAmount } from "../lib/numberFormat";
import { signedToneClass, usePreferences } from "../lib/preferencesContext";

export function InvestmentPerformanceCard({ performance, currency, loading, fullScope = false, wholeAmounts = false }: {
  performance: InvestmentPerformance | undefined; currency: SnapshotDisplayCurrency; loading: boolean; fullScope?: boolean; wholeAmounts?: boolean;
}) {
  const { language, displayLocale } = useUiLanguage();
  const { preferences } = usePreferences();
  return <article className="metric-card investment-performance-card">
    <span>{copy("lifetimeProfit", language)}</span>
    <small className="metric-currency"><CurrencyFlagIcon currency={currency} />{currency}</small>
    <strong className={signedToneClass(performance?.investmentProfit, preferences.gainColorScheme, 3)}>
      {loading ? <LoadingState label={copy("loading", language)} /> : performance?.investmentProfit == null ? "--" : (wholeAmounts ? formatSignedDisplayWholeAmount : formatSignedDisplayAmount)(performance.investmentProfit, displayLocale)}
    </strong>
    <small>{copy("profitShare", language, {value:loading || performance?.profitPercentageOfAssets == null ? "--" : `${formatDisplayPercent(performance.profitPercentageOfAssets, displayLocale)}%`})}</small>
    {fullScope ? <small>{copy("fullScope", language)}</small> : null}
    {performance?.inceptionDate ? <small>{copy("inception", language, {date:formatCalendarDate(performance.inceptionDate, "-", language)})}</small> : null}
  </article>;
}
