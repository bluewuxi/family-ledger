import type { ReactNode } from "react";
import {
  type DashboardWarning,
  type HoldingWarning,
  type ValuedHoldingSummary
} from "@family-ledger/shared";
import { formatDisplayAmount, formatDisplayPrice } from "./numberFormat";

const HOLDING_WARNING_LABELS: Record<HoldingWarning, string> = {
  NEGATIVE_POSITION: "负数余额/持仓，请核对交易记录",
  COST_BASIS_UNAVAILABLE: "成本不可用"
};

export function formatHoldingInstrument(holding: ValuedHoldingSummary): string {
  return holding.instrumentSymbol ? `${holding.instrumentSymbol} - ${holding.instrumentShortName}` : holding.instrumentShortName;
}

export function formatHoldingQuantity(holding: ValuedHoldingSummary): string {
  if (holding.assetType === "cash") {
    return formatDisplayAmount(holding.quantity);
  }

  return formatCompactDecimal(holding.quantity, 6);
}

export function formatHoldingLatestPrice(holding: ValuedHoldingSummary): ReactNode {
  if (!holding.latestPrice) {
    return "-";
  }

  return (
    <>
      <span>{formatDisplayPrice(holding.latestPrice)}</span>
      {holding.latestPriceDate ? (
        <>
          <br />
          <span className="price-date-label">{formatShortPriceDate(holding.latestPriceDate)}</span>
        </>
      ) : null}
    </>
  );
}

export function formatHoldingWarnings(holding: ValuedHoldingSummary): ReactNode {
  const labels = unique([
    ...holding.warnings.map((warning) => HOLDING_WARNING_LABELS[warning]),
    ...holding.valuationWarnings.map(formatValuationWarning)
  ]);

  if (labels.length === 0) {
    return "-";
  }

  return (
    <div className="holding-warnings">
      {labels.map((label) => (
        <span className="warning-pill" key={label}>
          {label}
        </span>
      ))}
    </div>
  );
}

function formatCompactDecimal(value: string | number | null | undefined, maximumFractionDigits: number): string {
  if (value === null || value === undefined) {
    return "--";
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return "--";
  }

  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) {
    return normalized;
  }

  return numericValue.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  });
}

function formatValuationWarning(warning: DashboardWarning): string {
  const instrument = `${warning.instrumentShortName} (${warning.currency})`;

  switch (warning.code) {
    case "MISSING_LATEST_PRICE":
      return `${instrument} 缺少最新价格`;
    case "MISSING_PREVIOUS_PRICE":
      return `${instrument} 缺少前一收盘价`;
    case "MISSING_FX_RATE":
      return `${instrument} 缺少估值汇率`;
    case "COST_BASIS_UNAVAILABLE":
      return `${instrument} 成本不可用`;
  }
}

function formatShortPriceDate(value: string): string {
  return value.length >= 10 ? value.slice(5) : value;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
