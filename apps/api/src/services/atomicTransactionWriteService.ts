import { randomUUID } from "node:crypto";
import {
  calculateHoldings, calculatePortfolioSnapshotValuation,
  type CreateInvestmentTransactionInput, type InvestmentTransaction,
  type PortfolioSnapshotValuation, type PriceRecord
} from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listPricesForTransactionWrite } from "../repositories/priceRepository";
import { listSnapshotDatesFrom } from "../repositories/portfolioSnapshotRepository";
import { commitTransactionWrite, listTransactions } from "../repositories/transactionRepository";
import { ApiRequestError } from "../utils/apiError";
import { buildGeneratedCashLegInput, buildTransactionPriceRecordInput } from "./transactionService";
import { listValuationRatesForHoldings } from "./valuationMarketDataService";

export async function writeTransactionAtomically(input: {
  operation: "create" | "update" | "delete";
  id: string;
  userId: string;
  revision: string;
  transaction: CreateInvestmentTransactionInput | null;
  existing?: InvestmentTransaction;
  updateDerivedData: boolean;
}): Promise<InvestmentTransaction | null> {
  const now = new Date().toISOString();
  const parent = input.transaction ? previewTransaction(input.id, input.transaction, input.userId, now, input.existing) : null;
  if (!input.updateDerivedData) {
    return commitTransactionWrite({ ...input, cashLeg: null, price: null, snapshots: [] });
  }

  let cashLeg: CreateInvestmentTransactionInput | null = null;
  let price = null;
  let snapshots: PortfolioSnapshotValuation[];
  try {
    const [accounts, instruments, currentTransactions, dates] = await Promise.all([
      listAccounts(), listInstruments(), listTransactions(),
      listSnapshotDatesFrom([input.existing?.tradeDate, parent?.tradeDate].filter((date): date is string => Boolean(date)).sort()[0])
    ]);
    const instrument = parent ? instruments.find(item => item.id === parent.instrumentId) : null;
    if (parent && !instrument) throw new ApiRequestError("VALIDATION_ERROR", "投资标的不存在，本次操作未保存。", 400);
    if (parent?.settlementCurrency && parent.settlementAmount) {
      const cashInstrument = instruments.find(item => item.assetType === "cash" && item.currency === parent.settlementCurrency);
      if (!cashInstrument && !/^0(?:\.0+)?$/.test(parent.settlementAmount)) {
        throw new ApiRequestError("VALIDATION_ERROR", "未配置结算币种的现金标的，本次操作未保存。", 400);
      }
      if (cashInstrument) cashLeg = buildGeneratedCashLegInput(parent, cashInstrument);
    }
    const transactions = currentTransactions.filter(item => item.id !== input.id && item.linkedTransactionId !== input.id);
    if (parent) transactions.push(parent);
    if (cashLeg) transactions.push(previewTransaction(randomUUID(), cashLeg, input.userId, now));
    const toDate = [...dates, parent?.tradeDate ?? input.existing!.tradeDate].sort().at(-1)!;
    const storedPrices = await listPricesForTransactionWrite(transactions.map(item => item.instrumentId), toDate);
    const prices: PriceRecord[] = storedPrices.filter(item => item.sourceTransactionId !== input.id);
    const candidatePrice = parent && instrument ? buildTransactionPriceRecordInput(parent, instrument) : null;
    if (candidatePrice && !prices.some(item => item.instrumentId === candidatePrice.instrumentId
      && item.priceDate === candidatePrice.priceDate && item.currency === candidatePrice.currency)) {
      price = candidatePrice;
      prices.push({ id: randomUUID(), instrumentId: price.instrumentId, priceDate: price.priceDate,
        closePrice: price.closePrice, currency: price.currency, source: "manual", sourceSymbol: price.sourceSymbol ?? null,
        isAdjusted: false, isEstimated: false, createdAt: now, updatedAt: now });
    }
    snapshots = [];
    for (const snapshotDate of dates) {
      const datedTransactions = transactions.filter(item => item.tradeDate <= snapshotDate);
      const preliminaryHoldings = calculateHoldings(datedTransactions, accounts, instruments);
      const fxRates = await listValuationRatesForHoldings({ valuationDate: snapshotDate, transactions: datedTransactions,
        holdings: preliminaryHoldings, extraCurrencies: ["NZD", "CNY"] });
      snapshots.push(calculatePortfolioSnapshotValuation({ snapshotDate, accounts, prices, fxRates,
        holdings: calculateHoldings(datedTransactions, accounts, instruments, { fxRates }) }));
    }
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    console.error("Transaction snapshot preparation failed", { operation: input.operation });
    throw new ApiRequestError("INTERNAL_ERROR", "无法计算历史资产快照，本次操作未保存，交易和现金余额未改变。请稍后重试。", 500);
  }
  return commitTransactionWrite({ ...input, cashLeg, price, snapshots });
}

function previewTransaction(id: string, input: CreateInvestmentTransactionInput, userId: string, now: string,
  existing?: InvestmentTransaction): InvestmentTransaction {
  return {
    id, accountId: input.accountId, instrumentId: input.instrumentId,
    instrumentSymbol: null, instrumentName: null, instrumentShortName: null, instrumentAssetType: null,
    transactionType: input.transactionType, tradeDate: input.tradeDate, settlementDate: input.settlementDate ?? null,
    quantity: input.quantity ?? null, price: input.price ?? null, grossAmount: input.grossAmount ?? null,
    fee: input.fee ?? "0", tax: input.tax ?? "0", currency: input.currency,
    adjustmentDirection: input.adjustmentDirection ?? null, transactionSource: input.transactionSource ?? "manual",
    linkedTransactionId: input.linkedTransactionId ?? null, settlementCurrency: input.settlementCurrency ?? null,
    settlementAmount: input.settlementAmount ?? null, notes: input.notes ?? null,
    createdByUserId: existing?.createdByUserId ?? userId, updatedByUserId: userId,
    createdAt: existing?.createdAt ?? now, updatedAt: now
  };
}
