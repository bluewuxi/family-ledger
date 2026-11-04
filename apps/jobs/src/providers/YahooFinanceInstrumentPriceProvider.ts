import {
  fetchYahooFinanceDailyBars,
  runPriceBatch,
  type CurrencyCode,
  type YahooFinanceFetch
} from "@family-ledger/shared";
import type {
  FetchLatestInstrumentPricesInput,
  InstrumentPriceProviderResult,
  IInstrumentPriceProvider
} from "./IInstrumentPriceProvider";
import { getUnconfirmedMarketCloseReason } from "../services/marketClosePolicy";

export interface YahooFinanceInstrumentPriceProviderOptions {
  fetchFn?: YahooFinanceFetch;
  endpointBaseUrl?: string;
}

const SUPPORTED_CURRENCIES = new Set<CurrencyCode>(["USD", "HKD", "NZD"]);

export class YahooFinanceInstrumentPriceProvider implements IInstrumentPriceProvider {
  readonly capabilities = { latestQuote: false, dailyHistory: true, nativeBatch: false, maximumBatchSize: 1 };
  readonly name = "Yahoo Finance";

  constructor(private readonly options: YahooFinanceInstrumentPriceProviderOptions = {}) {}

  async fetchBatch(input: FetchLatestInstrumentPricesInput & {queries: import("@family-ledger/shared").PriceQuery[]}): Promise<import("@family-ledger/shared").PriceBatchResult<import("./IInstrumentPriceProvider").InstrumentPriceProviderPrice[]>> {
    const items = await runPriceBatch(input.queries, {key: query => query.kind === "daily_history" ? `${query.instrumentId}:${query.fromDate}:${query.toDate}` : query.instrumentId, concurrency: 2, acquire: async query => {
      if (query.kind !== "daily_history") throw new Error("Daily adapter requires daily history.");
      const instrument = input.instruments.find(row => row.instrumentId === query.instrumentId && row.sourceSymbol === query.sourceSymbol);
      if (!instrument) throw new Error("Historical instrument identity is unavailable.");
      const result = await fetchYahooFinanceDailyBars({sourceSymbol: query.sourceSymbol, expectedCurrency: instrument.currency, fetchedAt: input.fetchedAt, fromDate: query.fromDate, toDate: query.toDate,
       ...(instrument.sourceExchange === "NZX" ? {expectedExchangeTimeZone: "Pacific/Auckland", confirmationCutoff: {timeZone: "Pacific/Auckland", hour: 17, minute: 15}} : {})}, this.options);
      return result.bars.flatMap(bar => bar.closePrice && !getUnconfirmedMarketCloseReason({priceDate: bar.priceDate, fetchedAt: input.fetchedAt, priceSource: "yahoo_finance", sourceExchange: instrument.sourceExchange}) ? [{sourceSymbol: query.sourceSymbol, priceDate: bar.priceDate, closePrice: bar.closePrice, currency: instrument.currency}] : []);
    }});
    const coverage = input.queries.flatMap(query => {
      if (query.kind !== "daily_history") return [];
      const item = items.find(row => row.key === `${query.instrumentId}:${query.fromDate}:${query.toDate}`);
      const coveredDates = item?.status === "success" ? item.value.map(price => price.priceDate) : [];
      const missingDates: string[] = [];
      for (let date = query.fromDate; date <= query.toDate;) {
        if (!coveredDates.includes(date)) missingDates.push(date);
        const next = new Date(date + "T00:00:00Z"); next.setUTCDate(next.getUTCDate() + 1); date = next.toISOString().slice(0, 10);
      }
      return [{instrumentId: query.instrumentId, fromDate: query.fromDate, toDate: query.toDate, coveredDates, missingDates, supported: true}];
    });
    return {provider: this.name, fetchedAt: input.fetchedAt, items, coverage};
  }
  async fetchLatestPrices(input: FetchLatestInstrumentPricesInput): Promise<InstrumentPriceProviderResult> {
    const errors: unknown[] = [];
    const items = await runPriceBatch(input.instruments, { key: i => i.instrumentId ?? i.sourceSymbol, concurrency: 2, acquire: async instrument => {
      try {
      if (!SUPPORTED_CURRENCIES.has(instrument.currency)) {
        throw new Error(`Yahoo Finance instrument ${instrument.sourceSymbol} uses unsupported currency ${instrument.currency}.`);
      }
      const isNzx = instrument.sourceExchange === "NZX";
      const result = await fetchYahooFinanceDailyBars(
        {
          sourceSymbol: instrument.sourceSymbol,
          expectedCurrency: instrument.currency,
          fetchedAt: input.fetchedAt,
          ...(isNzx
            ? {
                expectedExchangeTimeZone: "Pacific/Auckland",
                confirmationCutoff: { timeZone: "Pacific/Auckland", hour: 17, minute: 15 }
              }
            : {})
        },
        this.options
      );
      const latest = result.bars.at(-1);
      if (!latest?.closePrice) throw new Error(`Yahoo Finance response is missing close price for ${instrument.sourceSymbol}.`);
      return {
        sourceSymbol: instrument.sourceSymbol,
        priceDate: latest.priceDate,
        closePrice: latest.closePrice,
        currency: instrument.currency
      };
      } catch(error) { errors.push(error); throw error; }
    } });
    const prices = items.flatMap(item => item.status === "success" ? [item.value] : []);
    if (!prices.length && errors.length) throw errors[0];
    return { provider: this.name, fetchedAt: input.fetchedAt, prices, items };
  }
}

/** Uses the existing daily chart endpoint; missing dates stay unresolved. */
export const yahooHistoricalRecoveryProvider = {
 source: "yahoo_finance",
 async fetchHistory(input: { instrumentId: string; sourceSymbol: string; currency: CurrencyCode; sourceExchange: string | null; fromDate: string; toDate: string; fetchedAt: string; signal: AbortSignal }) {
  const result = await fetchYahooFinanceDailyBars({ sourceSymbol: input.sourceSymbol, expectedCurrency: input.currency, fetchedAt: input.fetchedAt, fromDate: input.fromDate, toDate: input.toDate,
   ...(input.sourceExchange === "NZX" ? { expectedExchangeTimeZone: "Pacific/Auckland", confirmationCutoff: { timeZone: "Pacific/Auckland", hour: 17, minute: 15 } } : {}) }, {fetchFn: url => fetch(url, {signal: input.signal})});
  return result.bars.flatMap(bar => bar.closePrice && !getUnconfirmedMarketCloseReason({priceDate: bar.priceDate, fetchedAt: input.fetchedAt, priceSource: "yahoo_finance", sourceExchange: input.sourceExchange}) ? [{instrumentId: input.instrumentId, priceDate: bar.priceDate, closePrice: bar.closePrice, currency: input.currency, provider: "Yahoo Finance", sourceSymbol: input.sourceSymbol, isAdjusted: false, isEstimated: false, fetchedAt: input.fetchedAt}] : []);
 }
};
