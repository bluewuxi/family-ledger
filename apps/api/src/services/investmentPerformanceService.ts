import Decimal from "decimal.js";
import type { ExchangeRateRecord, InvestmentPerformance, InvestmentTransaction, SnapshotDisplayCurrency } from "@family-ledger/shared";
import { listExactValuationRatesToUsdForDates } from "../repositories/fxRateRepository";
import { calculatePrincipalPoints, getRequiredPrincipalFxCurrencies, toPrincipalEvent } from "./principalService";

export function selectPrincipalTransactions(transactions: InvestmentTransaction[], businessDate: string): InvestmentTransaction[] {
  return transactions.filter((transaction) => transaction.tradeDate <= businessDate &&
    transaction.transactionSource === "manual" &&
    ["opening_position", "opening_balance", "deposit", "withdrawal"].includes(transaction.transactionType))
    .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));
}

export function calculateInvestmentPerformance(input: {
  totalAssets: string | null;
  transactions: InvestmentTransaction[];
  currency: SnapshotDisplayCurrency;
  businessDate: string;
  exactFxRates: ExchangeRateRecord[];
}): InvestmentPerformance {
  const events = selectPrincipalTransactions(input.transactions, input.businessDate).map(toPrincipalEvent);
  const inceptionDate = input.transactions.filter((transaction) => transaction.tradeDate <= input.businessDate)
    .map((transaction) => transaction.tradeDate).sort()[0] ?? null;
  const principal = calculatePrincipalPoints({ events, exactFxRates: input.exactFxRates, currency: input.currency,
    rangeStart: inceptionDate ?? input.businessDate, rangeEnd: input.businessDate, inceptionDate });
  const assets = input.totalAssets === null ? null : new Decimal(input.totalAssets);
  const profit = assets === null || principal.currentTotalInvestment === null ? null :
    assets.minus(principal.currentTotalInvestment);
  return {
    netInvestment: principal.currentTotalInvestment,
    investmentProfit: profit?.toFixed(2) ?? null,
    profitPercentageOfAssets: profit !== null && assets !== null && assets.gt(0)
      ? profit.div(assets).times(100).toFixed(4) : null,
    inceptionDate,
    warnings: principal.warnings
  };
}

export async function getInvestmentPerformance(input: Omit<Parameters<typeof calculateInvestmentPerformance>[0], "exactFxRates">): Promise<InvestmentPerformance> {
  const events = selectPrincipalTransactions(input.transactions, input.businessDate).map(toPrincipalEvent);
  const exactFxRates = await listExactValuationRatesToUsdForDates(events.map((event) => event.date), getRequiredPrincipalFxCurrencies(events, input.currency));
  return calculateInvestmentPerformance({ ...input, exactFxRates });
}
