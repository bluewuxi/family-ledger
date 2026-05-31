import { calculateHoldings, calculatePortfolioSnapshotValuation } from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listLatestPricesForDates } from "../repositories/priceRepository";
import { listSnapshotDatesFrom, upsertPortfolioSnapshot } from "../repositories/portfolioSnapshotRepository";
import { listTransactionsUntil } from "../repositories/transactionRepository";
import { listValuationRatesForHoldings } from "./valuationMarketDataService";

export async function recalculateSnapshotsFrom(fromDate: string): Promise<void> {
  const snapshotDates = await listSnapshotDatesFrom(fromDate);

  if (snapshotDates.length === 0) {
    return;
  }

  const latestSnapshotDate = snapshotDates[snapshotDates.length - 1];
  const [accounts, instruments, transactions] = await Promise.all([
    listAccounts(),
    listInstruments(),
    listTransactionsUntil(latestSnapshotDate)
  ]);

  for (const snapshotDate of snapshotDates) {
    const snapshotTransactions = transactions.filter((transaction) => transaction.tradeDate <= snapshotDate);
    const preliminaryHoldings = calculateHoldings(snapshotTransactions, accounts, instruments);
    const heldInstrumentIds = preliminaryHoldings
      .filter((holding) => holding.assetType !== "cash")
      .map((holding) => holding.instrumentId);
    const [prices, fxRates] = await Promise.all([
      listLatestPricesForDates([snapshotDate], heldInstrumentIds),
      listValuationRatesForHoldings({
        valuationDate: snapshotDate,
        transactions: snapshotTransactions,
        holdings: preliminaryHoldings,
        extraCurrencies: ["NZD", "CNY"]
      })
    ]);
    const holdings = calculateHoldings(snapshotTransactions, accounts, instruments, { fxRates });
    const valuation = calculatePortfolioSnapshotValuation({
      snapshotDate,
      holdings,
      accounts,
      prices,
      fxRates
    });

    await upsertPortfolioSnapshot(valuation);
  }
}
