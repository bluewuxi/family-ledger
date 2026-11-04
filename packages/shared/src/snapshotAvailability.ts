import { selectLatestPriceRecordsByDistinctDates, type HoldingSummary, type Instrument, type PriceRecord, type PortfolioSnapshotValuation, type ExchangeRateRecord } from "./index";

export interface SnapshotInputAvailability {
  instrumentId: string;
  requiresDailyPrice: boolean;
  priceDate: string | null;
}

export class SnapshotPendingError extends Error {
  readonly code = "SNAPSHOT_PENDING";
  constructor(readonly snapshotDate: string) { super("Snapshot remains pending required historical inputs."); }
}

/** Apply the same publication gate to jobs, transaction plans, and manual repairs. */
export function withSnapshotEligibility(valuation: PortfolioSnapshotValuation, input: {
  holdings: readonly HoldingSummary[]; instruments: readonly Instrument[]; prices: readonly PriceRecord[]; fxRates: readonly ExchangeRateRecord[];
}): PortfolioSnapshotValuation {
  const currencies = new Set(["NZD", "CNY", ...input.holdings.map(row => row.currency)]);
  currencies.delete("USD");
  const eligibility = evaluateSnapshotEligibility({
    snapshotDate: valuation.snapshotDate,
    inputs: input.holdings.filter(row => row.assetType !== "cash" && !/^[-+]?0(?:\.0+)?$/.test(row.quantity)).map(row => {
      const instrument = input.instruments.find(item => item.id === row.instrumentId);
      const price = selectLatestPriceRecordsByDistinctDates(input.prices.filter(item => item.instrumentId === row.instrumentId && item.currency === row.currency && item.priceDate <= valuation.snapshotDate && !item.isAdjusted), 1)[0];
      return { instrumentId: row.instrumentId, priceDate: price?.priceDate ?? null, requiresDailyPrice: Boolean(instrument?.priceUpdateEnabled && instrument.priceSource !== "manual" && instrument.priceSource !== "investnow_manual") };
    }),
    fxInputs: [...currencies].map(currency => ({ currency, rateDate: input.fxRates.filter(rate => rate.fromCurrency === currency && rate.toCurrency === "USD" && rate.rateType === "valuation" && rate.rateDate <= valuation.snapshotDate).map(rate => rate.rateDate).sort().at(-1) ?? null }))
  });
  if (eligibility.status === "ready" && valuation.marketValueUsd !== null) return { ...valuation, publicationStatus: "ready" };
  return { ...valuation, publicationStatus: "pending", missingInstrumentIds: eligibility.status === "pending" ? eligibility.missingInstrumentIds : [], missingFxCurrencies: eligibility.status === "pending" ? eligibility.missingFxCurrencies : [] };
}

export type SnapshotEligibility =
  | { status: "ready" }
  | { status: "pending"; missingInstrumentIds: string[]; missingFxCurrencies: string[] };

function assertDate(date: string): void {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Expected a real YYYY-MM-DD calendar date.");
  }
}

/** The snapshot business date is already resolved by the caller, not viewer-local. */
export function evaluateSnapshotEligibility(input: { snapshotDate: string; inputs: readonly SnapshotInputAvailability[]; fxInputs?: readonly { currency: string; rateDate: string | null }[] }): SnapshotEligibility {
  assertDate(input.snapshotDate);
  const weekday = new Date(`${input.snapshotDate}T00:00:00Z`).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  const missing = input.inputs.filter(item => {
    if (item.priceDate === null) return true;
    assertDate(item.priceDate);
    return item.priceDate > input.snapshotDate || (!weekend && item.requiresDailyPrice && item.priceDate !== input.snapshotDate);
  });
  const missingFxCurrencies = (input.fxInputs ?? []).filter(item => {
    if (item.rateDate === null) return true;
    assertDate(item.rateDate);
    return item.rateDate > input.snapshotDate;
  }).map(item => item.currency);
  return missing.length || missingFxCurrencies.length ? { status: "pending", missingInstrumentIds: [...new Set(missing.map(item => item.instrumentId))], missingFxCurrencies: [...new Set(missingFxCurrencies)] } : { status: "ready" };
}

export interface SnapshotResolution<T> {
  requestedDate: string;
  actualSnapshotDate: string | null;
  isFallback: boolean;
  reason: "EXACT" | "PREVIOUS_SNAPSHOT" | "NO_SNAPSHOT";
  value: T | null;
}

/** Callers supply history already restricted to the authorized account/purpose scope. */
export function resolveSnapshotAtOrBefore<T extends { snapshotDate: string }>(
  history: readonly T[], requestedDate: string, valid: (snapshot: T) => boolean = () => true
): SnapshotResolution<T> {
  assertDate(requestedDate);
  let value: T | null = null;
  for (const snapshot of history) {
    assertDate(snapshot.snapshotDate);
    if (snapshot.snapshotDate <= requestedDate && valid(snapshot) && (!value || snapshot.snapshotDate > value.snapshotDate)) value = snapshot;
  }
  const isFallback = value !== null && value.snapshotDate !== requestedDate;
  return { requestedDate, actualSnapshotDate: value?.snapshotDate ?? null, isFallback, reason: !value ? "NO_SNAPSHOT" : isFallback ? "PREVIOUS_SNAPSHOT" : "EXACT", value };
}
