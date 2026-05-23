import Decimal from "decimal.js";
import type { CurrencyCode } from "@family-ledger/shared";
import type {
  FetchLatestInstrumentPricesInput,
  InstrumentPriceProviderPrice,
  InstrumentPriceProviderResult,
  IInstrumentPriceProvider
} from "./IInstrumentPriceProvider";

interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type FetchLike = (url: string) => Promise<FetchResponseLike>;

export interface YahooFinanceInstrumentPriceProviderOptions {
  fetchFn?: FetchLike;
  endpointBaseUrl?: string;
}

const YAHOO_CHART_ENDPOINT_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const SUPPORTED_CURRENCIES = new Set<CurrencyCode>(["USD", "HKD"]);

export class YahooFinanceInstrumentPriceProvider implements IInstrumentPriceProvider {
  readonly name = "Yahoo Finance";

  private readonly fetchFn: FetchLike;
  private readonly endpointBaseUrl: string;

  constructor(options: YahooFinanceInstrumentPriceProviderOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.endpointBaseUrl = options.endpointBaseUrl ?? YAHOO_CHART_ENDPOINT_BASE_URL;
  }

  async fetchLatestPrices(input: FetchLatestInstrumentPricesInput): Promise<InstrumentPriceProviderResult> {
    const prices: InstrumentPriceProviderPrice[] = [];

    for (const instrument of input.instruments) {
      if (!SUPPORTED_CURRENCIES.has(instrument.currency)) {
        throw new Error(`Yahoo Finance instrument ${instrument.sourceSymbol} uses unsupported currency ${instrument.currency}.`);
      }

      const response = await this.fetchFn(this.buildUrl(instrument.sourceSymbol));

      if (!response.ok) {
        throw new Error(`Yahoo Finance request failed for ${instrument.sourceSymbol} with status ${response.status}.`);
      }

      prices.push(parseYahooChartResponse(await response.json(), instrument.sourceSymbol, instrument.currency));
    }

    return {
      provider: this.name,
      fetchedAt: input.fetchedAt,
      prices
    };
  }

  private buildUrl(sourceSymbol: string): string {
    const url = new URL(`${this.endpointBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(sourceSymbol)}`);
    url.searchParams.set("range", "5d");
    url.searchParams.set("interval", "1d");
    return url.toString();
  }
}

function parseYahooChartResponse(
  value: unknown,
  sourceSymbol: string,
  expectedCurrency: CurrencyCode
): InstrumentPriceProviderPrice {
  const root = asRecord(value, `Yahoo Finance response for ${sourceSymbol}`);
  const chart = asRecord(root.chart, `Yahoo Finance chart for ${sourceSymbol}`);
  const error = chart.error;

  if (error !== null && error !== undefined) {
    throw new Error(`Yahoo Finance returned an error for ${sourceSymbol}.`);
  }

  const result = asArray(chart.result, `Yahoo Finance result for ${sourceSymbol}`);
  const firstResult = asRecord(result[0], `Yahoo Finance result item for ${sourceSymbol}`);
  const meta = asRecord(firstResult.meta, `Yahoo Finance meta for ${sourceSymbol}`);
  const returnedSymbol = meta.symbol;

  if (typeof returnedSymbol === "string" && returnedSymbol !== sourceSymbol) {
    throw new Error(`Yahoo Finance returned ${returnedSymbol} for ${sourceSymbol}.`);
  }

  const currency = requiredString(meta.currency, `Yahoo Finance currency for ${sourceSymbol}`);

  if (currency !== expectedCurrency) {
    throw new Error(`Yahoo Finance returned ${currency} currency for ${sourceSymbol}; expected ${expectedCurrency}.`);
  }

  const timestamps = asArray(firstResult.timestamp, `Yahoo Finance timestamps for ${sourceSymbol}`);
  const indicators = asRecord(firstResult.indicators, `Yahoo Finance indicators for ${sourceSymbol}`);
  const quote = asArray(indicators.quote, `Yahoo Finance quote for ${sourceSymbol}`);
  const firstQuote = asRecord(quote[0], `Yahoo Finance quote item for ${sourceSymbol}`);
  const closes = asArray(firstQuote.close, `Yahoo Finance close prices for ${sourceSymbol}`);
  const latest = latestClose(timestamps, closes, sourceSymbol);

  return {
    sourceSymbol,
    priceDate: timestampToIsoDate(latest.timestamp, sourceSymbol),
    closePrice: requiredPositiveDecimal(latest.close, `Yahoo Finance close price for ${sourceSymbol}`),
    currency: expectedCurrency
  };
}

function latestClose(timestamps: unknown[], closes: unknown[], sourceSymbol: string): { timestamp: unknown; close: unknown } {
  const count = Math.min(timestamps.length, closes.length);

  for (let index = count - 1; index >= 0; index -= 1) {
    const close = closes[index];

    if (close !== null && close !== undefined) {
      return { timestamp: timestamps[index], close };
    }
  }

  throw new Error(`Yahoo Finance response is missing close price for ${sourceSymbol}.`);
}

function timestampToIsoDate(value: unknown, sourceSymbol: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Yahoo Finance timestamp is invalid for ${sourceSymbol}.`);
  }

  const date = new Date(value * 1000);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Yahoo Finance timestamp is invalid for ${sourceSymbol}.`);
  }

  return date.toISOString().slice(0, 10);
}

function requiredPositiveDecimal(value: unknown, field: string): string {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`${field} is missing.`);
  }

  const decimal = new Decimal(value);

  if (!decimal.isFinite() || decimal.lte(0)) {
    throw new Error(`${field} must be positive.`);
  }

  return decimal.toString();
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is missing.`);
  }

  return value;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array.`);
  }

  return value;
}
