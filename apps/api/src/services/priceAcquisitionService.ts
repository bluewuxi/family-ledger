import { getTimeZoneDateString } from "@family-ledger/shared";
import type { DashboardQuoteRecord, HoldingSummary, Instrument, PriceSource, CurrencyCode } from "@family-ledger/shared";
import { listDashboardQuotes, upsertDashboardQuote, upsertDashboardQuotes, saveClaimedDashboardQuote, type UpsertDashboardQuoteInput } from "../repositories/dashboardQuoteRepository";
import { EastMoneyInstrumentQuoteProvider } from "../providers/EastMoneyInstrumentQuoteProvider";
import { YahooFinanceInstrumentQuoteProvider } from "../providers/YahooFinanceInstrumentQuoteProvider";
import type { IInstrumentQuoteProvider, InstrumentQuoteProviderInstrument } from "../providers/IInstrumentQuoteProvider";
import { parseQuoteMode } from "./quoteMode";
import { logError } from "../utils/errorLogging";
import { listPriceAcquisitionDueTimes, ensurePriceAcquisition, claimPriceAcquisition, claimDashboardQuoteBatch, completePriceAcquisition, type PriceAcquisitionLease } from "../repositories/priceAcquisitionRepository";
interface AcquisitionRepository {
  ensurePriceAcquisition: typeof ensurePriceAcquisition;
  claimPriceAcquisition: typeof claimPriceAcquisition;
  completePriceAcquisition: typeof completePriceAcquisition;
  claimDashboardQuoteBatch?: typeof claimDashboardQuoteBatch;
}
const DASHBOARD_QUOTE_CACHE_TTL_MS = 300_000;
interface DashboardQuoteRepository {
 listDashboardQuotes(instrumentIds: string[]): Promise<DashboardQuoteRecord[]>;
 upsertDashboardQuote(input: UpsertDashboardQuoteInput): Promise<DashboardQuoteRecord>;
 upsertDashboardQuotes?(inputs: UpsertDashboardQuoteInput[]): Promise<DashboardQuoteRecord[]>;
 saveClaimedDashboardQuote?(input: UpsertDashboardQuoteInput, leaseToken: string): Promise<DashboardQuoteRecord | null>;
}
export async function getQuotes(input: {
  holdings: HoldingSummary[];
  instruments: Instrument[];
  now: Date;
  quoteMode?: string;
  quoteRefreshWarnings?: string[];
  providers?: Partial<Record<PriceSource, IInstrumentQuoteProvider>>;
  dashboardQuoteRepository?: DashboardQuoteRepository;
  acquisitionRepository?: AcquisitionRepository;
  requestBudgetMs?: number;
}): Promise<DashboardQuoteRecord[]> {
  const quoteInstruments = getDashboardQuoteInstruments(input.holdings, input.instruments);

  if (quoteInstruments.length === 0) {
    return [];
  }

  const dashboardQuoteRepository = input.dashboardQuoteRepository ?? {
    listDashboardQuotes,
    upsertDashboardQuote, upsertDashboardQuotes, saveClaimedDashboardQuote
  };
  const existingQuotes = (await dashboardQuoteRepository.listDashboardQuotes(quoteInstruments.map((instrument) => instrument.id))).filter(quote => quoteInstruments.some(instrument => instrument.id === quote.instrumentId && quote.provider === providerNameForPriceSource(instrument.priceSource) && quote.currency === instrument.currency && (!quote.sourceSymbol || quote.sourceSymbol === instrument.priceSourceSymbol)));
  const existingQuotesByInstrument = new Map(existingQuotes.map((quote) => [dashboardQuoteKey(quote.instrumentId, quote.provider), quote]));
  if (parseQuoteMode(input.quoteMode) === "cached") return existingQuotes.filter(quote => !isQuoteStale(quote, input.now));
  const staleInstruments = quoteInstruments.filter((instrument) =>
    instrument.active !== false && !isMarketWeekend(instrument, input.now) && isQuoteDue(existingQuotesByInstrument.get(dashboardQuoteKey(instrument.id, providerNameForPriceSource(instrument.priceSource))), input.now, input.quoteMode === "refresh")
  );
  const refreshedQuotes = await fetchAndStoreDashboardQuotes({
    instruments: staleInstruments,
    quoteRefreshWarnings: input.quoteRefreshWarnings,
    fetchedAt: input.now.toISOString(),
    providers: input.providers ?? defaultDashboardQuoteProviders(),
    dashboardQuoteRepository,
    acquisitionRepository: input.acquisitionRepository ?? (input.dashboardQuoteRepository ? undefined : { ensurePriceAcquisition, claimPriceAcquisition, claimDashboardQuoteBatch, completePriceAcquisition }),
    forced: input.quoteMode === "refresh",
    signal: AbortSignal.timeout(Math.max(1, Math.min(input.requestBudgetMs ?? 6000, 6000)))
  });
  const refreshedByInstrument = new Map(refreshedQuotes.map((quote) => [dashboardQuoteKey(quote.instrumentId, quote.provider), quote]));

  return quoteInstruments
    .map((instrument) => {
      const key = dashboardQuoteKey(instrument.id, providerNameForPriceSource(instrument.priceSource));
      const refreshedQuote = refreshedByInstrument.get(key);
      const existingQuote = existingQuotesByInstrument.get(key);

      if (refreshedQuote) {
        return refreshedQuote;
      }

      return existingQuote && !isQuoteStale(existingQuote, input.now) ? existingQuote : null;
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
  quoteRefreshWarnings?: string[];
  instruments: Instrument[];
  fetchedAt: string;
  providers: Partial<Record<PriceSource, IInstrumentQuoteProvider>>;
  dashboardQuoteRepository: DashboardQuoteRepository;
  acquisitionRepository?: AcquisitionRepository;
  forced: boolean;
  signal: AbortSignal;
}): Promise<DashboardQuoteRecord[]> {
  const storedQuotes: DashboardQuoteRecord[] = [];
  const instrumentsBySource = groupInstrumentsByPriceSource(input.instruments);

  await Promise.all([...instrumentsBySource].map(async ([priceSource, instruments]) => {
    const provider = input.providers[priceSource];

    if (!provider) {
      return;
    }

    const leases = new Map<string, PriceAcquisitionLease>();
    const acquisition = input.acquisitionRepository;
    try {
      if (acquisition?.claimDashboardQuoteBatch) {
        const claimed = await acquisition.claimDashboardQuoteBatch({ source: priceSource, instrumentIds: instruments.map(instrument => instrument.id), force: input.forced });
        for (const lease of claimed) leases.set(lease.instrumentId, lease);
      } else if (acquisition) {
        for (const instrument of instruments) {
          if (input.signal.aborted) break;
          const identity = { source: priceSource, instrumentId: instrument.id, queryKind: "latest_quote" as const };
          await acquisition.ensurePriceAcquisition(identity);
          const lease = await acquisition.claimPriceAcquisition({ ...identity, force: input.forced, leaseSeconds: 30 });
          if (lease) leases.set(instrument.id, lease);
        }
      }
      const requested = acquisition ? instruments.filter(instrument => leases.has(instrument.id)) : instruments;
      if (!requested.length) return;
      const providerResult = await provider.fetchLatestQuotes({
        instruments: requested.map(toProviderInstrument),
        fetchedAt: input.fetchedAt,
        signal: input.signal
      });
      if (providerResult.quotes.length < requested.length) input.quoteRefreshWarnings?.push(`${priceSource} 部分行情未能更新`);
      const inputs = toDashboardQuoteInputs(requested, providerResult.provider, providerResult.fetchedAt, providerResult.quotes);

      const guarded = acquisition && input.dashboardQuoteRepository.saveClaimedDashboardQuote;
      const saved = guarded
        ? (await Promise.all(inputs.map(quote => guarded(quote, leases.get(quote.instrumentId)!.leaseToken)))).filter((quote): quote is DashboardQuoteRecord => quote !== null)
        : input.dashboardQuoteRepository.upsertDashboardQuotes
        ? await input.dashboardQuoteRepository.upsertDashboardQuotes(inputs)
        : await Promise.all(inputs.map(quote => input.dashboardQuoteRepository.upsertDashboardQuote(quote)));
      storedQuotes.push(...saved);
      if (acquisition) {
        const successful = new Set(saved.map(quote => quote.instrumentId));
        const retryAfterSeconds = Math.max(0, ...(providerResult.items ?? []).map(item => item.status === "failed" ? item.retryAfterSeconds ?? 0 : 0));
        for (const lease of leases.values()) {
          if (guarded && successful.has(lease.instrumentId)) continue;
          await acquisition.completePriceAcquisition({ leaseToken: lease.leaseToken, status: successful.has(lease.instrumentId) ? "success" : "failed", reason: successful.has(lease.instrumentId) ? undefined : retryAfterSeconds > 0 ? "SOURCE_COOLDOWN" : "QUOTE_UNAVAILABLE", retryAfterSeconds });
        }
      }
    } catch (error) {
      logError("dashboardService.fetchAndStoreDashboardQuotes", error, "ERROR", { provider: priceSource });
      input.quoteRefreshWarnings?.push(`${priceSource} 行情更新失败`);
      if (acquisition) await Promise.allSettled([...leases.values()].map(lease => acquisition.completePriceAcquisition({ leaseToken: lease.leaseToken, status: "failed", reason: (error as {retryAfterSeconds?: number} | null)?.retryAfterSeconds ? "SOURCE_COOLDOWN" : "ACQUISITION_FAILED", retryAfterSeconds: (error as {retryAfterSeconds?: number} | null)?.retryAfterSeconds })));

    }
  }));

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
    quoteAt?: string;
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

    if (quote.sourceSymbol !== instrument.priceSourceSymbol) throw new Error("Quote source identity mismatch.");
    if (quote.currency !== instrument.currency) {
      throw new Error(`${provider} returned ${quote.currency} currency for ${quote.sourceSymbol}; expected ${instrument.currency}.`);
    }

    return {
      instrumentId: quote.instrumentId,
      quoteDate: quote.quoteDate,
      quoteAt: quote.quoteAt,
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
function isQuoteDue(quote: DashboardQuoteRecord | undefined, now: Date, forced: boolean): boolean {
  return !quote || now.getTime() - Date.parse(quote.fetchedAt) >= (forced ? 60_000 : DASHBOARD_QUOTE_CACHE_TTL_MS) || !Number.isFinite(Date.parse(quote.fetchedAt));
}

/** Only instruments with an existing live endpoint request automatic refresh. */
export async function getNextQuoteRefreshAt(holdings: HoldingSummary[], instruments: Instrument[], quotes: DashboardQuoteRecord[], now: Date): Promise<string | null> {
 const targets = getDashboardQuoteInstruments(holdings, instruments).filter(instrument => instrument.active !== false);
 if (!targets.length) return null;
 const states = new Map<string, {nextAttemptAt: string | null; status: string}>();
 for (const [source, members] of groupInstrumentsByPriceSource(targets)) {
  const rows = await listPriceAcquisitionDueTimes({source, instrumentIds: members.map(instrument => instrument.id), queryKind: "latest_quote"});
  for (const row of rows) states.set(row.instrumentId, row);
 }
 const times = targets.flatMap(instrument => {
  if (isMarketWeekend(instrument, now)) {
    const next = new Date(now); do {next.setTime(next.getTime() + 86_400_000);} while (isMarketWeekend(instrument, next));
    return [next.getTime()];
  }
  const state = states.get(instrument.id);
  if (state?.nextAttemptAt) return [Date.parse(state.nextAttemptAt)];
  if (state && ["unsupported", "needs_attention"].includes(state.status)) return [];
  const quote = quotes.find(row => row.instrumentId === instrument.id && row.provider === providerNameForPriceSource(instrument.priceSource));
  return [quote ? Date.parse(quote.fetchedAt) + DASHBOARD_QUOTE_CACHE_TTL_MS : now.getTime()];
 });
 return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

function isMarketWeekend(instrument: Instrument, now: Date): boolean {
 const zone = instrument.priceSource === "eastmoney" ? "Asia/Shanghai" : instrument.currency === "HKD" ? "Asia/Hong_Kong" : "America/New_York";
 const date = getTimeZoneDateString(now.toISOString(), zone);
 const day = new Date(date + "T00:00:00Z").getUTCDay();
 return day === 0 || day === 6;
}
