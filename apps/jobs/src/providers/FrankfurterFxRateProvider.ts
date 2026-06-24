import Decimal from "decimal.js";
import type { CurrencyCode } from "@family-ledger/shared";
import type { FetchLatestFxRatesInput, FxRateProviderResult, IFxRateProvider } from "./IFxRateProvider";

interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type FetchLike = (url: string) => Promise<FetchResponseLike>;

interface FrankfurterLatestResponse {
  base?: unknown;
  date?: unknown;
  rates?: unknown;
}

export interface FrankfurterFxRateProviderOptions {
  fetchFn?: FetchLike;
  endpoint?: string;
}

const FRANKFURTER_ENDPOINT = "https://api.frankfurter.app";
const SUPPORTED_CURRENCY_CODES = new Set<CurrencyCode>(["NZD", "USD", "HKD", "CNY", "GBP", "EUR"]);

export class FrankfurterFxRateProvider implements IFxRateProvider {
  readonly name = "Frankfurter";

  private readonly fetchFn: FetchLike;
  private readonly endpoint: string;

  constructor(options: FrankfurterFxRateProviderOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.endpoint = options.endpoint ?? FRANKFURTER_ENDPOINT;
  }

  async fetchLatestRates(input: FetchLatestFxRatesInput): Promise<FxRateProviderResult> {
    const targetCurrencies = uniqueCurrencies(input.targetCurrencies).filter((currency) => currency !== "USD");

    if (targetCurrencies.length === 0) {
      throw new Error("At least one non-USD target currency is required.");
    }

    const path = input.rateDate ?? "latest";
    const url = new URL(path, this.endpoint.endsWith("/") ? this.endpoint : `${this.endpoint}/`);
    url.searchParams.set("from", input.baseCurrency);
    url.searchParams.set("to", targetCurrencies.join(","));

    const response = await this.fetchFn(url.toString());

    if (!response.ok) {
      throw new Error(`Frankfurter request failed with status ${response.status}.`);
    }

    const body = parseFrankfurterResponse(await response.json());

    if (body.base !== input.baseCurrency) {
      throw new Error("Frankfurter response base currency is invalid.");
    }

    const rateDate = requiredDateString(body.date, "date");
    const ratesRecord = asRateRecord(body.rates);

    return {
      provider: this.name,
      baseCurrency: input.baseCurrency,
      rateDate,
      fetchedAt: input.fetchedAt,
      rates: targetCurrencies.map((currency) => ({
        currency,
        providerRate: requiredPositiveRate(ratesRecord[currency], currency)
      }))
    };
  }
}

function uniqueCurrencies(currencies: CurrencyCode[]): CurrencyCode[] {
  return [...new Set(currencies)];
}

function parseFrankfurterResponse(value: unknown): FrankfurterLatestResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Frankfurter response must be a JSON object.");
  }

  return value as FrankfurterLatestResponse;
}

function requiredDateString(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Frankfurter response ${field} is invalid.`);
  }

  return value;
}

function asRateRecord(value: unknown): Partial<Record<CurrencyCode, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Frankfurter response rates are invalid.");
  }

  return value as Partial<Record<CurrencyCode, unknown>>;
}

function requiredPositiveRate(value: unknown, currency: CurrencyCode): string {
  if (!SUPPORTED_CURRENCY_CODES.has(currency)) {
    throw new Error(`Currency ${currency} is not supported.`);
  }

  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`Frankfurter response is missing rate for ${currency}.`);
  }

  const rate = new Decimal(value);

  if (!rate.isFinite() || rate.lte(0)) {
    throw new Error(`Frankfurter response rate for ${currency} must be positive.`);
  }

  return rate.toString();
}
