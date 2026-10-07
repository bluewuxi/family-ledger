import type { InvestmentPerformance, SnapshotDisplayCurrency } from "@family-ledger/shared";
import { LoadingState } from "./LoadingState";
import { CurrencyFlagIcon } from "./CurrencySelect";
import { formatDisplayPercent, formatSignedDisplayAmount, formatSignedDisplayWholeAmount } from "../lib/numberFormat";
import { signedToneClass, usePreferences } from "../lib/preferencesContext";

export function InvestmentPerformanceCard({ performance, currency, loading, fullScope = false, wholeAmounts = false }: {
  performance: InvestmentPerformance | undefined; currency: SnapshotDisplayCurrency; loading: boolean; fullScope?: boolean; wholeAmounts?: boolean;
}) {
  const { preferences } = usePreferences();
  return <article className="metric-card investment-performance-card">
    <span>投资盈利</span>
    <small className="metric-currency"><CurrencyFlagIcon currency={currency} />{currency}</small>
    <strong className={signedToneClass(performance?.investmentProfit, preferences.gainColorScheme, 3)}>
      {loading ? <LoadingState label="加载中" /> : performance?.investmentProfit == null ? "--" : (wholeAmounts ? formatSignedDisplayWholeAmount : formatSignedDisplayAmount)(performance.investmentProfit)}
    </strong>
    <small>占总资产 {loading || performance?.profitPercentageOfAssets == null ? "--" : `${formatDisplayPercent(performance.profitPercentageOfAssets)}%`} · 自投资以来</small>
    {fullScope ? <small>全部投资账户 · 不随下方筛选变化</small> : null}
    {performance?.inceptionDate ? <small>记录起点 {performance.inceptionDate}</small> : null}
  </article>;
}
