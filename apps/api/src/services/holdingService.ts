import { calculateHoldings as calculateSharedHoldings, getAppBusinessDate } from "@family-ledger/shared";
import type {
  AuthenticatedUser,
  ExchangeRateRecord,
  HoldingSummary,
  HoldingsValuationSummary,
  Instrument,
  InvestmentAccount,
  InvestmentTransaction
} from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listLatestPrices } from "../repositories/priceRepository";
import { listTransactions } from "../repositories/transactionRepository";
import { calculateHoldingsValuation } from "./portfolioValuationService";
import { resolveReportingCurrency } from "./reportingCurrencyService";
import { listValuationRatesForHoldings } from "./valuationMarketDataService";

export async function getHoldings(input: { currency?: string; user?: AuthenticatedUser } = {}): Promise<HoldingsValuationSummary> {
  const reportingCurrency = await resolveReportingCurrency(input);
  const [transactions, accounts, instruments] = await Promise.all([
    listTransactions(),
    listAccounts(),
    listInstruments()
  ]);
  const preliminaryHoldings = calculateHoldings(transactions, accounts, instruments);
  const securityInstruments = uniqueBy(
    preliminaryHoldings
      .filter((holding) => holding.assetType !== "cash")
      .map((holding) => ({ instrumentId: holding.instrumentId, currency: holding.currency })),
    (instrument) => instrument.instrumentId
  );
  const [prices, fxRates] = await Promise.all([
    listLatestPrices(securityInstruments),
    listValuationRatesForHoldings({
      valuationDate: getAppBusinessDate(),
      transactions,
      holdings: preliminaryHoldings,
      reportingCurrency
    })
  ]);
  const holdings = calculateHoldings(transactions, accounts, instruments, fxRates);

  return calculateHoldingsValuation(holdings, prices, fxRates, reportingCurrency);
}

export function calculateHoldings(
  transactions: InvestmentTransaction[],
  accounts: InvestmentAccount[],
  instruments: Instrument[],
  fxRates?: ExchangeRateRecord[]
): HoldingSummary[] {
  return calculateSharedHoldings(transactions, accounts, instruments, fxRates ? { fxRates } : undefined);
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
