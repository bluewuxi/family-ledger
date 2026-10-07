import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { LoadingBlock } from "./LoadingState";
import { formatDisplayAmount, formatDisplayPercent } from "../lib/numberFormat";

const colors = ["#5A321C", "#F5B52E", "#C77A22", "#D9534F", "#A85A32", "#9C6B2F"];

export function DistributionPanel({ title, description, rows, total, loading }: {
  title: string; description?: string; rows: { id: string; name: string; marketValue: string | null }[];
  total: string | null | undefined; loading: boolean;
}) {
  const missing = rows.some(row => row.marketValue === null) || total == null;
  const negative = rows.some(row => row.marketValue !== null && Number(row.marketValue) < 0);
  const valid = !missing && !negative && Number(total) > 0;
  const data = rows.map(row => ({ ...row, value: row.marketValue === null ? null : Number(row.marketValue) }));
  return <article className="flow-card allocation-panel">
    <div className="allocation-heading"><h2>{title}</h2></div>
    {description ? <p className="panel-description">{description}</p> : null}
    {loading ? <LoadingBlock label={`正在加载${title}`} /> : <>
      {!valid ? <p className="panel-description">{missing ? "估值数据不完整" : negative ? "存在负数资产" : "总资产不大于零"}，暂不展示饼图及占比。</p> :
        <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={data.filter(row => row.value !== null && row.value > 0)} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={2}>
          {data.filter(row => row.value !== null && row.value > 0).map(row => <Cell key={row.id} fill={colors[data.findIndex(item => item.id === row.id) % colors.length]} />)}
        </Pie><Tooltip formatter={value => formatDisplayAmount(Number(value))} contentStyle={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text)" }} /></PieChart></ResponsiveContainer>}
      <div className="allocation-list">{data.map((row, index) => <div className="allocation-row" key={row.id}>
        <span><i style={{ background: colors[index % colors.length] }} />{row.name}</span>
        <strong>{formatDisplayAmount(row.marketValue)}{valid ? <small>{formatDisplayPercent(Number(row.marketValue) / Number(total) * 100)}%</small> : null}</strong>
      </div>)}</div>
    </>}
  </article>;
}
