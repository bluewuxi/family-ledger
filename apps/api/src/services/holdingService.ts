import { calculateHoldings as calculateSharedHoldings } from "@family-ledger/shared";
import type {
  CurrencyCode,
  HoldingSummary,
  HoldingsValuationSummary,
  Instrument,
  InvestmentAccount,
  InvestmentTransaction
} from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listLatestValuationRatesToUsd } from "../repositories/fxRateRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listLatestPrices } from "../repositories/priceRepository";
import { listTransactions } from "../repositories/transactionRepository";
import { calculateHoldingsValuation, parseReportingCurrency } from "./portfolioValuationService";

export async function getHoldings(input: { currency?: string } = {}): Promise<HoldingsValuationSummary> {
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
  const requiredFxCurrencies = getRequiredFxCurrencies(holdings, reportingCurrency);
  const [prices, fxRates] = await Promise.all([
    listLatestPrices(securityInstruments),
    listLatestValuationRatesToUsd(requiredFxCurrencies)
  ]);

  return calculateHoldingsValuation(holdings, prices, fxRates, reportingCurrency);
}

export function calculateHoldings(
  transactions: InvestmentTransaction[],
  accounts: InvestmentAccount[],
  instruments: Instrument[]
): HoldingSummary[] {
  return calculateSharedHoldings(transactions, accounts, instruments);
}

function getRequiredFxCurrencies(
  holdings: HoldingSummary[],
  reportingCurrency: CurrencyCode
): CurrencyCode[] {
  return unique([
    ...holdings.map((holding) => holding.currency).filter((currency) => currency !== "USD"),
    ...(reportingCurrency === "USD" ? [] : [reportingCurrency])
  ]);
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
