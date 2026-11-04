import { useId, useMemo, type CSSProperties, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GainColorScheme } from "@family-ledger/shared";
import { buildProfitChartData, isSyntheticTrendDate, type TrendChartPoint, type ProfitChartPoint } from "../lib/trendChartData";
import { buildColorSplitProfitChartData, buildColorSplitTrendChartData } from "../lib/trendChartSeries";
const trendPrincipalColor = "#8A5A24";
const chartPositiveColor = "var(--color-chart-positive)";
const chartNegativeColor = "var(--color-chart-negative)";
const chartTooltipContentStyle = {
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  boxShadow: "var(--shadow-soft)"
};
const chartTooltipLabelStyle = {
  color: "var(--color-text)",
  fontWeight: 600
};
const chartTooltipItemStyle = {
  color: "var(--color-brand-gold)",
  fontWeight: 600
};

type ChartToneStyle = CSSProperties & {
  "--color-chart-positive": string;
  "--color-chart-negative": string;
};

export function InvestmentTrendChart({ points, view, gainColorScheme }: { points: TrendChartPoint[]; view: "profit" | "assets"; gainColorScheme: GainColorScheme }) {
  const gradientPrefix = useId().replaceAll(":", "");
  const profitChartData = useMemo(() => buildProfitChartData(points), [points]);
  const colorSplitTrendChartData = useMemo(() => markCarriedSegments(buildColorSplitTrendChartData(points)), [points]);
  const colorSplitProfitChartData = useMemo(() => markCarriedSegments(buildColorSplitProfitChartData(profitChartData)), [profitChartData]);
  const trendValueDomain = getTrendValueDomain(points);
  const profitValueTicks = getProfitValueTicks(getProfitValueDomain(profitChartData));
  const profitAxisDomain: [number, number] = [profitValueTicks[0] ?? 0, profitValueTicks.at(-1) ?? 1];
  const hoverDates = new Set((view === "assets" ? points : profitChartData).map(point => point.date));
  return <div style={getChartToneStyle(gainColorScheme)}>
    {view === "assets" ? (
      <ResponsiveContainer width="100%" height={280}>
    <AreaChart data={colorSplitTrendChartData} margin={{ top: 16, right: 18, bottom: 8, left: 0 }}>
      <defs>
        <linearGradient id={`${gradientPrefix}-portfolioTrendPositiveFill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="8%" stopColor={chartPositiveColor} stopOpacity={0.34} />
          <stop offset="95%" stopColor={chartPositiveColor} stopOpacity={0.04} />
        </linearGradient>
        <linearGradient id={`${gradientPrefix}-portfolioTrendNegativeFill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="8%" stopColor={chartNegativeColor} stopOpacity={0.34} />
          <stop offset="95%" stopColor={chartNegativeColor} stopOpacity={0.04} />
        </linearGradient>
        <linearGradient id={`${gradientPrefix}-portfolioTrendPrincipalFill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="12%" stopColor={trendPrincipalColor} stopOpacity={0.18} />
          <stop offset="96%" stopColor={trendPrincipalColor} stopOpacity={0.03} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
      <XAxis dataKey="date" tickFormatter={formatTrendTickDate} tickLine={false} />
      <YAxis
        domain={trendValueDomain}
        tickFormatter={(value: number) => formatCompactMoney(value)}
        tickLine={false}
        width={72}
      />
      <Tooltip cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }} content={({ active, payload, label }) => <TrendHoverTooltip active={active} payload={payload} label={label} dates={hoverDates} profit={false} />} />
      <Area
        isAnimationActive={false}
        type="stepAfter"
        dataKey="totalInvestment"
        name="累计净投入"
        stroke="none"
        fill={`url(#${gradientPrefix}-portfolioTrendPrincipalFill)`}
        dot={false}
        activeDot={false}
        connectNulls
        tooltipType="none"
      />
      <Area
        isAnimationActive={false}
        type="monotone"
        dataKey="snapshotPositiveRange"
        name="资产净值"
        stroke="none"
        fill={`url(#${gradientPrefix}-portfolioTrendPositiveFill)`}
        dot={false}
        activeDot={false}
        connectNulls={false}
      />
      <Area
        isAnimationActive={false}
        type="monotone"
        dataKey="snapshotNegativeRange"
        name="资产净值"
        stroke="none"
        fill={`url(#${gradientPrefix}-portfolioTrendNegativeFill)`}
        dot={false}
        activeDot={false}
        connectNulls={false}
      />
      <Line
        isAnimationActive={false}
        type="monotone"
        dataKey="snapshotPositiveValue"
        name="资产净值"
        stroke={chartPositiveColor}
        strokeWidth={2.8}
        dot={false}
        activeDot={props => renderTrendHoverDot(props, hoverDates)}
        connectNulls={false}
      />
      <Line
        isAnimationActive={false}
        type="monotone"
        dataKey="snapshotNegativeValue"
        name="资产净值"
        stroke={chartNegativeColor}
        strokeWidth={2.8}
        dot={false}
        activeDot={props => renderTrendHoverDot(props, hoverDates)}
        connectNulls={false}
      />
      <Line
        isAnimationActive={false}
        type="stepAfter"
        dataKey="totalInvestment"
        stroke={trendPrincipalColor}
        strokeDasharray="6 5"
        strokeWidth={2.5}
        dot={false}
        activeDot={props => renderTrendHoverDot(props, hoverDates)}
        connectNulls
      />
      <Line dataKey="carriedValue" type="linear" stroke="var(--color-surface)" strokeWidth={5} dot={false} activeDot={false} isAnimationActive={false} tooltipType="none" connectNulls={false} />
      <Line dataKey="carriedValue" type="linear" stroke="var(--color-muted)" strokeWidth={2.8} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} tooltipType="none" connectNulls={false} />

    </AreaChart>
      </ResponsiveContainer>
    ) : (
      <ResponsiveContainer width="100%" height={280}>
    <AreaChart data={colorSplitProfitChartData} margin={{ top: 16, right: 18, bottom: 8, left: 0 }}>
      <defs>
        <linearGradient id={`${gradientPrefix}-portfolioProfitPositiveFill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="8%" stopColor={chartPositiveColor} stopOpacity={0.34} />
          <stop offset="95%" stopColor={chartPositiveColor} stopOpacity={0.04} />
        </linearGradient>
        <linearGradient id={`${gradientPrefix}-portfolioProfitNegativeFill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="8%" stopColor={chartNegativeColor} stopOpacity={0.34} />
          <stop offset="95%" stopColor={chartNegativeColor} stopOpacity={0.04} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
      <XAxis dataKey="date" tickFormatter={formatTrendTickDate} tickLine={false} />
      <YAxis
        domain={profitAxisDomain}
        ticks={profitValueTicks}
        tickFormatter={(value: number) => formatCompactMoney(value)}
        tickLine={false}
        width={72}
      />
      <ReferenceLine y={0} stroke="var(--color-chart-grid)" strokeWidth={1.4} />
      <Tooltip cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }} content={({ active, payload, label }) => <TrendHoverTooltip active={active} payload={payload} label={label} dates={hoverDates} profit={true} />} />
      <Area
        isAnimationActive={false}
        type="monotone"
        dataKey="profitPositiveValue"
        name="期间盈利"
        stroke={chartPositiveColor}
        fill={`url(#${gradientPrefix}-portfolioProfitPositiveFill)`}
        strokeWidth={2.8}
        dot={false}
        activeDot={props => renderTrendHoverDot(props, hoverDates)}
        connectNulls={false}
      />
      <Area
        isAnimationActive={false}
        type="monotone"
        dataKey="profitNegativeValue"
        name="期间盈利"
        stroke={chartNegativeColor}
        fill={`url(#${gradientPrefix}-portfolioProfitNegativeFill)`}
        strokeWidth={2.8}
        dot={false}
        activeDot={props => renderTrendHoverDot(props, hoverDates)}
        connectNulls={false}
      />
      <Line dataKey="carriedValue" type="linear" stroke="var(--color-surface)" strokeWidth={5} dot={false} activeDot={false} isAnimationActive={false} tooltipType="none" connectNulls={false} />
      <Line dataKey="carriedValue" type="linear" stroke="var(--color-muted)" strokeWidth={2.8} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} tooltipType="none" connectNulls={false} />

    </AreaChart>
      </ResponsiveContainer>
    )}
    {points.some(point => point.snapshotDate && point.snapshotDate !== point.date) ? <p className="quote-update-note">虚线沿用此前快照；查看提示可见请求日期和实际快照日期。</p> : null}
  </div>;
}

