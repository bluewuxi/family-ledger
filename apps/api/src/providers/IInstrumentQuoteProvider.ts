import type { CurrencyCode } from "@family-ledger/shared";

export interface FetchLatestInstrumentQuotesInput {
  instruments: InstrumentQuoteProviderInstrument[];
  fetchedAt: string;
  signal?: AbortSignal;
}

export interface InstrumentQuoteProviderInstrument {
  instrumentId: string;
  sourceSymbol: string;
  currency: CurrencyCode;
  sourceExchange?: string | null;
}

export interface InstrumentQuoteProviderQuote {
  instrumentId: string;
  sourceSymbol: string;
  quoteDate: string;
  quoteAt?: string;
  quotePrice: string;
  currency: CurrencyCode;
}

export interface InstrumentQuoteProviderResult {
  provider: string;
  fetchedAt: string;
  quotes: InstrumentQuoteProviderQuote[];
  items?: import("@family-ledger/shared").PriceItemOutcome<InstrumentQuoteProviderQuote>[];
}

export interface IInstrumentQuoteProvider {
  readonly name: string;
  readonly capabilities?: import("@family-ledger/shared").ProviderCapabilities;
  fetchBatch?(input: FetchLatestInstrumentQuotesInput & { queries: import("@family-ledger/shared").PriceQuery[] }): Promise<import("@family-ledger/shared").PriceBatchResult<InstrumentQuoteProviderQuote>>;
  fetchLatestQuotes(input: FetchLatestInstrumentQuotesInput): Promise<InstrumentQuoteProviderResult>;
}
