import type { CurrencyCode } from "@family-ledger/shared";

export interface FetchLatestInstrumentQuotesInput {
  instruments: InstrumentQuoteProviderInstrument[];
  fetchedAt: string;
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
  quotePrice: string;
  currency: CurrencyCode;
}

export interface InstrumentQuoteProviderResult {
  provider: string;
  fetchedAt: string;
  quotes: InstrumentQuoteProviderQuote[];
}

export interface IInstrumentQuoteProvider {
  readonly name: string;
  fetchLatestQuotes(input: FetchLatestInstrumentQuotesInput): Promise<InstrumentQuoteProviderResult>;
}
