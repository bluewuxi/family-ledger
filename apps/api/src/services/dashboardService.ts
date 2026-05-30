import type {
  AuthenticatedUser,
  CurrencyCode,
  DashboardQuoteRecord,
  HoldingSummary,
  DashboardSummary,
  Instrument,
  InvestmentTransaction,
  PriceSource
} from "@family-ledger/shared";
import { getAppBusinessDate } from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import {
  listDashboardQuotes,
  upsertDashboardQuote,
  type UpsertDashboardQuoteInput
} from "../repositories/dashboardQuoteRepository";
import { listLatestValuationRatesToUsd } from "../repositories/fxRateRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listLatestPrices } from "../repositories/priceRepository";
import { listTransactions } from "../repositories/transactionRepository";
import { EastMoneyInstrumentQuoteProvider } from "../providers/EastMoneyInstrumentQuoteProvider";
import type {
  IInstrumentQuoteProvider,
  InstrumentQuoteProviderInstrument
} from "../providers/IInstrumentQuoteProvider";
import { YahooFinanceInstrumentQuoteProvider } from "../providers/YahooFinanceInstrumentQuoteProvider";
import { calculateHoldings } from "./holdingService";
import { calculateDashboardSummary } from "./portfolioValuationService";
import { resolveReportingCurrency } from "./reportingCurrencyService";

export { calculateDashboardSummary } from "./portfolioValuationService";

const DASHBOARD_QUOTE_CACHE_TTL_MS = 5 * 60 * 1000;

interface DashboardQuoteRepository {
  listDashboardQuotes(instrumentIds: string[]): Promise<DashboardQuoteRecord[]>;
  upsertDashboardQuote(input: UpsertDashboardQuoteInput): Promise<DashboardQuoteRecord>;
}

export async function getDashboard(input: { currency?: string; user?: AuthenticatedUser } = {}): Promise<DashboardSummary> {
  const now = new Date();
  const reportingCurrency = await resolveReportingCurrency(input);
  const [transactions, accounts, instruments] = await Promise.all([
    listTransactions(),
    listAccounts(),
    listInstruments()
  ]);
  const holdings = calculateHoldings(transactions, accounts, instruments);
  const securityInstruments = uniqueBy(
    holdings
      .filter((holding) => holding.assetType !== "cash")
      .map((holding) => ({ instrumentId: holding.instrumentId, currency: holding.currency })),
    (instrument) => instrument.instrumentId
  );
  const foreignCurrencies = unique(
    holdings.filter((holding) => holding.currency !== "NZD").map((holding) => holding.currency)
  );
  const requiredFxCurrencies = unique([
    ...foreignCurrencies,
    ...holdings.filter((holding) => holding.currency === "NZD").map((holding) => holding.currency),
    ...(reportingCurrency === "USD" ? [] : [reportingCurrency])
  ]);
  const [prices, fxRates] = await Promise.all([
    listLatestPrices(securityInstruments),
    listLatestValuationRatesToUsd(requiredFxCurrencies)
  ]);
  const dashboardQuotes = await refreshDashboardQuotes({
    holdings,
    instruments,
    now
  });
  const dailyTradeCount = countDailyTrades(transactions, instruments, getAppBusinessDate(now));

  return calculateDashboardSummary(holdings, accounts, prices, fxRates, reportingCurrency, dashboardQuotes, dailyTradeCount);
}

export function countDailyTrades(transactions: InvestmentTransaction[], instruments: Instrument[], businessDate: string): number {
  const instrumentsById = new Map(instruments.map((instrument) => [instrument.id, instrument]));

  return transactions.filter((transaction) => {
    const instrumentAssetType = transaction.instrumentAssetType ?? instrumentsById.get(transaction.instrumentId)?.assetType ?? null;

    return (
      transaction.tradeDate === businessDate &&
      (transaction.transactionType === "buy" || transaction.transactionType === "sell") &&
      transaction.transactionSource !== "generated_cash_leg" &&
      instrumentAssetType !== "cash"
    );
  }).length;
}


export async function refreshDashboardQuotes(input: {
  holdings: HoldingSummary[];
  instruments: Instrument[];
  now: Date;
  providers?: Partial<Record<PriceSource, IInstrumentQuoteProvider>>;
  dashboardQuoteRepository?: DashboardQuoteRepository;
}): Promise<DashboardQuoteRecord[]> {
  const quoteInstruments = getDashboardQuoteInstruments(input.holdings, input.instruments);

  if (quoteInstruments.length === 0) {
    return [];
  }

  const dashboardQuoteRepository = input.dashboardQuoteRepository ?? {
    listDashboardQuotes,
    upsertDashboardQuote
  };
  const existingQuotes = await dashboardQuoteRepository.listDashboardQuotes(quoteInstruments.map((instrument) => instrument.id));
  const existingQuotesByInstrument = new Map(existingQuotes.map((quote) => [dashboardQuoteKey(quote.instrumentId, quote.provider), quote]));
  const staleInstruments = quoteInstruments.filter((instrument) =>
    isQuoteStale(existingQuotesByInstrument.get(dashboardQuoteKey(instrument.id, providerNameForPriceSource(instrument.priceSource))), input.now)
  );
  const refreshedQuotes = await fetchAndStoreDashboardQuotes({
    instruments: staleInstruments,
    fetchedAt: input.now.toISOString(),
    providers: input.providers ?? defaultDashboardQuoteProviders(),
    dashboardQuoteRepository
  });
  const refreshedByInstrument = new Map(refreshedQuotes.map((quote) => [dashboardQuoteKey(quote.instrumentId, quote.provider), quote]));

  return quoteInstruments
    .map((instrument) => {
      const key = dashboardQuoteKey(instrument.id, providerNameForPriceSource(instrument.priceSource));
      return refreshedByInstrument.get(key) ?? existingQuotesByInstrument.get(key) ?? null;
    })
    .filter((quote): quote is DashboardQuoteRecord => quote !== null);
}

