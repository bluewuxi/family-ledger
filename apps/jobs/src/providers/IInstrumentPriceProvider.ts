import type { CurrencyCode } from "@family-ledger/shared";

export interface FetchLatestInstrumentPricesInput {
  instruments: InstrumentPriceProviderInstrument[];
  fetchedAt: string;
}

export interface InstrumentPriceProviderInstrument {
  instrumentId: string;
  sourceSymbol: string;
  providerInstrumentName: string;
  currency: CurrencyCode;
  sourceExchange?: string | null;
}

export interface InstrumentPriceProviderPrice {
  sourceSymbol: string;
  priceDate: string;
  closePrice: string;
  currency: CurrencyCode;
  isEstimated?: boolean;
}

export interface InstrumentPriceProviderResult {
  provider: string;
  fetchedAt: string;
  prices: InstrumentPriceProviderPrice[];
  skippedSourceSymbols?: string[];
}

export interface IInstrumentPriceProvider {
  readonly name: string;
  fetchLatestPrices(input: FetchLatestInstrumentPricesInput): Promise<InstrumentPriceProviderResult>;
}
