import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../../i18n/LanguageProvider";
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

const englishMonth = new Intl.DateTimeFormat("en-NZ", { month: "short", year: "numeric", timeZone: "UTC" });
const seriesKeys = { income: "income", spending: "gross_spending", refunds: "refunds" } as const;

export function SpendingCharts({
  result,
  onFilter,
}: {
  result: SpendingQueryResult;
  onFilter: (v: Record<string, string>) => void;
}) {
  const { t: translate } = useTranslation("spending");
  const { language } = useUiLanguage();
  const currentMonth = getLocalDateString().slice(0, 7);
  function displayMonth(value: string | null) {
    if (value === null) return "—";
    if (language === "zh-CN" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
    return englishMonth.format(new Date(`${value}-01T00:00:00Z`));
  }
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
          exact: r,
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
            <h3>{translate("monthlyTitle", { currency: total.currency })}</h3>
            <p className="spending-hint">
              {translate("monthlyHint")}
            </p>
            <div className="spending-chart">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={data}
                  margin={{ left: 0, right: 12, top: 12, bottom: 8 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} tickFormatter={displayMonth} />
                  <YAxis width={64} tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={label => typeof label === "string" ? displayMonth(label) : label}
                    formatter={(_value, name, item) => {
                      const row = (item.payload as (typeof data)[number] | undefined)?.exact;
                      const series = item.dataKey;
                      const key = typeof series === "string" && Object.hasOwn(seriesKeys, series)
                        ? seriesKeys[series as keyof typeof seriesKeys] : undefined;
                      return [key ? money(row?.[key]) : "—", name];
                    }}
                  />
                  <Legend />
                  <Bar
                    name={translate("income")}
                    dataKey="income"
                    fill="#357e70"
                    cursor="pointer"
                    onClick={(entry) => drillDown(entry, "income")}
                  />
                  <Bar
                    name={translate("grossSpending")}
                    dataKey="spending"
                    fill="#b78345"
                    cursor="pointer"
                    onClick={(entry) => drillDown(entry, "spending")}
                  />
                  <Bar
                    name={translate("refunds")}
                    dataKey="refunds"
                    fill="#728aa8"
                    cursor="pointer"
                    onClick={(entry) => drillDown(entry, "refund")}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <details>
              <summary>{translate("monthlyDetail")}</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{translate("month")}</th>
                      <th>{translate("income")}</th>
                      <th>{translate("grossSpending")}</th>
                      <th>{translate("refunds")}</th>
                      <th>{translate("netSpending")}</th>
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
                            {r.label === currentMonth ? translate("currentMonth", { month: displayMonth(r.label) }) : displayMonth(r.label)}
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
            <h3>{translate("tagShareTitle", { currency: total.currency })}</h3>
            <p className="spending-hint">
              {translate("tagShareHint", { total: money(total.gross_spending) })}
            </p>
            {tags.map((r) => {
              const ratio =
                (Number(r.gross_spending) / Number(total.gross_spending)) * 100;
              return (
                <button
                  className="spending-tag-bar"
                  key={r.label === null ? "untagged" : `tag:${r.label}`}
                  onClick={() =>
                    onFilter({
                      tag: r.label ?? "",
                      untagged: r.label === null ? "true" : "",
                      currency: r.currency,
                      classification: "spending",
                    })
                  }
                >
                  <span>{r.label ?? translate("untagged")}</span>
                  <span>
                    {money(r.gross_spending)} · {ratio.toFixed(1)}%
                  </span>
                  <span className="spending-tag-track" aria-hidden="true">
                    <span style={{ width: `${ratio}%` }} />
                  </span>
                </button>
              );
            })}
            {!tags.length && <p>{translate("emptySpending")}</p>}
          </section>
        );
      })}
    </div>
  );
}
