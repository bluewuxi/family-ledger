import Decimal from "decimal.js";
import type { CurrencyCode } from "@family-ledger/shared";
import type {
  FetchLatestInstrumentQuotesInput,
  InstrumentQuoteProviderQuote,
  InstrumentQuoteProviderResult,
  IInstrumentQuoteProvider
} from "./IInstrumentQuoteProvider";

interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type FetchLike = (url: string) => Promise<FetchResponseLike>;

export interface YahooFinanceInstrumentQuoteProviderOptions {
  fetchFn?: FetchLike;
  endpointBaseUrl?: string;
}

const YAHOO_CHART_ENDPOINT_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const SUPPORTED_CURRENCIES = new Set<CurrencyCode>(["USD", "HKD"]);

export class YahooFinanceInstrumentQuoteProvider implements IInstrumentQuoteProvider {
  readonly name = "Yahoo Finance";

  private readonly fetchFn: FetchLike;
  private readonly endpointBaseUrl: string;

  constructor(options: YahooFinanceInstrumentQuoteProviderOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.endpointBaseUrl = options.endpointBaseUrl ?? YAHOO_CHART_ENDPOINT_BASE_URL;
  }

  async fetchLatestQuotes(input: FetchLatestInstrumentQuotesInput): Promise<InstrumentQuoteProviderResult> {
    const quotes: InstrumentQuoteProviderQuote[] = [];

    for (const instrument of input.instruments) {
      if (!SUPPORTED_CURRENCIES.has(instrument.currency)) {
        throw new Error(`Yahoo Finance instrument ${instrument.sourceSymbol} uses unsupported currency ${instrument.currency}.`);
      }

      const response = await this.fetchFn(this.buildUrl(instrument.sourceSymbol));

      if (!response.ok) {
        throw new Error(`Yahoo Finance request failed for ${instrument.sourceSymbol} with status ${response.status}.`);
      }

      quotes.push(parseYahooChartResponse(await response.json(), instrument.instrumentId, instrument.sourceSymbol, instrument.currency));
    }

    return {
      provider: this.name,
      fetchedAt: input.fetchedAt,
      quotes
    };
  }

  private buildUrl(sourceSymbol: string): string {
    const url = new URL(`${this.endpointBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(sourceSymbol)}`);
    url.searchParams.set("range", "1d");
    url.searchParams.set("interval", "1m");
    return url.toString();
  }
}

function parseYahooChartResponse(
  value: unknown,
  instrumentId: string,
  sourceSymbol: string,
  expectedCurrency: CurrencyCode
): InstrumentQuoteProviderQuote {
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

  return {
    instrumentId,
    sourceSymbol,
    quoteDate: timestampToIsoDate(meta.regularMarketTime, sourceSymbol),
    quotePrice: requiredPositiveDecimal(meta.regularMarketPrice, `Yahoo Finance quote price for ${sourceSymbol}`),
    currency: expectedCurrency
  };
}

function timestampToIsoDate(value: unknown, sourceSymbol: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Yahoo Finance quote timestamp is invalid for ${sourceSymbol}.`);
  }

  const date = new Date(value * 1000);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Yahoo Finance quote timestamp is invalid for ${sourceSymbol}.`);
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
