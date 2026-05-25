import { calculateHoldings, calculatePortfolioSnapshotValuation } from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listPricesUntil } from "../repositories/priceRepository";
import { upsertPortfolioSnapshot } from "../repositories/portfolioSnapshotRepository";
import { listTransactionsUntil } from "../repositories/transactionRepository";
import { listValuationRatesToUsdUntil } from "../repositories/fxRateRepository";

export async function recalculateSnapshotsFrom(fromDate: string): Promise<void> {
  const snapshotDates = getSnapshotDatesThroughYesterday(fromDate);

  for (const snapshotDate of snapshotDates) {
    await recalculateSnapshot(snapshotDate);
  }
}

export function getSnapshotDatesThroughYesterday(fromDate: string, now = new Date()): string[] {
  const yesterday = toIsoDate(addUtcDays(startOfUtcDay(now), -1));

  if (fromDate > yesterday) {
    return [];
  }

  const dates: string[] = [];
  let cursor = parseIsoDate(fromDate);
  const end = parseIsoDate(yesterday);

  while (cursor <= end) {
    dates.push(toIsoDate(cursor));
    cursor = addUtcDays(cursor, 1);
  }

  return dates;
}

async function recalculateSnapshot(snapshotDate: string): Promise<void> {
  const [accounts, instruments, transactions, prices, fxRates] = await Promise.all([
    listAccounts(),
    listInstruments(),
    listTransactionsUntil(snapshotDate),
    listPricesUntil(snapshotDate),
    listValuationRatesToUsdUntil(snapshotDate)
  ]);
  const holdings = calculateHoldings(transactions, accounts, instruments);
  const valuation = calculatePortfolioSnapshotValuation({
    snapshotDate,
    holdings,
    accounts,
    prices,
    fxRates
  });

  await upsertPortfolioSnapshot(valuation);
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
