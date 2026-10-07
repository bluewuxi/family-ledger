import type { DashboardWarning, InvestmentPerformance, ValuationMetadata } from "@family-ledger/shared";
import { formatLocalDateTime } from "../lib/timeFormat";

export function ValuationStatus({ metadata, performance, warnings }: {
  metadata: ValuationMetadata | undefined; performance: InvestmentPerformance | undefined; warnings: DashboardWarning[];
}) {
  if (!metadata) return null;
  const count = warnings.length + (performance?.warnings.length ?? 0);
  return <details className="valuation-status">
    <summary>数据状态：当前／延迟报价 {metadata.quotedHoldingCount} 项 · 已存储价格（收盘价／净值回退）{metadata.storedPriceHoldingCount} 项 · 数据提示 {count} 项</summary>
    <p>估值计算于 {formatLocalDateTime(metadata.valuedAt)}（本地时间）；汇率日期 {metadata.fxDateFrom ?? "无需汇率／暂无汇率"}{metadata.fxDateTo && metadata.fxDateTo !== metadata.fxDateFrom ? ` 至 ${metadata.fxDateTo}` : ""}。</p>
    <p>价格日期 {metadata.priceDateFrom ?? "暂无证券价格"}{metadata.priceDateTo && metadata.priceDateTo !== metadata.priceDateFrom ? ` 至 ${metadata.priceDateTo}` : ""}。{metadata.quoteFetchedAtFrom ? `报价获取于 ${formatLocalDateTime(metadata.quoteFetchedAtFrom)}${metadata.quoteFetchedAtTo !== metadata.quoteFetchedAtFrom ? ` 至 ${formatLocalDateTime(metadata.quoteFetchedAtTo!)}` : ""}（本地时间）。` : "本次使用已存储价格或现金余额。"}</p>
    <p>已存储价格包含收盘价、已公布基金净值及估算价格；基金净值按最新公布日期使用。行情变动代表当前持仓价格变化。投资盈利包含报告币种下的汇率影响。</p>
    {warnings.map((warning, index) => <p key={`${warning.instrumentId}:${warning.code}:${index}`}>{warning.instrumentShortName}（{warning.currency}）：{warning.code === "MISSING_LATEST_PRICE" ? "缺少价格" : warning.code === "MISSING_FX_RATE" ? "缺少估值汇率" : warning.code === "COST_BASIS_UNAVAILABLE" ? "成本不可用，未实现盈亏无法计算" : "缺少前一价格"}</p>)}
    {performance?.warnings.map(warning => <p key={`${warning.transactionDate}:${warning.currency}`}>{warning.transactionDate} 缺少 {warning.currency} 交易日汇率，投资盈利及其占比暂不可用。</p>)}
  </details>;
}