function markCarriedSegments<T extends { date: string; value: number; snapshotDate?: string | null; isSynthetic?: boolean }>(points: T[]): Array<T & { carriedValue: number | null }> {
  return points.map((point, index) => {
    const next = points[index + 1];
    const carried = !point.isSynthetic && point.snapshotDate && point.snapshotDate !== point.date;
    const leadsToCarried = next && !next.isSynthetic && next.snapshotDate && next.snapshotDate !== next.date && next.snapshotDate === point.snapshotDate;
    return { ...point, carriedValue: carried || leadsToCarried ? point.value : null };
  });
}
function formatTrendTickDate(value: string): string {
  return value.startsWith("__chart_crossing__") ? "" : isSyntheticTrendDate(value) ? "当前" : value.slice(5);
}
function getTrendValueDomain(points: TrendChartPoint[]): [number, number] {
  const values = points
    .flatMap((point) => [point.snapshotValue, point.liveValue, point.totalInvestment])
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return [0, 1];
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue;

  if (valueRange === 0) {
    const padding = Math.max(Math.abs(maxValue) * 0.01, 1);
    return [minValue < 0 ? minValue - padding : Math.max(0, minValue - padding), maxValue + padding];
  }

  const padding = valueRange * 0.2;
  return [minValue < 0 ? minValue - padding : Math.max(0, minValue - padding), maxValue + padding];
}

