import { logCaughtError } from "../utils/errorLogging";
import { runPriceBatch, providerHttpError } from "@family-ledger/shared";
import { logDependencyError } from "../utils/errorLogging";
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
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}

type FetchLike = (url: string, options?: { signal: AbortSignal }) => Promise<FetchResponseLike>;

export interface YahooFinanceInstrumentQuoteProviderOptions {
  fetchFn?: FetchLike;
  endpointBaseUrl?: string;
}

const YAHOO_CHART_ENDPOINT_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const SUPPORTED_CURRENCIES = new Set<CurrencyCode>(["USD", "HKD"]);

export class YahooFinanceInstrumentQuoteProvider implements IInstrumentQuoteProvider {
  readonly capabilities = { latestQuote: true, dailyHistory: false, nativeBatch: false, maximumBatchSize: 1 };
  readonly name = "Yahoo Finance";

  private readonly fetchFn: FetchLike;
  private readonly endpointBaseUrl: string;

  constructor(options: YahooFinanceInstrumentQuoteProviderOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.endpointBaseUrl = options.endpointBaseUrl ?? YAHOO_CHART_ENDPOINT_BASE_URL;
  }

  async fetchLatestQuotes(input: FetchLatestInstrumentQuotesInput): Promise<InstrumentQuoteProviderResult> {
    const signal = input.signal ?? AbortSignal.timeout(6000);
    const errors: unknown[] = [];
    const items = await runPriceBatch(input.instruments, {
      key: instrument => instrument.instrumentId,
      concurrency: 2,
      signal,
      acquire: async instrument => {
        try {
          if (!SUPPORTED_CURRENCIES.has(instrument.currency)) throw new Error("Yahoo Finance currency is unsupported.");
          const response = await this.fetchFn(this.buildUrl(instrument.sourceSymbol), { signal });
          if (!response.ok) throw providerHttpError(response);
          return parseYahooChartResponse(await response.json(), instrument.instrumentId, instrument.sourceSymbol, instrument.currency);
        } catch (error) { errors.push(error); throw error; }
      }
    });
    const quotes = items.flatMap(item => item.status === "success" ? [item.value] : []);
    if (!quotes.length && errors.length && !signal.aborted) throw errors[0];
    return { provider: this.name, fetchedAt: input.fetchedAt, quotes, items };
  }

  async fetchBatch(input: FetchLatestInstrumentQuotesInput & { queries: import("@family-ledger/shared").PriceQuery[] }): Promise<import("@family-ledger/shared").PriceBatchResult<InstrumentQuoteProviderQuote>> {
    const requested = [...new Map(input.queries.map(query => [query.instrumentId, query])).values()];
    const eligible = input.instruments.filter(instrument => requested.some(query => query.kind === "latest_quote" && query.instrumentId === instrument.instrumentId && query.sourceSymbol === instrument.sourceSymbol));
    let result: InstrumentQuoteProviderResult;
    try { result = await this.fetchLatestQuotes({...input, instruments: eligible}); }
    catch (error) { logCaughtError("YahooFinanceInstrumentQuoteProvider.fetchBatch", error); result = {provider: this.name, fetchedAt: input.fetchedAt, quotes: []}; }
    return {provider: this.name, fetchedAt: input.fetchedAt, items: requested.map(query => {
      if (query.kind !== "latest_quote") return {key: query.instrumentId, status: "unsupported" as const, reason: "HISTORY_REQUIRES_DAILY_ADAPTER"};
      const value = result.quotes.find(quote => quote.instrumentId === query.instrumentId && quote.sourceSymbol === query.sourceSymbol);
      return value ? {key: query.instrumentId, status: "success" as const, value} : {key: query.instrumentId, status: "failed" as const, reason: "ACQUISITION_FAILED" as const};
    })};
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
    logDependencyError("YahooFinanceInstrumentQuoteProvider.parseYahooChartResponse", error, []);
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
    quoteAt: new Date(Number(meta.regularMarketTime) * 1000).toISOString(),
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
