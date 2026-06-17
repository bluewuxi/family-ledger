import Decimal from "decimal.js";
import { calculateHoldings as calculateSharedHoldings, getAppBusinessDate } from "@family-ledger/shared";
import type {
  AuthenticatedUser,
  ExchangeRateRecord,
  HoldingDetailLinkedCashLeg,
  HoldingDetailPriceContext,
  HoldingDetailSummary,
  HoldingSummary,
  HoldingsValuationSummary,
  Instrument,
  InvestmentAccount,
  InvestmentTransaction,
  PriceRecord,
  SnapshotDisplayCurrency,
  ValuedHoldingSummary
} from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listLatestPrices } from "../repositories/priceRepository";
import { listTransactions } from "../repositories/transactionRepository";
import { calculateHoldingsValuation } from "./portfolioValuationService";
import { resolveReportingCurrency } from "./reportingCurrencyService";
import { listValuationRatesForHoldings } from "./valuationMarketDataService";
import { ApiRequestError } from "../utils/apiError";

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

export async function getHoldingDetail(input: {
  accountId?: string;
  instrumentId?: string;
  currency?: string;
  user?: AuthenticatedUser;
}): Promise<HoldingDetailSummary> {
  const accountId = requiredUuid(input.accountId, "accountId");
  const instrumentId = requiredUuid(input.instrumentId, "instrumentId");
  const reportingCurrency = await resolveReportingCurrency(input);
  const [transactions, accounts, instruments] = await Promise.all([
    listTransactions(),
    listAccounts(),
    listInstruments()
  ]);
  const account = accounts.find((item) => item.id === accountId);
  const instrument = instruments.find((item) => item.id === instrumentId);

  if (!account || !instrument) {
    throw new ApiRequestError("NOT_FOUND", "Holding was not found.", 404);
  }

  const relatedTransactions = selectHoldingDetailTransactions(accountId, instrumentId, instrument, transactions);
  const preliminaryHoldings = calculateHoldings(transactions, accounts, instruments);
  const preliminaryHolding = preliminaryHoldings.find(
    (holding) => holding.accountId === accountId && holding.instrumentId === instrumentId
  );

  if (!preliminaryHolding && relatedTransactions.length === 0) {
    throw new ApiRequestError("NOT_FOUND", "Holding was not found.", 404);
  }

  const detailHoldingBase = preliminaryHolding ?? createZeroHolding(account, instrument);
  const hasCurrentPosition = preliminaryHolding !== undefined;
  const prices = instrument.assetType === "cash" ? [] : await listLatestPrices([{ instrumentId, currency: instrument.currency }]);
  const fxRates = hasCurrentPosition
    ? await listValuationRatesForHoldings({
        valuationDate: getAppBusinessDate(),
        transactions: relatedTransactions,
        holdings: [detailHoldingBase],
        reportingCurrency
      })
    : [];
  const fxAwareHolding = hasCurrentPosition
    ? calculateHoldings(transactions, accounts, instruments, fxRates).find(
        (holding) => holding.accountId === accountId && holding.instrumentId === instrumentId
      )
    : undefined;

  return buildHoldingDetailSummary({
    reportingCurrency,
    account,
    instrument,
    holding: fxAwareHolding ?? detailHoldingBase,
    hasCurrentPosition,
    relatedTransactions,
    allTransactions: transactions,
    prices,
    fxRates
  });
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

export function buildHoldingDetailSummary(input: {
  reportingCurrency: SnapshotDisplayCurrency;
  account: InvestmentAccount;
  instrument: Instrument;
  holding: HoldingSummary;
  hasCurrentPosition: boolean;
  relatedTransactions: InvestmentTransaction[];
  allTransactions: InvestmentTransaction[];
  prices: PriceRecord[];
  fxRates: ExchangeRateRecord[];
}): HoldingDetailSummary {
  const valuedHolding = input.hasCurrentPosition
    ? calculateHoldingsValuation(
        [input.holding],
        input.prices,
        input.fxRates,
        input.reportingCurrency
      ).holdings[0]
    : createClosedValuedHolding(input.holding, input.reportingCurrency, input.prices);

  if (!valuedHolding) {
    throw new ApiRequestError("NOT_FOUND", "Holding was not found.", 404);
  }

  return {
    reportingCurrency: input.reportingCurrency,
    hasCurrentPosition: input.hasCurrentPosition,
    holding: valuedHolding,
    account: input.account,
    instrument: input.instrument,
    transactions: input.relatedTransactions,
    linkedCashLegs: buildLinkedCashLegs(input.relatedTransactions, input.allTransactions),
    dividendTransactions: input.relatedTransactions.filter((transaction) => transaction.transactionType === "dividend"),
    dividendSummary: buildDividendSummary(input.relatedTransactions, input.instrument.currency),
    priceContext: buildPriceContext(input.prices)
  };
}

export function selectHoldingDetailTransactions(
  accountId: string,
  instrumentId: string,
  instrument: Instrument,
  transactions: InvestmentTransaction[]
): InvestmentTransaction[] {
  return transactions
    .filter((transaction) => transaction.accountId === accountId && transaction.instrumentId === instrumentId)
    .filter((transaction) => instrument.assetType === "cash" || transaction.transactionSource !== "generated_cash_leg");
}

function createZeroHolding(account: InvestmentAccount, instrument: Instrument): HoldingSummary {
  return {
    accountId: account.id,
    accountName: account.name,
    instrumentId: instrument.id,
    instrumentSymbol: instrument.symbol,
    instrumentName: instrument.name,
    instrumentShortName: instrument.shortName,
    assetType: instrument.assetType,
    currency: instrument.currency,
    quantity: "0",
    averageUnitCost: null,
    costAmount: null,
    costAmountUsd: null,
    warnings: []
  };
}

function createClosedValuedHolding(
  holding: HoldingSummary,
  reportingCurrency: SnapshotDisplayCurrency,
  prices: PriceRecord[]
): ValuedHoldingSummary {
  const latestPrice = prices[0] ?? null;

  return {
    ...holding,
    reportingCurrency,
    quantity: "0",
    averageUnitCost: null,
    costAmount: null,
    costAmountUsd: null,
    marketValue: "0.00",
    unrealizedGain: "0.00",
    latestPrice: latestPrice?.closePrice ?? null,
    latestPriceDate: latestPrice?.priceDate ?? null,
    warnings: [],
    valuationWarnings: []
  };
}

function buildLinkedCashLegs(
  holdingTransactions: InvestmentTransaction[],
  allTransactions: InvestmentTransaction[]
): HoldingDetailLinkedCashLeg[] {
  const parentIds = new Set(
    holdingTransactions
      .filter((transaction) => transaction.transactionType === "buy" || transaction.transactionType === "sell")
      .map((transaction) => transaction.id)
  );

  return allTransactions
    .filter((transaction) => transaction.transactionSource === "generated_cash_leg")
    .filter((transaction) => transaction.linkedTransactionId !== null && parentIds.has(transaction.linkedTransactionId))
    .map((transaction) => ({
      parentTransactionId: transaction.linkedTransactionId as string,
      transaction
    }));
}

function buildDividendSummary(
  holdingTransactions: InvestmentTransaction[],
  currency: HoldingDetailSummary["dividendSummary"]["currency"]
): HoldingDetailSummary["dividendSummary"] {
  const dividendTransactions = holdingTransactions.filter((transaction) => transaction.transactionType === "dividend");
  const totalGrossAmount = dividendTransactions.reduce(
    (total, transaction) => total.plus(transaction.grossAmount ?? "0"),
    new Decimal(0)
  );
  const totalTaxAmount = dividendTransactions.reduce(
    (total, transaction) => total.plus(transaction.tax ?? "0"),
    new Decimal(0)
  );
  const latestDividendDate = dividendTransactions.map((transaction) => transaction.tradeDate).sort().at(-1) ?? null;

  return {
    currency,
    totalGrossAmount: formatDecimal(totalGrossAmount, 6),
    totalTaxAmount: formatDecimal(totalTaxAmount, 6),
    latestDividendDate
  };
}

function buildPriceContext(prices: PriceRecord[]): HoldingDetailPriceContext {
  const latestPrice = prices[0] ?? null;
  const previousPrice = prices[1] ?? null;

  if (!latestPrice) {
    return {
      latestPrice: null,
      previousPrice: null,
      movementAmount: null,
      movementPct: null,
      provider: null
    };
  }

  if (!previousPrice) {
    return {
      latestPrice,
      previousPrice: null,
      movementAmount: null,
      movementPct: null,
      provider: latestPrice.source
    };
  }

  const latestAmount = new Decimal(latestPrice.closePrice);
  const previousAmount = new Decimal(previousPrice.closePrice);
  const movementAmount = latestAmount.minus(previousAmount);

  return {
    latestPrice,
    previousPrice,
    movementAmount: formatDecimal(movementAmount, 6),
    movementPct: previousAmount.isZero() ? null : formatDecimal(movementAmount.dividedBy(previousAmount).times(100), 6),
    provider: latestPrice.source
  };
}

function requiredUuid(value: string | undefined, field: string): string {
  if (!value) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} is required.`, 400);
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} id is invalid.`, 400);
  }

  return value;
}

function formatDecimal(amount: Decimal, decimalPlaces: number): string {
  return amount.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP).toFixed(decimalPlaces);
}
