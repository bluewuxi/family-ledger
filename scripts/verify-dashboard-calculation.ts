import assert from "node:assert/strict";
import type {
  ExchangeRateRecord,
  DashboardQuoteRecord,
  HoldingSummary,
  Instrument,
  InvestmentAccount,
  PriceRecord
} from "@family-ledger/shared";
import { calculateDashboardSummary, refreshDashboardQuotes } from "../apps/api/src/services/dashboardService";
import type {
  FetchLatestInstrumentQuotesInput,
  InstrumentQuoteProviderResult,
  IInstrumentQuoteProvider
} from "../apps/api/src/providers/IInstrumentQuoteProvider";
import { calculateHoldingsValuation } from "../apps/api/src/services/portfolioValuationService";

const accounts = [account("account-a"), account("account-b"), account("empty-account")];
const usdSecurity = holding("usd-security", "US ETF", "etf", "USD", "2", "100");
const nzdSecurity = holding("nzd-security", "NZ Fund", "pie_fund", "NZD", "3", "90");
const usdCash = holding("usd-cash", "USD Cash", "cash", "USD", "10", null);
const holdings = [usdSecurity, nzdSecurity, usdCash];
const prices = [
  price("usd-latest", usdSecurity.instrumentId, "2026-05-22", "70", "USD"),
  price("usd-previous", usdSecurity.instrumentId, "2026-05-21", "65", "USD"),
  price("nzd-latest", nzdSecurity.instrumentId, "2026-05-22", "40", "NZD"),
  price("nzd-previous", nzdSecurity.instrumentId, "2026-05-21", "39", "NZD")
];
const fxRates = [fxRate("nzd-usd", "NZD", "0.6666666667"), fxRate("cny-usd", "CNY", "0.14")];

const complete = calculateDashboardSummary(holdings, accounts, prices, fxRates);
assert.deepEqual(complete, {
  reportingCurrency: "NZD",
  totalAssets: "345.00",
  todayChange: "18.00",
  todayChangePct: "5.50",
  unrealizedGain: "90.00",
  accountCount: 3,
  quoteFetchedAt: null,
  quoteDate: null,
  warnings: []
});

const valuedHoldings = calculateHoldingsValuation(holdings, prices, fxRates, "NZD");
assert.equal(valuedHoldings.totalMarketValue, "345.00");
assert.equal(valuedHoldings.totalUnrealizedGain, "90.00");
assert.equal(valuedHoldings.holdings.find((holding) => holding.instrumentId === usdSecurity.instrumentId)?.marketValue, "210.00");
assert.equal(
  valuedHoldings.holdings.find((holding) => holding.instrumentId === usdSecurity.instrumentId)?.unrealizedGain,
  "60.00"
);
assert.equal(valuedHoldings.holdings.find((holding) => holding.instrumentId === usdSecurity.instrumentId)?.latestPrice, "70");

const completeUsd = calculateDashboardSummary(holdings, accounts, prices, fxRates, "USD");
assert.deepEqual(completeUsd, {
  reportingCurrency: "USD",
  totalAssets: "230.00",
  todayChange: "12.00",
  todayChangePct: "5.50",
  unrealizedGain: "60.00",
  accountCount: 3,
  quoteFetchedAt: null,
  quoteDate: null,
  warnings: []
});

const completeCny = calculateDashboardSummary(holdings, accounts, prices, fxRates, "CNY");
assert.deepEqual(completeCny, {
  reportingCurrency: "CNY",
  totalAssets: "1642.86",
  todayChange: "85.71",
  todayChangePct: "5.50",
  unrealizedGain: "428.57",
  accountCount: 3,
  quoteFetchedAt: null,
  quoteDate: null,
  warnings: []
});

const intradayQuote = dashboardQuote(
  "usd-dashboard-quote",
  usdSecurity.instrumentId,
  "2026-05-23",
  "75",
  "USD",
  "2026-05-23T10:00:00.000Z"
);
const currentQuoteDashboard = calculateDashboardSummary(holdings, accounts, prices, fxRates, "NZD", [intradayQuote]);
assert.equal(currentQuoteDashboard.totalAssets, "360.00");
assert.equal(currentQuoteDashboard.todayChange, "18.00");
assert.equal(currentQuoteDashboard.todayChangePct, "5.26");
assert.equal(currentQuoteDashboard.unrealizedGain, "105.00");
assert.equal(currentQuoteDashboard.quoteFetchedAt, "2026-05-23T10:00:00.000Z");
assert.equal(currentQuoteDashboard.quoteDate, "2026-05-23");

