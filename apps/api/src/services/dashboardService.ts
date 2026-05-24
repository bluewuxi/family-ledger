import type {
  CurrencyCode,
  HoldingSummary,
  DashboardSummary,
  SnapshotDisplayCurrency
} from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listLatestValuationRatesToUsd } from "../repositories/fxRateRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listLatestPrices } from "../repositories/priceRepository";
import { listTransactions } from "../repositories/transactionRepository";
import { calculateHoldings } from "./holdingService";
import { calculateDashboardSummary, parseReportingCurrency } from "./portfolioValuationService";

export { calculateDashboardSummary } from "./portfolioValuationService";

export async function getDashboard(input: { currency?: string } = {}): Promise<DashboardSummary> {
  const reportingCurrency = parseReportingCurrency(input.currency);
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

  return calculateDashboardSummary(holdings, accounts, prices, fxRates, reportingCurrency);
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
