import type { CurrencyCode } from "@family-ledger/shared";

export interface FetchLatestInstrumentPricesInput {
  instruments: InstrumentPriceProviderInstrument[];
  fetchedAt: string;
}

export interface InstrumentPriceProviderInstrument {
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
}

export interface InstrumentPriceProviderResult {
  provider: string;
  fetchedAt: string;
  prices: InstrumentPriceProviderPrice[];
}

export interface IInstrumentPriceProvider {
  readonly name: string;
  fetchLatestPrices(input: FetchLatestInstrumentPricesInput): Promise<InstrumentPriceProviderResult>;
}
