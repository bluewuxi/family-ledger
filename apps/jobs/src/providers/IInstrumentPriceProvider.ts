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
  kernelNtaPlans?: import("@family-ledger/shared").KernelNtaPlan[];
  provider: string;
  fetchedAt: string;
  prices: InstrumentPriceProviderPrice[];
  items?: import("@family-ledger/shared").PriceItemOutcome<InstrumentPriceProviderPrice>[];
  skippedSourceSymbols?: string[];
}

export interface IInstrumentPriceProvider {
  readonly name: string;
  readonly capabilities?: import("@family-ledger/shared").ProviderCapabilities;
  fetchBatch?(input: FetchLatestInstrumentPricesInput & {queries: import("@family-ledger/shared").PriceQuery[]}): Promise<import("@family-ledger/shared").PriceBatchResult<InstrumentPriceProviderPrice[]>>;
  fetchLatestPrices(input: FetchLatestInstrumentPricesInput): Promise<InstrumentPriceProviderResult>;
}
