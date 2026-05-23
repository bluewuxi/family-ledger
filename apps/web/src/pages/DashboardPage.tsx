import { useEffect, useState } from "react";
import type { DashboardSummary, DashboardWarning } from "@family-ledger/shared";
import { ApiClientError, apiGet } from "../lib/apiClient";

interface DashboardResponse {
  dashboard: DashboardSummary;
}

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<DashboardResponse>("/dashboard");
      setDashboard(data.dashboard);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  const metrics = [
    { label: "总资产", value: formatMoneyMetric(dashboard?.totalAssets, loading) },
    { label: "今日变动", value: formatTodayChange(dashboard, loading) },
    { label: "未实现收益", value: formatMoneyMetric(dashboard?.unrealizedGain, loading) },
    { label: "账户数量", value: loading ? "加载中..." : String(dashboard?.accountCount ?? 0) }
  ];

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <h1>仪表盘</h1>
          <p>基于已存储的收盘价和汇率，以纽币展示当前投资组合概览。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadDashboard} disabled={loading}>
          刷新
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="metric-grid">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>

      {!loading && dashboard?.warnings.length ? (
        <section className="dashboard-warning-panel" aria-label="数据提示">
          <h2>数据提示</h2>
          <p>缺少必要数据的指标显示为 --，不会展示不完整的合计金额。</p>
          <div className="holding-warnings">
            {dashboard.warnings.map((warning) => (
              <span className="warning-pill" key={`${warning.code}:${warning.instrumentId}:${warning.currency}`}>
                {formatWarning(warning)}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function formatMoneyMetric(value: string | null | undefined, loading: boolean): string {
  if (loading) {
    return "加载中...";
  }

  return value === null || value === undefined ? "--" : `NZD ${value}`;
}

function formatTodayChange(dashboard: DashboardSummary | null, loading: boolean): string {
  if (loading) {
    return "加载中...";
  }

  if (!dashboard || dashboard.todayChange === null) {
    return "--";
  }

  const percentage = dashboard.todayChangePct === null ? "" : ` (${dashboard.todayChangePct}%)`;
  return `NZD ${dashboard.todayChange}${percentage}`;
}

function formatWarning(warning: DashboardWarning): string {
  const instrument = `${warning.instrumentName} (${warning.currency})`;

  switch (warning.code) {
    case "MISSING_LATEST_PRICE":
      return `${instrument} 缺少最新价格`;
    case "MISSING_PREVIOUS_PRICE":
      return `${instrument} 缺少前一收盘价，无法计算今日变动`;
    case "MISSING_FX_RATE":
      return `${instrument} 缺少兑 NZD 汇率`;
    case "COST_BASIS_UNAVAILABLE":
      return `${instrument} 成本不可用，无法计算未实现收益`;
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "仪表盘请求失败，请稍后重试。";
}
