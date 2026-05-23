import type { CurrencyCode } from "@family-ledger/shared";

export interface FetchLatestFxRatesInput {
  baseCurrency: "USD";
  targetCurrencies: CurrencyCode[];
  fetchedAt: string;
}

export interface FxRateProviderRate {
  currency: CurrencyCode;
  providerRate: string;
}

export interface FxRateProviderResult {
  provider: string;
  baseCurrency: "USD";
  rateDate: string;
  fetchedAt: string;
  rates: FxRateProviderRate[];
}

export interface IFxRateProvider {
  readonly name: string;
  fetchLatestRates(input: FetchLatestFxRatesInput): Promise<FxRateProviderResult>;
}