const quoteWithoutPriorClose = dashboardQuote(
  "usd-early-dashboard-quote",
  usdSecurity.instrumentId,
  "2026-05-20",
  "75",
  "USD",
  "2026-05-20T10:00:00.000Z"
);
const latestCloseBaselineDashboard = calculateDashboardSummary(
  [usdSecurity],
  accounts,
  [price("usd-latest-only", usdSecurity.instrumentId, "2026-05-22", "70", "USD")],
  fxRates,
  "NZD",
  [quoteWithoutPriorClose]
);
assert.equal(latestCloseBaselineDashboard.totalAssets, "225.00");
assert.equal(latestCloseBaselineDashboard.todayChange, "15.00");
assert.deepEqual(latestCloseBaselineDashboard.warnings, []);

const quoteWithoutAnyStoredClose = calculateDashboardSummary([usdSecurity], accounts, [], fxRates, "NZD", [
  quoteWithoutPriorClose
]);
assert.equal(quoteWithoutAnyStoredClose.totalAssets, "225.00");
assert.equal(quoteWithoutAnyStoredClose.todayChange, null);
assert.deepEqual(quoteWithoutAnyStoredClose.warnings.map((warning) => warning.code), ["MISSING_PREVIOUS_PRICE"]);

const missingLatest = calculateDashboardSummary(
  holdings,
  accounts,
  prices.filter((record) => record.instrumentId !== nzdSecurity.instrumentId),
  fxRates
);
assert.equal(missingLatest.totalAssets, null);
assert.equal(missingLatest.todayChange, null);
assert.equal(missingLatest.todayChangePct, null);
assert.equal(missingLatest.unrealizedGain, null);
assert.deepEqual(missingLatest.warnings.map((warning) => warning.code), ["MISSING_LATEST_PRICE"]);

const missingPrevious = calculateDashboardSummary(
  holdings,
  accounts,
  prices.filter((record) => record.id !== "nzd-previous"),
  fxRates
);
assert.equal(missingPrevious.totalAssets, "345.00");
assert.equal(missingPrevious.todayChange, null);
assert.equal(missingPrevious.todayChangePct, null);
assert.equal(missingPrevious.unrealizedGain, "90.00");
assert.deepEqual(missingPrevious.warnings.map((warning) => warning.code), ["MISSING_PREVIOUS_PRICE"]);

const missingFx = calculateDashboardSummary(holdings, accounts, prices, []);
assert.equal(missingFx.totalAssets, null);
assert.equal(missingFx.todayChange, null);
assert.equal(missingFx.todayChangePct, null);
assert.equal(missingFx.unrealizedGain, null);
assert.deepEqual(missingFx.warnings.map((warning) => warning.code), ["MISSING_FX_RATE"]);

const missingCost = calculateDashboardSummary(
  [usdSecurity, { ...nzdSecurity, costAmount: null }, usdCash],
  accounts,
  prices,
  fxRates
);
assert.equal(missingCost.totalAssets, "345.00");
assert.equal(missingCost.todayChange, "18.00");
assert.equal(missingCost.todayChangePct, "5.50");
assert.equal(missingCost.unrealizedGain, null);
assert.deepEqual(missingCost.warnings.map((warning) => warning.code), ["COST_BASIS_UNAVAILABLE"]);

const zeroPrior = calculateDashboardSummary(
  [holding("new-position", "New Position", "stock", "NZD", "1", "0")],
  [],
  [
    price("new-latest", "new-position", "2026-05-22", "10", "NZD"),
    price("new-previous", "new-position", "2026-05-21", "0", "NZD")
  ],
  fxRates
);
assert.equal(zeroPrior.totalAssets, "10.00");
assert.equal(zeroPrior.todayChange, "10.00");
assert.equal(zeroPrior.todayChangePct, null);

const rounded = calculateDashboardSummary(
  [holding("rounded-position", "Rounded Position", "stock", "NZD", "1", "0")],
  [],
  [
    price("rounded-latest", "rounded-position", "2026-05-22", "1.005", "NZD"),
    price("rounded-previous", "rounded-position", "2026-05-21", "0", "NZD")
  ],
  fxRates
);
assert.equal(rounded.totalAssets, "1.01");

