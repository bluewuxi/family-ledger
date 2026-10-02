import {
  fetchYahooFinanceDailyBars,
  type CurrencyCode,
  type YahooFinanceFetch
} from "@family-ledger/shared";
import type {
  FetchLatestInstrumentPricesInput,
  InstrumentPriceProviderPrice,
  InstrumentPriceProviderResult,
  IInstrumentPriceProvider
} from "./IInstrumentPriceProvider";

export interface YahooFinanceInstrumentPriceProviderOptions {
  fetchFn?: YahooFinanceFetch;
  endpointBaseUrl?: string;
}

const SUPPORTED_CURRENCIES = new Set<CurrencyCode>(["USD", "HKD", "NZD"]);

export class YahooFinanceInstrumentPriceProvider implements IInstrumentPriceProvider {
  readonly name = "Yahoo Finance";

  constructor(private readonly options: YahooFinanceInstrumentPriceProviderOptions = {}) {}

  async fetchLatestPrices(input: FetchLatestInstrumentPricesInput): Promise<InstrumentPriceProviderResult> {
    const prices: InstrumentPriceProviderPrice[] = [];
    for (const instrument of input.instruments) {
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
      if (!latest) throw new Error(`Yahoo Finance response is missing close price for ${instrument.sourceSymbol}.`);
      prices.push({
        sourceSymbol: instrument.sourceSymbol,
        priceDate: latest.priceDate,
        closePrice: latest.closePrice,
        currency: instrument.currency
      });
    }
    return { provider: this.name, fetchedAt: input.fetchedAt, prices };
  }
}
