import { calculateHoldings, calculatePortfolioSnapshotValuation } from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listPricesUntil } from "../repositories/priceRepository";
import { listSnapshotDatesFrom, upsertPortfolioSnapshot } from "../repositories/portfolioSnapshotRepository";
import { listTransactionsUntil } from "../repositories/transactionRepository";
import { listValuationRatesToUsdUntil } from "../repositories/fxRateRepository";

export async function recalculateSnapshotsFrom(fromDate: string): Promise<void> {
  const snapshotDates = await listSnapshotDatesFrom(fromDate);

  if (snapshotDates.length === 0) {
    return;
  }

  const latestSnapshotDate = snapshotDates[snapshotDates.length - 1];
  const [accounts, instruments, transactions, prices, fxRates] = await Promise.all([
    listAccounts(),
    listInstruments(),
    listTransactionsUntil(latestSnapshotDate),
    listPricesUntil(latestSnapshotDate),
    listValuationRatesToUsdUntil(latestSnapshotDate)
  ]);

  for (const snapshotDate of snapshotDates) {
    const holdings = calculateHoldings(
      transactions.filter((transaction) => transaction.tradeDate <= snapshotDate),
      accounts,
      instruments
    );
    const valuation = calculatePortfolioSnapshotValuation({
      snapshotDate,
      holdings,
      accounts,
      prices: prices.filter((price) => price.priceDate <= snapshotDate),
      fxRates: fxRates.filter((rate) => rate.rateDate <= snapshotDate)
    });

    await upsertPortfolioSnapshot(valuation);
  }
}
