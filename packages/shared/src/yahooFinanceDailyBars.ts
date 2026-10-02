import Decimal from "decimal.js";
import type { CurrencyCode } from "./index";

export interface YahooFinanceDailyBar {
  priceDate: string;
  closePrice: string;
}

export interface YahooFinanceDailyBarsResult {
  sourceSymbol: string;
  currency: CurrencyCode;
  exchangeTimeZone: string;
  fetchedAt: string;
  bars: YahooFinanceDailyBar[];
}

export interface FetchYahooFinanceDailyBarsInput {
  sourceSymbol: string;
  expectedCurrency: CurrencyCode;
  fetchedAt: string;
  fromDate?: string;
  expectedExchangeTimeZone?: string;
  confirmationCutoff?: {
    timeZone: string;
    hour: number;
    minute: number;
  };
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type YahooFinanceFetch = (url: string) => Promise<FetchResponseLike>;

export interface YahooFinanceDailyBarsOptions {
  fetchFn?: YahooFinanceFetch;
  endpointBaseUrl?: string;
}

const DEFAULT_ENDPOINT = "https://query1.finance.yahoo.com/v8/finance/chart";

export async function fetchYahooFinanceDailyBars(
  input: FetchYahooFinanceDailyBarsInput,
  options: YahooFinanceDailyBarsOptions = {}
): Promise<YahooFinanceDailyBarsResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = buildYahooChartUrl(input, options.endpointBaseUrl ?? DEFAULT_ENDPOINT);
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(`Yahoo Finance request failed for ${input.sourceSymbol} with status ${response.status}.`);
  }

  return parseYahooFinanceDailyBars(await response.json(), input);
}

export function parseYahooFinanceDailyBars(
  value: unknown,
  input: FetchYahooFinanceDailyBarsInput
): YahooFinanceDailyBarsResult {
  const root = asRecord(value, `Yahoo Finance response for ${input.sourceSymbol}`);
  const chart = asRecord(root.chart, `Yahoo Finance chart for ${input.sourceSymbol}`);
  if (chart.error !== null && chart.error !== undefined) {
    throw new Error(`Yahoo Finance returned an error for ${input.sourceSymbol}.`);
  }

  const result = asArray(chart.result, `Yahoo Finance result for ${input.sourceSymbol}`);
  const firstResult = asRecord(result[0], `Yahoo Finance result item for ${input.sourceSymbol}`);
  const meta = asRecord(firstResult.meta, `Yahoo Finance meta for ${input.sourceSymbol}`);
  const returnedSymbol = optionalString(meta.symbol);
  if (returnedSymbol && returnedSymbol !== input.sourceSymbol) {
    throw new Error(`Yahoo Finance returned ${returnedSymbol} for ${input.sourceSymbol}.`);
  }

  const currency = requiredString(meta.currency, `Yahoo Finance currency for ${input.sourceSymbol}`) as CurrencyCode;
  if (currency !== input.expectedCurrency) {
    throw new Error(`Yahoo Finance returned ${currency} currency for ${input.sourceSymbol}; expected ${input.expectedCurrency}.`);
  }

  const exchangeTimeZone = requiredString(
    meta.exchangeTimezoneName,
    `Yahoo Finance exchange timezone for ${input.sourceSymbol}`
  );
  if (input.expectedExchangeTimeZone && exchangeTimeZone !== input.expectedExchangeTimeZone) {
    throw new Error(
      `Yahoo Finance returned ${exchangeTimeZone} timezone for ${input.sourceSymbol}; expected ${input.expectedExchangeTimeZone}.`
    );
  }

  const timestamps = asArray(firstResult.timestamp, `Yahoo Finance timestamps for ${input.sourceSymbol}`);
  const indicators = asRecord(firstResult.indicators, `Yahoo Finance indicators for ${input.sourceSymbol}`);
  const quote = asArray(indicators.quote, `Yahoo Finance quote for ${input.sourceSymbol}`);
  const firstQuote = asRecord(quote[0], `Yahoo Finance quote item for ${input.sourceSymbol}`);
  const closes = asArray(firstQuote.close, `Yahoo Finance close prices for ${input.sourceSymbol}`);
  const fetchedAt = new Date(input.fetchedAt);
  if (Number.isNaN(fetchedAt.getTime())) {
    throw new Error("Yahoo Finance fetch time is invalid.");
  }

  const barsByDate = new Map<string, YahooFinanceDailyBar>();
  const count = Math.min(timestamps.length, closes.length);
  for (let index = 0; index < count; index += 1) {
    const timestamp = timestamps[index];
    const close = closes[index];
    if (close === null || close === undefined) continue;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      throw new Error(`Yahoo Finance timestamp is invalid for ${input.sourceSymbol}.`);
    }

    const priceDate = dateInTimeZone(new Date(timestamp * 1000), exchangeTimeZone);
    if (input.fromDate && priceDate < input.fromDate) continue;
    if (input.confirmationCutoff && !isConfirmedBar(priceDate, fetchedAt, input.confirmationCutoff)) continue;
    const closePrice = positiveDecimal(close, `Yahoo Finance close price for ${input.sourceSymbol}`);
    barsByDate.set(priceDate, { priceDate, closePrice });
  }

  const bars = [...barsByDate.values()].sort((left, right) => left.priceDate.localeCompare(right.priceDate));
  if (bars.length === 0) {
    throw new Error(`Yahoo Finance returned no confirmed daily close for ${input.sourceSymbol}.`);
  }

  return { sourceSymbol: input.sourceSymbol, currency, exchangeTimeZone, fetchedAt: input.fetchedAt, bars };
}