const quoteInstrument = instrument(usdSecurity.instrumentId, "yahoo_finance", "US_TEST", "USD");
let fetchCount = 0;
const provider: IInstrumentQuoteProvider = {
  name: "Yahoo Finance",
  async fetchLatestQuotes(input: FetchLatestInstrumentQuotesInput): Promise<InstrumentQuoteProviderResult> {
    fetchCount += 1;
    return {
      provider: this.name,
      fetchedAt: input.fetchedAt,
      quotes: input.instruments.map((providerInstrument) => ({
        instrumentId: providerInstrument.instrumentId,
        sourceSymbol: providerInstrument.sourceSymbol,
        quoteDate: "2026-05-23",
        quotePrice: "80",
        currency: providerInstrument.currency
      }))
    };
  }
};
const storedQuotes = new Map<string, DashboardQuoteRecord>([
  [
    usdSecurity.instrumentId,
    dashboardQuote(
      "fresh-dashboard-quote",
      usdSecurity.instrumentId,
      "2026-05-23",
      "79",
      "USD",
      "2026-05-23T10:56:00.000Z",
      "Yahoo Finance"
    )
  ]
]);
const quoteRepository = {
  async listDashboardQuotes(): Promise<DashboardQuoteRecord[]> {
    return [...storedQuotes.values()];
  },
  async upsertDashboardQuote(input: {
    instrumentId: string;
    quoteDate: string;
    quotePrice: string;
    currency: DashboardQuoteRecord["currency"];
    provider: string;
    sourceSymbol?: string | null;
    fetchedAt: string;
  }): Promise<DashboardQuoteRecord> {
    const record = dashboardQuote(
      `quote-${input.instrumentId}`,
      input.instrumentId,
      input.quoteDate,
      input.quotePrice,
      input.currency,
      input.fetchedAt,
      input.provider
    );
    storedQuotes.set(input.instrumentId, record);
    return record;
  }
};

void verifyDashboardQuoteCache()
  .then(() => {
    console.log("Dashboard calculation verification: success");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function verifyDashboardQuoteCache(): Promise<void> {
  const freshQuotes = await refreshDashboardQuotes({
    holdings: [usdSecurity],
    instruments: [quoteInstrument],
    now: new Date("2026-05-23T11:00:00.000Z"),
    providers: { yahoo_finance: provider },
    dashboardQuoteRepository: quoteRepository
  });
  assert.equal(fetchCount, 0);
  assert.equal(freshQuotes[0]?.quotePrice, "79");

  const staleQuotes = await refreshDashboardQuotes({
    holdings: [usdSecurity],
    instruments: [quoteInstrument],
    now: new Date("2026-05-23T11:02:00.000Z"),
    providers: { yahoo_finance: provider },
    dashboardQuoteRepository: quoteRepository
  });
  assert.equal(fetchCount, 1);
  assert.equal(staleQuotes[0]?.quotePrice, "80");
}

function account(id: string): InvestmentAccount {
  return {
    id,
    name: id,
    broker: null,
    accountType: "brokerage",
    baseCurrency: "NZD",
    marketRegion: "NZ",
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function holding(
  instrumentId: string,
  instrumentName: string,
  assetType: HoldingSummary["assetType"],
  currency: HoldingSummary["currency"],
  quantity: string,
  costAmount: string | null
): HoldingSummary {
  return {
    accountId: "account-a",
    accountName: "Account",
    instrumentId,
    instrumentSymbol: null,
    instrumentName,
    assetType,
    currency,
    quantity,
    averageUnitCost: costAmount,
    costAmount,
    warnings: costAmount === null && assetType !== "cash" ? ["COST_BASIS_UNAVAILABLE"] : []
  };
}

function price(
  id: string,
  instrumentId: string,
  priceDate: string,
  closePrice: string,
  currency: PriceRecord["currency"]
): PriceRecord {
  return {
    id,
    instrumentId,
    priceDate,
    closePrice,
    currency,
    source: "manual",
    sourceSymbol: null,
    isAdjusted: false,
    createdAt: `${priceDate}T00:00:00.000Z`,
    updatedAt: `${priceDate}T00:00:00.000Z`
  };
}

function instrument(
  id: string,
  priceSource: Instrument["priceSource"],
  priceSourceSymbol: string,
  currency: Instrument["currency"]
): Instrument {
  return {
    id,
    symbol: priceSourceSymbol,
    name: priceSourceSymbol,
    description: null,
    marketRegion: "US",
    exchange: "NASDAQ",
    currency,
    assetType: "etf",
    isin: null,
    provider: null,
    priceSource,
    priceSourceSymbol,
    priceSourceExchange: null,
    priceUpdateEnabled: true,
    priceUpdatePriority: 100,
    sourceUrl: null,
    sourceCheckedAt: null,
    createdByUserId: null,
    updatedByUserId: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function dashboardQuote(
  id: string,
  instrumentId: string,
  quoteDate: string,
  quotePrice: string,
  currency: DashboardQuoteRecord["currency"],
  fetchedAt: string,
  provider = "manual"
): DashboardQuoteRecord {
  return {
    id,
    instrumentId,
    quoteDate,
    quotePrice,
    currency,
    provider,
    sourceSymbol: null,
    fetchedAt,
    createdAt: fetchedAt,
    updatedAt: fetchedAt
  };
}

function fxRate(id: string, fromCurrency: ExchangeRateRecord["fromCurrency"], rate: string): ExchangeRateRecord {
  return {
    id,
    fromCurrency,
    toCurrency: "USD",
    rateDate: "2026-05-22",
    rate,
    rateType: "valuation",
    provider: "manual",
    providerRateDate: "2026-05-22",
    fetchedAt: "2026-05-22T00:00:00.000Z",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z"
  };
}
