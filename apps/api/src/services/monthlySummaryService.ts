import Decimal from "decimal.js";
import type {
  AuthenticatedUser,
  CurrencyCode,
  ExchangeRateRecord,
  InvestmentTransaction,
  MonthlyBridgeLine,
  MonthlyCashAdjustmentSummary,
  MonthlyDividendInstrumentSummary,
  MonthlyDividendSummary,
  MonthlySummary,
  MonthlySummaryWarning,
  MonthlySummaryWarningCode,
  PortfolioSnapshotSummary,
  SnapshotDisplayCurrency
} from "@family-ledger/shared";
import { listExactValuationRatesToUsdForDates } from "../repositories/fxRateRepository";
import { listPortfolioSnapshots } from "../repositories/portfolioSnapshotRepository";
import { listTransactions } from "../repositories/transactionRepository";
import { ApiRequestError } from "../utils/apiError";
import { resolveReportingCurrency } from "./reportingCurrencyService";

const monthPattern = /^\d{4}-\d{2}$/;
const earliestDate = "0001-01-01";

interface MoneyConversionResult {
  amount: Decimal | null;
  warnings: MonthlySummaryWarning[];
}

interface TransactionAmountConversionResult {
  transaction: InvestmentTransaction;
  amount: Decimal | null;
  warnings: MonthlySummaryWarning[];
}

export async function getMonthlySummary(input: {
  month?: string;
  currency?: string;
  user?: AuthenticatedUser;
}): Promise<MonthlySummary> {
  const currency = await resolveReportingCurrency(input);
  const month = parseMonth(input.month);
  const { monthStart, monthEnd, previousDay } = getMonthBoundaries(month);
  const [startSnapshots, endSnapshots, transactions] = await Promise.all([
    listPortfolioSnapshots({ from: earliestDate, to: previousDay, currency, order: "desc", limit: 1 }),
    listPortfolioSnapshots({ from: monthStart, to: monthEnd, currency, order: "desc", limit: 1 }),
    listTransactions({ from: monthStart, to: monthEnd })
  ]);
  const startSnapshot = startSnapshots[0] ?? null;
  const endSnapshot = endSnapshots[0] ?? null;
  const principalTransactions = transactions
    .filter((transaction) => transaction.transactionSource === "manual")
    .filter((transaction) =>
      transaction.transactionType === "opening_position" ||
      transaction.transactionType === "opening_balance" ||
      transaction.transactionType === "deposit" ||
      transaction.transactionType === "withdrawal"
    );
  const adjustmentTransactions = transactions
    .filter((transaction) => transaction.transactionSource === "manual")
    .filter((transaction) => transaction.transactionType === "adjustment");
  const dividendTransactions = transactions
    .filter((transaction) => transaction.transactionSource === "manual")
    .filter((transaction) => transaction.transactionType === "dividend");
  const exactFxRates = await listExactValuationRatesToUsdForDates(
    getRequiredFxDates([...principalTransactions, ...adjustmentTransactions, ...dividendTransactions]),
    getRequiredFxCurrencies([...principalTransactions, ...adjustmentTransactions, ...dividendTransactions], currency)
  );
  const ratesByCurrencyAndDate = new Map(exactFxRates.map((rate) => [fxRateKey(rate.fromCurrency, rate.rateDate), rate]));
  const warnings = new Map<string, MonthlySummaryWarning>();

  addSnapshotWarnings(warnings, startSnapshot, endSnapshot);

  const netPrincipalFlow = sumConvertedTransactions({
    transactions: principalTransactions,
    currency,
    ratesByCurrencyAndDate,
    warningCode: "MISSING_PRINCIPAL_FX_RATE",
    signedAmount: getPrincipalSignedAmount
  });
  addWarnings(warnings, netPrincipalFlow.warnings);

  const cashAdjustmentImpact = sumConvertedTransactions({
    transactions: adjustmentTransactions,
    currency,
    ratesByCurrencyAndDate,
    warningCode: "MISSING_ADJUSTMENT_FX_RATE",
    signedAmount: getAdjustmentSignedAmount
  });
  addWarnings(warnings, cashAdjustmentImpact.warnings);

  const dividendSummary = buildDividendSummary({
    transactions: dividendTransactions,
    currency,
    ratesByCurrencyAndDate
  });
  addWarnings(warnings, dividendSummary.warnings);

  const bridge = calculateMonthlyBridge({
    startValue: startSnapshot?.marketValue ?? null,
    endValue: endSnapshot?.marketValue ?? null,
    netPrincipalFlow: netPrincipalFlow.amount === null ? null : formatDecimal(netPrincipalFlow.amount),
    cashAdjustmentImpact: cashAdjustmentImpact.amount === null ? null : formatDecimal(cashAdjustmentImpact.amount)
  });
  const netPrincipalFlowAmount = netPrincipalFlow.amount === null ? null : formatDecimal(netPrincipalFlow.amount);
  const cashAdjustmentImpactAmount = cashAdjustmentImpact.amount === null ? null : formatDecimal(cashAdjustmentImpact.amount);

  return {
    month,
    currency,
    monthStart,
    monthEnd,
    startSnapshotDate: startSnapshot?.snapshotDate ?? null,
    endSnapshotDate: endSnapshot?.snapshotDate ?? null,
    startValue: bridge.startValue,
    endValue: bridge.endValue,
    assetChange: bridge.assetChange,
    netPrincipalFlow: netPrincipalFlowAmount,
    cashAdjustmentImpact: cashAdjustmentImpactAmount,
    valuationMovement: bridge.valuationMovement,
    bridgeLines: buildBridgeLines(bridge),
    dividendSummary: dividendSummary.summary,
    dividendTransactions: dividendTransactions.sort(compareTransactionsDesc),
    cashAdjustments: buildCashAdjustmentSummaries({
      transactions: adjustmentTransactions,
      currency,
      ratesByCurrencyAndDate
    }),
    principalTransactions: principalTransactions.sort(compareTransactionsDesc),
    warnings: [...warnings.values()]
  };
}