function getDashboardQuoteInstruments(holdings: HoldingSummary[], instruments: Instrument[]): Instrument[] {
  const heldSecurityIds = new Set(
    holdings.filter((holding) => holding.assetType !== "cash").map((holding) => holding.instrumentId)
  );

  return instruments.filter(
    (instrument) =>
      heldSecurityIds.has(instrument.id) &&
      instrument.assetType !== "cash" &&
      instrument.priceUpdateEnabled &&
      instrument.priceSourceSymbol !== null &&
      isSupportedQuoteSource(instrument.priceSource)
  );
}

async function fetchAndStoreDashboardQuotes(input: {
  instruments: Instrument[];
  fetchedAt: string;
  providers: Partial<Record<PriceSource, IInstrumentQuoteProvider>>;
  dashboardQuoteRepository: DashboardQuoteRepository;
}): Promise<DashboardQuoteRecord[]> {
  const storedQuotes: DashboardQuoteRecord[] = [];
  const instrumentsBySource = groupInstrumentsByPriceSource(input.instruments);

  for (const [priceSource, instruments] of instrumentsBySource) {
    const provider = input.providers[priceSource];

    if (!provider) {
      continue;
    }

    try {
      const providerResult = await provider.fetchLatestQuotes({
        instruments: instruments.map(toProviderInstrument),
        fetchedAt: input.fetchedAt
      });
      const inputs = toDashboardQuoteInputs(instruments, providerResult.provider, providerResult.fetchedAt, providerResult.quotes);

      for (const quoteInput of inputs) {
        storedQuotes.push(await input.dashboardQuoteRepository.upsertDashboardQuote(quoteInput));
      }
    } catch (error) {
      console.error("Failed to refresh dashboard quotes.", {
        priceSource,
        error
      });
    }
  }

  return storedQuotes;
}

function defaultDashboardQuoteProviders(): Partial<Record<PriceSource, IInstrumentQuoteProvider>> {
  return {
    yahoo_finance: new YahooFinanceInstrumentQuoteProvider(),
    eastmoney: new EastMoneyInstrumentQuoteProvider()
  };
}

function toProviderInstrument(instrument: Instrument): InstrumentQuoteProviderInstrument {
  if (!instrument.priceSourceSymbol) {
    throw new Error(`Instrument ${instrument.id} is missing price source symbol.`);
  }

  return {
    instrumentId: instrument.id,
    sourceSymbol: instrument.priceSourceSymbol,
    currency: instrument.currency,
    sourceExchange: instrument.priceSourceExchange
  };
}

function toDashboardQuoteInputs(
  instruments: Instrument[],
  provider: string,
  fetchedAt: string,
  quotes: Array<{
    instrumentId: string;
    sourceSymbol: string;
    quoteDate: string;
    quotePrice: string;
    currency: CurrencyCode;
  }>
): UpsertDashboardQuoteInput[] {
  const instrumentsById = new Map(instruments.map((instrument) => [instrument.id, instrument]));

  return quotes.map((quote) => {
    const instrument = instrumentsById.get(quote.instrumentId);

    if (!instrument) {
      throw new Error(`${provider} returned an unknown dashboard quote instrument ${quote.instrumentId}.`);
    }

    if (quote.currency !== instrument.currency) {
      throw new Error(`${provider} returned ${quote.currency} currency for ${quote.sourceSymbol}; expected ${instrument.currency}.`);
    }

    return {
      instrumentId: quote.instrumentId,
      quoteDate: quote.quoteDate,
      quotePrice: quote.quotePrice,
      currency: quote.currency,
      provider,
      sourceSymbol: quote.sourceSymbol,
      fetchedAt
    };
  });
}

function groupInstrumentsByPriceSource(instruments: Instrument[]): Map<PriceSource, Instrument[]> {
  const grouped = new Map<PriceSource, Instrument[]>();

  for (const instrument of instruments) {
    const current = grouped.get(instrument.priceSource) ?? [];
    current.push(instrument);
    grouped.set(instrument.priceSource, current);
  }

  return grouped;
}

function isSupportedQuoteSource(priceSource: PriceSource): boolean {
  return priceSource === "yahoo_finance" || priceSource === "eastmoney";
}

function providerNameForPriceSource(priceSource: PriceSource): string {
  if (priceSource === "yahoo_finance") {
    return "Yahoo Finance";
  }

  if (priceSource === "eastmoney") {
    return "Eastmoney";
  }

  return priceSource;
}

function dashboardQuoteKey(instrumentId: string, provider: string): string {
  return `${instrumentId}:${provider}`;
}

function isQuoteStale(quote: DashboardQuoteRecord | undefined, now: Date): boolean {
  if (!quote) {
    return true;
  }

  const fetchedAt = new Date(quote.fetchedAt);
  if (Number.isNaN(fetchedAt.getTime())) {
    return true;
  }

  return now.getTime() - fetchedAt.getTime() >= DASHBOARD_QUOTE_CACHE_TTL_MS;
}
function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueBy<T>(values: T[], keyOf: (value: T) => string): T[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = keyOf(value);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
