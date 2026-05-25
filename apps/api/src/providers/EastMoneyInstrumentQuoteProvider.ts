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

export interface EastMoneyInstrumentQuoteProviderOptions {
  fetchFn?: FetchLike;
  endpoint?: string;
}

const EASTMONEY_STOCK_ENDPOINT = "https://push2.eastmoney.com/api/qt/stock/get";
const SUPPORTED_CURRENCIES = new Set<CurrencyCode>(["CNY"]);

export class EastMoneyInstrumentQuoteProvider implements IInstrumentQuoteProvider {
  readonly name = "Eastmoney";

  private readonly fetchFn: FetchLike;
  private readonly endpoint: string;

  constructor(options: EastMoneyInstrumentQuoteProviderOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.endpoint = options.endpoint ?? EASTMONEY_STOCK_ENDPOINT;
  }

  async fetchLatestQuotes(input: FetchLatestInstrumentQuotesInput): Promise<InstrumentQuoteProviderResult> {
    const quotes: InstrumentQuoteProviderQuote[] = [];

    for (const instrument of input.instruments) {
      if (!SUPPORTED_CURRENCIES.has(instrument.currency)) {
        throw new Error(`Eastmoney instrument ${instrument.sourceSymbol} uses unsupported currency ${instrument.currency}.`);
      }

      const response = await this.fetchFn(this.buildUrl(instrument.sourceSymbol, instrument.sourceExchange));

      if (!response.ok) {
        throw new Error(`Eastmoney request failed for ${instrument.sourceSymbol} with status ${response.status}.`);
      }

      quotes.push(parseEastMoneyResponse(await response.json(), instrument.instrumentId, instrument.sourceSymbol, instrument.currency));
    }

    return {
      provider: this.name,
      fetchedAt: input.fetchedAt,
      quotes
    };
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
