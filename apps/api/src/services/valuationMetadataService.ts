import { selectPreferredExchangeRateRecord, type ExchangeRateRecord, type SnapshotDisplayCurrency, type ValuedHoldingSummary, type ValuationMetadata } from "@family-ledger/shared";

export function buildValuationMetadata(holdings: ValuedHoldingSummary[], rates: ExchangeRateRecord[], now: Date, currency: SnapshotDisplayCurrency): ValuationMetadata {
  const currencies = new Set<string>([currency, ...holdings.map(holding => holding.currency)]);
  const dates: string[] = [];
  for (const sourceCurrency of currencies) {
    if (sourceCurrency === "USD") continue;
    const candidates = rates.filter(rate => rate.fromCurrency === sourceCurrency && rate.toCurrency === "USD" && rate.rateType === "valuation");
    const latestDate = candidates.map(rate => rate.rateDate).sort().at(-1);
    if (latestDate) dates.push(selectPreferredExchangeRateRecord(candidates.filter(rate => rate.rateDate === latestDate)).rateDate);
  }
  dates.sort();
  const securities = holdings.filter(holding => holding.assetType !== "cash");
  const priceDates = securities.flatMap(holding => holding.latestPriceDate ? [holding.latestPriceDate] : []).sort();
  const quoteTimes = securities.flatMap(holding => holding.quoteFetchedAt ? [holding.quoteFetchedAt] : []).sort();
  return {
    valuedAt: now.toISOString(), fxDateFrom: dates[0] ?? null, fxDateTo: dates.at(-1) ?? null,
    quotedHoldingCount: securities.filter(holding => holding.latestPriceKind === "quote").length,
    storedPriceHoldingCount: securities.filter(holding => holding.latestPriceKind === "stored").length,
    missingPriceHoldingCount: securities.filter(holding => holding.latestPrice === null).length,
    priceDateFrom: priceDates[0] ?? null, priceDateTo: priceDates.at(-1) ?? null,
    quoteFetchedAtFrom: quoteTimes[0] ?? null, quoteFetchedAtTo: quoteTimes.at(-1) ?? null
  };
}
