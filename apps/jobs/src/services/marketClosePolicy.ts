import type { PriceSource } from "@family-ledger/shared";

interface MarketCloseRule {
  timeZone: string;
  cutoffHour: number;
  cutoffMinute: number;
  label: string;
}

export interface MarketCloseConfirmationInput {
  priceDate: string;
  fetchedAt: string | null | undefined;
  createdAt?: string | null | undefined;
  priceSource: PriceSource;
  sourceExchange: string | null | undefined;
}

export interface SuspectMarketClosePriceInput extends MarketCloseConfirmationInput {
  id: string;
}

export interface SuspectMarketClosePrice {
  id: string;
  reason: string;
  checkedAt: string;
}

const marketCloseRulesByExchange = new Map<string, MarketCloseRule>([
  ["SSE", { timeZone: "Asia/Shanghai", cutoffHour: 15, cutoffMinute: 10, label: "SSE/SZSE 15:10 Asia/Shanghai" }],
  ["SZSE", { timeZone: "Asia/Shanghai", cutoffHour: 15, cutoffMinute: 10, label: "SSE/SZSE 15:10 Asia/Shanghai" }],
  ["HKEX", { timeZone: "Asia/Hong_Kong", cutoffHour: 16, cutoffMinute: 15, label: "HKEX 16:15 Asia/Hong_Kong" }],
  ["NASDAQ", { timeZone: "America/New_York", cutoffHour: 16, cutoffMinute: 15, label: "US 16:15 America/New_York" }],
  ["NYSE", { timeZone: "America/New_York", cutoffHour: 16, cutoffMinute: 15, label: "US 16:15 America/New_York" }],
  ["NYSE_ARCA", { timeZone: "America/New_York", cutoffHour: 16, cutoffMinute: 15, label: "US 16:15 America/New_York" }]
]);

export function getUnconfirmedMarketCloseReason(input: MarketCloseConfirmationInput): string | null {
  if (input.priceSource !== "yahoo_finance" && input.priceSource !== "eastmoney") {
    return null;
  }

  const exchange = input.sourceExchange ?? "";
  const rule = marketCloseRulesByExchange.get(exchange);

  if (!rule) {
    return null;
  }

  const checkedAt = input.fetchedAt ?? input.createdAt ?? null;
  if (!checkedAt) {
    return null;
  }

  const parts = getTimeZoneParts(checkedAt, rule.timeZone);
  if (!parts) {
    return null;
  }

  if (parts.date !== input.priceDate) {
    return null;
  }

  const fetchedMinutes = parts.hour * 60 + parts.minute;
  const cutoffMinutes = rule.cutoffHour * 60 + rule.cutoffMinute;

  if (fetchedMinutes >= cutoffMinutes) {
    return null;
  }

  return `same-day ${exchange} price fetched before confirmed close cutoff ${rule.label}`;
}

export function findSuspectMarketClosePrices<T extends SuspectMarketClosePriceInput>(
  prices: T[]
): Array<T & SuspectMarketClosePrice> {
  return prices.flatMap((price) => {
    const reason = getUnconfirmedMarketCloseReason(price);
    if (!reason) {
      return [];
    }

    return [
      {
        ...price,
        reason,
        checkedAt: price.fetchedAt ?? price.createdAt ?? ""
      }
    ];
  });
}

function getTimeZoneParts(
  input: string,
  timeZone: string
): { date: string; hour: number; minute: number } | null {
  const date = new Date(input);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  const hour = Number(values.get("hour"));
  const minute = Number(values.get("minute"));

  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return {
    date: `${year}-${month}-${day}`,
    hour,
    minute
  };
}
