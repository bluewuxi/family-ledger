import { calculateHoldings, calculatePortfolioSnapshotValuation, withSnapshotEligibility } from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listLatestPricesForDates } from "../repositories/priceRepository";
import { getSnapshotWriteRevision, listSnapshotDatesFrom, upsertPortfolioSnapshot } from "../repositories/portfolioSnapshotRepository";
import { listTransactionsUntil } from "../repositories/transactionRepository";
import { listValuationRatesForHoldings } from "./valuationMarketDataService";

export async function recalculateSnapshotsFrom(fromDate: string): Promise<void> {
  const snapshotDates = await listSnapshotDatesFrom(fromDate);

  if (snapshotDates.length === 0) {
    return;
  }

  for (const snapshotDate of snapshotDates) {
    for (let attempt=0; attempt<3; attempt++) {
    const revision = await getSnapshotWriteRevision();
    const [accounts,instruments,transactions] = await Promise.all([listAccounts(),listInstruments(),listTransactionsUntil(snapshotDate)]);
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
    const valuation = withSnapshotEligibility(calculatePortfolioSnapshotValuation({
      snapshotDate,
      holdings,
      accounts,
      prices,
      fxRates
    }), { holdings, instruments, prices, fxRates });

    try { await upsertPortfolioSnapshot(valuation,revision); break; }
    catch(error) { if(attempt < 2 && (error as {code?:string}).code === "40001") continue; throw error; }
    }
  }
}