export function calculateMonthlyBridge(input: {
  startValue: string | null;
  endValue: string | null;
  netPrincipalFlow: string | null;
  cashAdjustmentImpact: string | null;
}): {
  startValue: string | null;
  endValue: string | null;
  assetChange: string | null;
  netPrincipalFlow: string | null;
  cashAdjustmentImpact: string | null;
  valuationMovement: string | null;
} {
  const assetChange =
    input.startValue !== null && input.endValue !== null
      ? formatDecimal(new Decimal(input.endValue).minus(input.startValue))
      : null;
  const valuationMovement =
    assetChange !== null && input.netPrincipalFlow !== null && input.cashAdjustmentImpact !== null
      ? formatDecimal(new Decimal(assetChange).minus(input.netPrincipalFlow).minus(input.cashAdjustmentImpact))
      : null;

  return {
    startValue: input.startValue,
    endValue: input.endValue,
    assetChange,
    netPrincipalFlow: input.netPrincipalFlow,
    cashAdjustmentImpact: input.cashAdjustmentImpact,
    valuationMovement
  };
}

function parseMonth(value: string | undefined): string {
  if (!value || !monthPattern.test(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", "month must use YYYY-MM format.", 400);
  }

  const date = new Date(`${value}-01T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 7) !== value) {
    throw new ApiRequestError("VALIDATION_ERROR", "month must be a valid calendar month.", 400);
  }

  return value;
}

export function getMonthlySnapshotWindows(month: string): {
  startWindow: { from: string; to: string };
  endWindow: { from: string; to: string };
} {
  const { monthStart, monthEnd, previousDay } = getMonthBoundaries(month);

  return {
    startWindow: { from: earliestDate, to: previousDay },
    endWindow: { from: monthStart, to: monthEnd }
  };
}

function getMonthBoundaries(month: string): { monthStart: string; monthEnd: string; previousDay: string } {
  const [year, monthText] = month.split("-");
  const monthIndex = Number(monthText) - 1;
  const start = new Date(Date.UTC(Number(year), monthIndex, 1));
  const end = new Date(Date.UTC(Number(year), monthIndex + 1, 0));
  const previous = new Date(start);
  previous.setUTCDate(previous.getUTCDate() - 1);

  return {
    monthStart: formatIsoDate(start),
    monthEnd: formatIsoDate(end),
    previousDay: formatIsoDate(previous)
  };
}

function addSnapshotWarnings(
  warnings: Map<string, MonthlySummaryWarning>,
  startSnapshot: PortfolioSnapshotSummary | null,
  endSnapshot: PortfolioSnapshotSummary | null
): void {
  if (!startSnapshot) {
    addWarning(warnings, {
      code: "MISSING_START_SNAPSHOT",
      date: null,
      currency: null,
      message: "缺少月初前的资产快照，无法完整计算资产变化。"
    });
  } else if (startSnapshot.marketValue === null) {
    addWarning(warnings, {
      code: "START_VALUE_UNAVAILABLE",
      date: startSnapshot.snapshotDate,
      currency: startSnapshot.currency,
      message: "月初资产快照估值不可用，请先修复价格、汇率或成本数据。"
    });
  }

  if (!endSnapshot) {
    addWarning(warnings, {
      code: "MISSING_END_SNAPSHOT",
      date: null,
      currency: null,
      message: "缺少月末资产快照，无法完整计算资产变化。"
    });
  } else if (endSnapshot.marketValue === null) {
    addWarning(warnings, {
      code: "END_VALUE_UNAVAILABLE",
      date: endSnapshot.snapshotDate,
      currency: endSnapshot.currency,
      message: "月末资产快照估值不可用，请先修复价格、汇率或成本数据。"
    });
  }
}

function sumConvertedTransactions(input: {
  transactions: InvestmentTransaction[];
  currency: SnapshotDisplayCurrency;
  ratesByCurrencyAndDate: Map<string, ExchangeRateRecord>;
  warningCode: MonthlySummaryWarningCode;
  signedAmount: (transaction: InvestmentTransaction) => Decimal;
}): { amount: Decimal | null; warnings: MonthlySummaryWarning[] } {
  let total = new Decimal(0);
  const warnings = new Map<string, MonthlySummaryWarning>();

  for (const transaction of input.transactions) {
    const conversion = convertMoney({
      amount: input.signedAmount(transaction),
      fromCurrency: transaction.currency,
      toCurrency: input.currency,
      date: transaction.tradeDate,
      ratesByCurrencyAndDate: input.ratesByCurrencyAndDate,
      warningCode: input.warningCode
    });
    addWarnings(warnings, conversion.warnings);

    if (conversion.amount === null) {
      continue;
    }

    total = total.plus(conversion.amount);
  }

  return {
    amount: warnings.size > 0 ? null : total,
    warnings: [...warnings.values()]
  };
}

function buildDividendSummary(input: {
  transactions: InvestmentTransaction[];
  currency: SnapshotDisplayCurrency;
  ratesByCurrencyAndDate: Map<string, ExchangeRateRecord>;
}): { summary: MonthlyDividendSummary; warnings: MonthlySummaryWarning[] } {
  const warnings = new Map<string, MonthlySummaryWarning>();
  const instrumentSummaries = new Map<string, MonthlyDividendInstrumentSummary>();
  let grossTotal = new Decimal(0);
  let taxTotal = new Decimal(0);
  let netTotal = new Decimal(0);

  for (const transaction of input.transactions) {
    const gross = new Decimal(transaction.grossAmount ?? "0");
    const tax = new Decimal(transaction.tax ?? "0");
    const net = gross.minus(tax);
    const grossConversion = convertMoney({
      amount: gross,
      fromCurrency: transaction.currency,
      toCurrency: input.currency,
      date: transaction.tradeDate,
      ratesByCurrencyAndDate: input.ratesByCurrencyAndDate,
      warningCode: "MISSING_DIVIDEND_FX_RATE"
    });
    const taxConversion = convertMoney({
      amount: tax,
      fromCurrency: transaction.currency,
      toCurrency: input.currency,
      date: transaction.tradeDate,
      ratesByCurrencyAndDate: input.ratesByCurrencyAndDate,
      warningCode: "MISSING_DIVIDEND_FX_RATE"
    });
    const netConversion = convertMoney({
      amount: net,
      fromCurrency: transaction.currency,
      toCurrency: input.currency,
      date: transaction.tradeDate,
      ratesByCurrencyAndDate: input.ratesByCurrencyAndDate,
      warningCode: "MISSING_DIVIDEND_FX_RATE"
    });
    addWarnings(warnings, [...grossConversion.warnings, ...taxConversion.warnings, ...netConversion.warnings]);

    if (grossConversion.amount !== null) {
      grossTotal = grossTotal.plus(grossConversion.amount);
    }
    if (taxConversion.amount !== null) {
      taxTotal = taxTotal.plus(taxConversion.amount);
    }
    if (netConversion.amount !== null) {
      netTotal = netTotal.plus(netConversion.amount);
    }

    const existing = instrumentSummaries.get(transaction.instrumentId) ?? {
      instrumentId: transaction.instrumentId,
      instrumentSymbol: transaction.instrumentSymbol ?? null,
      instrumentName: transaction.instrumentName ?? null,
      instrumentShortName: transaction.instrumentShortName ?? null,
      currency: transaction.currency,
      grossAmount: "0.000000",
      taxAmount: "0.000000",
      netAmount: "0.000000",
      transactionCount: 0
    };
    existing.grossAmount = formatDecimal(new Decimal(existing.grossAmount).plus(gross));
    existing.taxAmount = formatDecimal(new Decimal(existing.taxAmount).plus(tax));
    existing.netAmount = formatDecimal(new Decimal(existing.netAmount).plus(net));
    existing.transactionCount += 1;
    instrumentSummaries.set(transaction.instrumentId, existing);
  }

  const hasWarnings = warnings.size > 0;
  return {
    summary: {
      grossAmount: hasWarnings ? null : formatDecimal(grossTotal),
      taxAmount: hasWarnings ? null : formatDecimal(taxTotal),
      netAmount: hasWarnings ? null : formatDecimal(netTotal),
      transactionCount: input.transactions.length,
      latestDividendDate: input.transactions.map((transaction) => transaction.tradeDate).sort().at(-1) ?? null,
      instruments: [...instrumentSummaries.values()].sort((left, right) =>
        new Decimal(right.netAmount).comparedTo(left.netAmount) ||
        (left.instrumentShortName ?? left.instrumentName ?? left.instrumentId).localeCompare(
          right.instrumentShortName ?? right.instrumentName ?? right.instrumentId,
          "zh-CN"
        )
      )
    },
    warnings: [...warnings.values()]
  };
}

function buildCashAdjustmentSummaries(input: {
  transactions: InvestmentTransaction[];
  currency: SnapshotDisplayCurrency;
  ratesByCurrencyAndDate: Map<string, ExchangeRateRecord>;
}): MonthlyCashAdjustmentSummary[] {
  return input.transactions
    .map((transaction): TransactionAmountConversionResult => {
      const conversion = convertMoney({
        amount: getAdjustmentSignedAmount(transaction),
        fromCurrency: transaction.currency,
        toCurrency: input.currency,
        date: transaction.tradeDate,
        ratesByCurrencyAndDate: input.ratesByCurrencyAndDate,
        warningCode: "MISSING_ADJUSTMENT_FX_RATE"
      });

      return { transaction, amount: conversion.amount, warnings: conversion.warnings };
    })
    .sort((left, right) => compareTransactionsDesc(left.transaction, right.transaction))
    .map((item) => ({ transaction: item.transaction, signedAmount: item.amount === null ? null : formatDecimal(item.amount) }));
}

function convertMoney(input: {
  amount: Decimal;
  fromCurrency: CurrencyCode;
  toCurrency: SnapshotDisplayCurrency;
  date: string;
  ratesByCurrencyAndDate: Map<string, ExchangeRateRecord>;
  warningCode: MonthlySummaryWarningCode;
}): MoneyConversionResult {
  if (input.fromCurrency === input.toCurrency) {
    return { amount: input.amount, warnings: [] };
  }

  const sourceRate = getExactUsdRate(input.fromCurrency, input.date, input.ratesByCurrencyAndDate);
  const targetRate = getExactUsdRate(input.toCurrency, input.date, input.ratesByCurrencyAndDate);
  const warnings: MonthlySummaryWarning[] = [];

  if (sourceRate === null) {
    warnings.push(toFxWarning(input.warningCode, input.date, input.fromCurrency));
  }
  if (targetRate === null) {
    warnings.push(toFxWarning(input.warningCode, input.date, input.toCurrency));
  }
  if (sourceRate === null || targetRate === null) {
    return { amount: null, warnings };
  }

  return {
    amount: input.amount.times(sourceRate).dividedBy(targetRate),
    warnings: []
  };
}

function getExactUsdRate(
  currency: CurrencyCode | SnapshotDisplayCurrency,
  date: string,
  ratesByCurrencyAndDate: Map<string, ExchangeRateRecord>
): Decimal | null {
  if (currency === "USD") {
    return new Decimal(1);
  }

  const rate = ratesByCurrencyAndDate.get(fxRateKey(currency, date));
  return rate ? new Decimal(rate.rate) : null;
}

function getPrincipalSignedAmount(transaction: InvestmentTransaction): Decimal {
  const amount = new Decimal(transaction.grossAmount ?? "0");
  return transaction.transactionType === "withdrawal" ? amount.negated() : amount;
}

function getAdjustmentSignedAmount(transaction: InvestmentTransaction): Decimal {
  const amount = new Decimal(transaction.grossAmount ?? "0");
  return transaction.adjustmentDirection === "decrease" ? amount.negated() : amount;
}

function getRequiredFxDates(transactions: InvestmentTransaction[]): string[] {
  return uniqueValues(transactions.map((transaction) => transaction.tradeDate));
}

function getRequiredFxCurrencies(
  transactions: InvestmentTransaction[],
  displayCurrency: SnapshotDisplayCurrency
): CurrencyCode[] {
  const currencies = new Set<CurrencyCode>();

  for (const transaction of transactions) {
    if (transaction.currency !== displayCurrency && transaction.currency !== "USD") {
      currencies.add(transaction.currency);
    }
    if (transaction.currency !== displayCurrency && displayCurrency !== "USD") {
      currencies.add(displayCurrency);
    }
  }

  return [...currencies];
}

function buildBridgeLines(input: {
  startValue: string | null;
  endValue: string | null;
  assetChange: string | null;
  netPrincipalFlow: string | null;
  cashAdjustmentImpact: string | null;
  valuationMovement: string | null;
}): MonthlyBridgeLine[] {
  return [
    { key: "start_value", label: "月初资产", amount: input.startValue },
    { key: "end_value", label: "月末资产", amount: input.endValue },
    { key: "asset_change", label: "资产变化", amount: input.assetChange },
    { key: "net_principal_flow", label: "净投入", amount: input.netPrincipalFlow },
    { key: "cash_adjustment", label: "现金校准", amount: input.cashAdjustmentImpact },
    { key: "valuation_movement", label: "估值变动", amount: input.valuationMovement }
  ];
}

function toFxWarning(
  code: MonthlySummaryWarningCode,
  date: string,
  currency: CurrencyCode | SnapshotDisplayCurrency
): MonthlySummaryWarning {
  return {
    code,
    date,
    currency,
    message: `${date} 缺少 ${currency} 的估值汇率，相关月度金额无法换算。`
  };
}

function addWarning(warnings: Map<string, MonthlySummaryWarning>, warning: MonthlySummaryWarning): void {
  warnings.set(`${warning.code}:${warning.date ?? ""}:${warning.currency ?? ""}`, warning);
}

function addWarnings(
  warnings: Map<string, MonthlySummaryWarning>,
  nextWarnings: MonthlySummaryWarning[]
): void {
  for (const warning of nextWarnings) {
    addWarning(warnings, warning);
  }
}

function compareTransactionsDesc(left: InvestmentTransaction, right: InvestmentTransaction): number {
  return (
    right.tradeDate.localeCompare(left.tradeDate) ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  );
}

function fxRateKey(currency: CurrencyCode | SnapshotDisplayCurrency, date: string): string {
  return `${currency}:${date}`;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatDecimal(value: Decimal): string {
  return value.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}
