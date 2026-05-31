import type {
  CurrencyCode,
  ExchangeRateRecord,
  HoldingSummary,
  InvestmentTransaction,
  SnapshotDisplayCurrency
} from "@family-ledger/shared";
import { listValuationRatesToUsdForDates } from "../repositories/fxRateRepository";

export async function listValuationRatesForHoldings(input: {
  valuationDate: string;
  transactions: InvestmentTransaction[];
  holdings: HoldingSummary[];
  reportingCurrency?: SnapshotDisplayCurrency;
  extraCurrencies?: CurrencyCode[];
}): Promise<ExchangeRateRecord[]> {
  const dates = new Set<string>([input.valuationDate]);
  const currencies = new Set<CurrencyCode>(input.extraCurrencies ?? []);

  if (input.reportingCurrency) {
    currencies.add(input.reportingCurrency);
  }

  for (const holding of input.holdings) {
    currencies.add(holding.currency);
  }

  for (const transaction of input.transactions) {
    if (!requiresHistoricalCostBasisRate(transaction)) {
      continue;
    }

    dates.add(transaction.tradeDate);

    if (transaction.currency !== "USD") {
      currencies.add(transaction.currency);
    }

    if (transaction.settlementCurrency && transaction.settlementCurrency !== "USD") {
      currencies.add(transaction.settlementCurrency);
    }
  }

  return listValuationRatesToUsdForDates([...dates], [...currencies]);
}

function requiresHistoricalCostBasisRate(transaction: InvestmentTransaction): boolean {
  return (
    (transaction.transactionType === "buy" || transaction.transactionType === "opening_position") &&
    (transaction.currency !== "USD" || (transaction.settlementCurrency !== null && transaction.settlementCurrency !== "USD"))
  );
}
