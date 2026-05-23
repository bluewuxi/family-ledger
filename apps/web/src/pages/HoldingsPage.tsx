import { useEffect, useState } from "react";
import {
  ASSET_TYPE_LABELS,
  type HoldingSummary,
  type HoldingWarning
} from "@family-ledger/shared";
import { ApiClientError, apiGet } from "../lib/apiClient";

interface HoldingsResponse {
  holdings: HoldingSummary[];
}

const WARNING_LABELS: Record<HoldingWarning, string> = {
  NEGATIVE_POSITION: "负数余额/持仓，请核对交易记录",
  COST_BASIS_UNAVAILABLE: "成本不可用"
};

export function HoldingsPage() {
  const [holdings, setHoldings] = useState<HoldingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadHoldings();
  }, []);

  async function loadHoldings() {
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<HoldingsResponse>("/holdings");
      setHoldings(data.holdings);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <h1>持仓总览</h1>
          <p>按账户展示当前持仓和现金余额。市场价格、纽币估值和收益将在后续阶段提供。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadHoldings} disabled={loading}>
          刷新
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      <p className="readonly-note">持仓由交易记录自动计算，当前仅按标的原币种显示成本，不提供写入操作。</p>

      <div className="table-wrap">
        <table className="holding-table">
          <thead>
            <tr>
              <th>账户</th>
              <th>标的</th>
              <th>类型</th>
              <th>币种</th>
              <th>数量/现金余额</th>
              <th>平均成本</th>
              <th>剩余成本</th>
              <th>数据提示</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>正在加载持仓...</td>
              </tr>
            ) : holdings.length === 0 ? (
              <tr>
                <td colSpan={8}>暂无可显示的持仓或现金余额。</td>
              </tr>
            ) : (
              holdings.map((holding) => (
                <tr key={`${holding.accountId}:${holding.instrumentId}`}>
                  <td>{holding.accountName}</td>
                  <td>{formatInstrument(holding)}</td>
                  <td>{ASSET_TYPE_LABELS[holding.assetType]}</td>
                  <td>{holding.currency}</td>
                  <td>{holding.quantity}</td>
                  <td>{holding.averageUnitCost ?? "-"}</td>
                  <td>{holding.costAmount ?? "-"}</td>
                  <td>
                    {holding.warnings.length === 0 ? (
                      "-"
                    ) : (
                      <div className="holding-warnings">
                        {holding.warnings.map((warning) => (
                          <span className="warning-pill" key={warning}>
                            {WARNING_LABELS[warning]}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatInstrument(holding: HoldingSummary): string {
  return holding.instrumentSymbol ? `${holding.instrumentSymbol} - ${holding.instrumentName}` : holding.instrumentName;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "持仓请求失败，请稍后重试。";
}