function buildYahooChartUrl(input: FetchYahooFinanceDailyBarsInput, endpointBaseUrl: string): string {
  const url = new URL(`${endpointBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(input.sourceSymbol)}`);
  url.searchParams.set("interval", "1d");
  if (input.fromDate) {
    const from = Date.parse(`${input.fromDate}T00:00:00Z`);
    const through = Date.parse(input.fetchedAt);
    if (!Number.isFinite(from) || !Number.isFinite(through)) throw new Error("Yahoo Finance date range is invalid.");
    url.searchParams.set("period1", String(Math.floor(from / 1000) - 172800));
    url.searchParams.set("period2", String(Math.floor(through / 1000) + 172800));
  } else {
    url.searchParams.set("range", "10d");
  }
  return url.toString();
}

function isConfirmedBar(
  priceDate: string,
  fetchedAt: Date,
  cutoff: { timeZone: string; hour: number; minute: number }
): boolean {
  const fetched = dateTimeParts(fetchedAt, cutoff.timeZone);
  if (priceDate < fetched.date) return true;
  if (priceDate > fetched.date) return false;
  return fetched.hour * 60 + fetched.minute >= cutoff.hour * 60 + cutoff.minute;
}

function dateInTimeZone(date: Date, timeZone: string): string {
  return dateTimeParts(date, timeZone).date;
}

function dateTimeParts(date: Date, timeZone: string): { date: string; hour: number; minute: number } {
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
    throw new Error(`Failed to resolve Yahoo Finance date in ${timeZone}.`);
  }
  return { date: `${year}-${month}-${day}`, hour, minute };
}

function positiveDecimal(value: unknown, field: string): string {
  if (typeof value !== "number" && typeof value !== "string") throw new Error(`${field} is missing.`);
  const decimal = new Decimal(value);
  if (!decimal.isFinite() || decimal.lte(0)) throw new Error(`${field} must be positive.`);
  return decimal.toString();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function requiredString(value: unknown, field: string): string {
  const result = optionalString(value);
  if (!result) throw new Error(`${field} is missing.`);
  return result;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} must be a non-empty array.`);
  return value;
}
