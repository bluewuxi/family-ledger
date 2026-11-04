import { runPriceBatch, providerHttpError } from "@family-ledger/shared";

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

export interface EastMoneyInstrumentQuoteProviderOptions {
  fetchFn?: FetchLike;
  endpoint?: string;
}

const EASTMONEY_STOCK_ENDPOINT = "https://push2.eastmoney.com/api/qt/stock/get";
const SUPPORTED_CURRENCIES = new Set<CurrencyCode>(["CNY"]);

export class EastMoneyInstrumentQuoteProvider implements IInstrumentQuoteProvider {
  readonly capabilities = { latestQuote: true, dailyHistory: false, nativeBatch: false, maximumBatchSize: 1 };
  readonly name = "Eastmoney";

  private readonly fetchFn: FetchLike;
  private readonly endpoint: string;

  constructor(options: EastMoneyInstrumentQuoteProviderOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.endpoint = options.endpoint ?? EASTMONEY_STOCK_ENDPOINT;
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
          if (!SUPPORTED_CURRENCIES.has(instrument.currency)) throw new Error("Eastmoney currency is unsupported.");
          const response = await this.fetchFn(this.buildUrl(instrument.sourceSymbol, instrument.sourceExchange), { signal });
          if (!response.ok) throw providerHttpError(response);
          return parseEastMoneyResponse(await response.json(), instrument.instrumentId, instrument.sourceSymbol, instrument.currency);
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
    catch { result = {provider: this.name, fetchedAt: input.fetchedAt, quotes: []}; }
    return {provider: this.name, fetchedAt: input.fetchedAt, items: requested.map(query => {
      if (query.kind !== "latest_quote") return {key: query.instrumentId, status: "unsupported" as const, reason: "HISTORY_REQUIRES_DAILY_ADAPTER"};
      const value = result.quotes.find(quote => quote.instrumentId === query.instrumentId && quote.sourceSymbol === query.sourceSymbol);
      return value ? {key: query.instrumentId, status: "success" as const, value} : {key: query.instrumentId, status: "failed" as const, reason: "ACQUISITION_FAILED" as const};
    })};
  }

  private buildUrl(sourceSymbol: string, sourceExchange: string | null | undefined): string {
    const marketPrefix = toEastMoneyMarketPrefix(sourceExchange, sourceSymbol);
    const url = new URL(this.endpoint);
    url.searchParams.set("secid", `${marketPrefix}.${sourceSymbol}`);
    url.searchParams.set("fields", "f43,f57,f58,f86");
    url.searchParams.set("fltt", "2");
    return url.toString();
  }
}

function parseEastMoneyResponse(
  value: unknown,
  instrumentId: string,
  sourceSymbol: string,
  expectedCurrency: CurrencyCode
): InstrumentQuoteProviderQuote {
  const root = asRecord(value, `Eastmoney response for ${sourceSymbol}`);
  const data = root.data;

  if (data === null || data === undefined) {
    throw new Error(`Eastmoney response is missing data for ${sourceSymbol}.`);
  }

  const row = asRecord(data, `Eastmoney data for ${sourceSymbol}`);
  const returnedSymbol = requiredString(row.f57, `Eastmoney symbol for ${sourceSymbol}`);

  if (returnedSymbol !== sourceSymbol) {
    throw new Error(`Eastmoney returned ${returnedSymbol} for ${sourceSymbol}.`);
  }

  return {
    instrumentId,
    sourceSymbol,
    quoteDate: timestampToIsoDate(row.f86, sourceSymbol),
    quoteAt: new Date(Number(row.f86) * 1000).toISOString(),
    quotePrice: requiredPositiveDecimal(row.f43, `Eastmoney quote price for ${sourceSymbol}`),
    currency: expectedCurrency
  };
}

function toEastMoneyMarketPrefix(sourceExchange: string | null | undefined, sourceSymbol: string): "0" | "1" {
  if (sourceExchange === "SZSE") {
    return "0";
  }

  if (sourceExchange === "SSE") {
    return "1";
  }

  throw new Error(`Eastmoney instrument ${sourceSymbol} uses unsupported exchange ${sourceExchange ?? "missing"}.`);
}

function timestampToIsoDate(value: unknown, sourceSymbol: string): string {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`Eastmoney timestamp is invalid for ${sourceSymbol}.`);
  }

  const timestamp = Number(value);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error(`Eastmoney timestamp is invalid for ${sourceSymbol}.`);
  }

  const date = new Date(timestamp * 1000);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Eastmoney timestamp is invalid for ${sourceSymbol}.`);
  }

  return date.toISOString().slice(0, 10);
}

function requiredPositiveDecimal(value: unknown, field: string): string {
  if (value === "-" || value === null || value === undefined || value === "") {
    throw new Error(`${field} is missing.`);
  }

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