function getProfitValueDomain(points: ProfitChartPoint[]): [number, number] {
  const values = points
    .map((point) => point.profitValue)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return [0, 1];
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue;

  if (valueRange === 0) {
    const padding = Math.max(Math.abs(maxValue) * 0.05, 1);
    return [minValue - padding, maxValue + padding];
  }

  const padding = valueRange * 0.2;
  return [minValue - padding, maxValue + padding];
}

export function getChartToneStyle(gainColorScheme: GainColorScheme): ChartToneStyle {
  const positiveColor = gainColorScheme === "red_positive" ? "var(--color-gain-red)" : "var(--color-gain-green)";
  const negativeColor = gainColorScheme === "red_positive" ? "var(--color-gain-green)" : "var(--color-gain-red)";

  return {
    "--color-chart-positive": positiveColor,
    "--color-chart-negative": negativeColor
  };
}

function getProfitValueTicks(domain: [number, number]): number[] {
  const [minValue, maxValue] = domain;
  const valueRange = maxValue - minValue;

  if (!Number.isFinite(valueRange) || valueRange <= 0) {
    return [0];
  }

  const step = getNiceTickStep(valueRange / 4);
  const lowerTick = Math.floor(minValue / step) * step;
  const upperTick = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];

  for (let tick = lowerTick; tick <= upperTick + step * 0.5; tick += step) {
    ticks.push(Math.abs(tick) < step / 1_000_000 ? 0 : tick);
  }

  if (!ticks.some((tick) => tick === 0)) {
    ticks.push(0);
    ticks.sort((left, right) => left - right);
  }

  return Array.from(new Set(ticks));
}

function getNiceTickStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalizedStep = rawStep / magnitude;

  if (normalizedStep <= 1) {
    return magnitude;
  }
  if (normalizedStep <= 2) {
    return magnitude * 2;
  }
  if (normalizedStep <= 5) {
    return magnitude * 5;
  }

  return magnitude * 10;
}

export function formatChartMoney(value: number): string {
  return Math.round(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatTooltipMoney(value: unknown): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? formatChartMoney(numericValue) : "--";
}

function formatSignedTooltipMoney(value: unknown): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? formatMetricWholeNumber(numericValue, { signed: true }) : "--";
}

function formatCompactMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    const scaledValue = value / 1_000_000;
    const decimals = Math.abs(scaledValue) < 10 ? 2 : Math.abs(scaledValue) < 100 ? 1 : 0;
    return `${scaledValue.toFixed(decimals)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return value.toFixed(0);
}

function formatMetricWholeNumber(value: string | number, options: { signed?: boolean } = {}): string {
  const numericValue = Number(String(value).trim());

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  const roundedValue = Math.round(numericValue);
  const formatted = Math.abs(roundedValue).toLocaleString("zh-CN", { maximumFractionDigits: 0 });

  if (options.signed && roundedValue > 0) {
    return `+${formatted}`;
  }

  if (roundedValue < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

function renderTrendHoverDot(props: unknown, dates: Set<string>): ReactNode {
  const point = props as { cx?: number; cy?: number; fill?: string; payload?: { date?: string; snapshotDate?: string | null } };
  if (point.payload?.snapshotDate && point.payload.date !== point.payload.snapshotDate) return <g />;
  return point.payload?.date && dates.has(point.payload.date) ? <circle cx={point.cx} cy={point.cy} r={5} fill={point.fill} stroke="var(--color-surface)" strokeWidth={2} /> : <g />;
}

function TrendHoverTooltip({ active, payload, label, dates, profit }: { active?: boolean; payload?: readonly { payload?: unknown }[]; label?: unknown; dates: Set<string>; profit: boolean }) {
  if (!active || typeof label !== "string" || !dates.has(label)) return null;
  const point = payload?.[0]?.payload as { value?: number | null; totalInvestment?: number | null; snapshotDate?: string } | undefined;
  if (!point || point.value == null) return null;
  return <div style={{ ...chartTooltipContentStyle, padding: "10px 12px" }}>
    <div style={chartTooltipLabelStyle}>{label.replace("__live_endpoint__", "")}{label.startsWith("__live_endpoint__") ? " · 当前估值" : ""}</div>
    {point.snapshotDate && point.snapshotDate !== label ? <div>暂无当日快照，显示 {point.snapshotDate} 数据</div> : null}
    <div style={chartTooltipItemStyle}>{profit ? "期间盈利" : "资产净值"}：{profit ? formatSignedTooltipMoney(point.value) : formatTooltipMoney(point.value)}</div>
    {!profit && point.totalInvestment != null ? <div>累计净投入：{formatTooltipMoney(point.totalInvestment)}</div> : null}
  </div>;
}
