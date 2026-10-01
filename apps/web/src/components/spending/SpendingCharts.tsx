import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  getLocalDateString,
  type SpendingQueryResult,
} from "@family-ledger/shared";
import { formatSpendingAmount as money } from "../../lib/spendingFormat";
export function SpendingCharts({
  result,
  onFilter,
}: {
  result: SpendingQueryResult;
  onFilter: (v: Record<string, string>) => void;
}) {
  const currentMonth = getLocalDateString().slice(0, 7);
  return (
    <div className="spending-chart-stack">
      {result.totals.map((total) => {
        // Number conversion is solely for plotting; exact report totals come from PostgreSQL.
        const monthly = result.monthly.filter(
          (r) => r.currency === total.currency,
        );
        const tags = result.tags
          .filter(
            (r) =>
              r.currency === total.currency && Number(r.gross_spending) > 0,
          )
          .sort((a, b) => Number(b.gross_spending) - Number(a.gross_spending));
        const data = monthly.map((r) => ({
          month: r.label,
          income: Number(r.income),
          spending: Number(r.gross_spending),
          refunds: Number(r.refunds),
        }));
        function drillDown(entry: unknown, classification: string) {
          const month = (entry as { payload?: { month?: string } }).payload
            ?.month;
          if (month)
            onFilter({
              month,
              from: "",
              to: "",
              currency: total.currency,
              classification,
            });
        }
        return (
          <section key={total.currency} className="spending-chart-section">
            <h3>{total.currency} · 每月收支</h3>
            <p className="spending-hint">
              按交易日期；当月尚未结束。空缺月份表示没有已录入记录，不代表零消费。
            </p>
            <div className="spending-chart">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={data}
                  margin={{ left: 0, right: 12, top: 12, bottom: 8 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis width={64} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    name="收入"
                    dataKey="income"
                    fill="#357e70"
                    cursor="pointer"
                    onClick={(entry) => drillDown(entry, "income")}
                  />
                  <Bar
                    name="消费"
                    dataKey="spending"
                    fill="#b78345"
                    cursor="pointer"
                    onClick={(entry) => drillDown(entry, "spending")}
                  />
                  <Bar
                    name="退款/返现"
                    dataKey="refunds"
                    fill="#728aa8"
                    cursor="pointer"
                    onClick={(entry) => drillDown(entry, "refund")}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <details>
              <summary>每月金额与明细</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>月份</th>
                      <th>收入</th>
                      <th>消费</th>
                      <th>退款/返现</th>
                      <th>净消费</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((r) => (
                      <tr key={r.label}>
                        <td>
                          <button
                            className="spending-text-button"
                            onClick={() =>
                              onFilter({
                                month: r.label!,
                                from: "",
                                to: "",
                                currency: r.currency,
                              })
                            }
                          >
                            {r.label}
                            {r.label === currentMonth ? "（未结束）" : ""}
                          </button>
                        </td>
                        <td>{money(r.income)}</td>
                        <td>{money(r.gross_spending)}</td>
                        <td>{money(r.refunds)}</td>
                        <td>{money(r.net_spending)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <h3>标签占比 · {total.currency}</h3>
            <p className="spending-hint">
              分母为当前筛选内的消费总额 {money(total.gross_spending)}
              ，包含未分类；退款/返现单独统计。
            </p>
            {tags.map((r) => {
              const ratio =
                (Number(r.gross_spending) / Number(total.gross_spending)) * 100;
              return (
                <button
                  className="spending-tag-bar"
                  key={r.label ?? "__untagged"}
                  onClick={() =>
                    onFilter({
                      tag: r.label ?? "",
                      untagged: r.label === null ? "true" : "",
                      currency: r.currency,
                      classification: "spending",
                    })
                  }
                >
                  <span>{r.label ?? "未分类"}</span>
                  <span>
                    {money(r.gross_spending)} · {ratio.toFixed(1)}%
                  </span>
                  <span className="spending-tag-track" aria-hidden="true">
                    <span style={{ width: `${ratio}%` }} />
                  </span>
                </button>
              );
            })}
            {!tags.length && <p>没有已归类为消费的交易。</p>}
          </section>
        );
      })}
    </div>
  );
}
