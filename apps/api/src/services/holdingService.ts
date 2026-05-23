import Decimal from "decimal.js";
import type {
  HoldingSummary,
  HoldingWarning,
  Instrument,
  InvestmentAccount,
  InvestmentTransaction
} from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listTransactions } from "../repositories/transactionRepository";

interface HoldingState {
  account: InvestmentAccount;
  instrument: Instrument;
  quantity: Decimal;
  costAmount: Decimal;
  costBasisUnavailable: boolean;
  warnings: Set<HoldingWarning>;
}

export async function getHoldings(): Promise<HoldingSummary[]> {
  const [transactions, accounts, instruments] = await Promise.all([
    listTransactions(),
    listAccounts(),
    listInstruments()
  ]);

  return calculateHoldings(transactions, accounts, instruments);
}

export function calculateHoldings(
  transactions: InvestmentTransaction[],
  accounts: InvestmentAccount[],
  instruments: Instrument[]
): HoldingSummary[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const instrumentsById = new Map(instruments.map((instrument) => [instrument.id, instrument]));
  const states = new Map<string, HoldingState>();

  for (const transaction of sortTransactions(transactions)) {
    const account = accountsById.get(transaction.accountId);
    const instrument = instrumentsById.get(transaction.instrumentId);

    if (!account || !instrument) {
      throw new Error("Holding reference data is incomplete.");
    }

    const key = `${account.id}:${instrument.id}`;
    const state = states.get(key) ?? createState(account, instrument);
    states.set(key, state);

    if (instrument.assetType === "cash") {
      applyCashTransaction(state, transaction);
    } else {
      applySecurityTransaction(state, transaction);
    }
  }

  return [...states.values()]
    .filter((state) => !state.quantity.isZero())
    .map(toHoldingSummary)
    .sort((left, right) => {
      const accountComparison = left.accountName.localeCompare(right.accountName, "zh-CN");
      const instrumentComparison = left.instrumentName.localeCompare(right.instrumentName, "zh-CN");
      return accountComparison || instrumentComparison || left.instrumentId.localeCompare(right.instrumentId);
    });
}

function applySecurityTransaction(state: HoldingState, transaction: InvestmentTransaction): void {
  switch (transaction.transactionType) {
    case "buy": {
      const quantity = requiredAmount(transaction.quantity);
      state.quantity = state.quantity.plus(quantity);

      if (!state.costBasisUnavailable) {
        state.costAmount = state.costAmount
          .plus(requiredAmount(transaction.grossAmount))
          .plus(requiredAmount(transaction.fee))
          .plus(requiredAmount(transaction.tax));
      }
      return;
    }
    case "sell": {
      const soldQuantity = requiredAmount(transaction.quantity);
      const priorQuantity = state.quantity;

      if (!state.costBasisUnavailable && priorQuantity.greaterThan(0) && soldQuantity.lessThanOrEqualTo(priorQuantity)) {
        const priorAverageCost = state.costAmount.dividedBy(priorQuantity);
        state.costAmount = state.costAmount.minus(soldQuantity.times(priorAverageCost));
      } else {
        markCostBasisUnavailable(state);
      }

      state.quantity = state.quantity.minus(soldQuantity);

      if (state.quantity.isNegative()) {
        markCostBasisUnavailable(state);
      } else if (state.quantity.isZero() && !state.costBasisUnavailable) {
        state.costAmount = new Decimal(0);
      }
      return;
    }
    case "dividend":
      return;
    default:
      throw new Error("A non-cash instrument has an unsupported holdings transaction.");
  }
}

function applyCashTransaction(state: HoldingState, transaction: InvestmentTransaction): void {
  switch (transaction.transactionType) {
    case "deposit":
    case "interest":
      state.quantity = state.quantity.plus(requiredAmount(transaction.grossAmount));
      return;
    case "withdrawal":
      state.quantity = state.quantity.minus(requiredAmount(transaction.grossAmount));
      return;
    case "fee":
      state.quantity = state.quantity.minus(requiredAmount(transaction.fee));
      return;
    case "tax":
      state.quantity = state.quantity.minus(requiredAmount(transaction.tax));
      return;
    case "adjustment": {
      const amount = requiredAmount(transaction.grossAmount);
      if (transaction.adjustmentDirection === "increase") {
        state.quantity = state.quantity.plus(amount);
        return;
      }
      if (transaction.adjustmentDirection === "decrease") {
        state.quantity = state.quantity.minus(amount);
        return;
      }
      throw new Error("A cash adjustment is missing its direction.");
    }
    default:
      throw new Error("A cash instrument has an unsupported holdings transaction.");
  }
}

function toHoldingSummary(state: HoldingState): HoldingSummary {
  const isCash = state.instrument.assetType === "cash";

  if (state.quantity.isNegative()) {
    state.warnings.add("NEGATIVE_POSITION");
  }

  const costAmount = isCash || state.costBasisUnavailable ? null : formatMoney(state.costAmount);
  const averageUnitCost =
    isCash || state.costBasisUnavailable ? null : formatAverageCost(state.costAmount.dividedBy(state.quantity));

  return {
    accountId: state.account.id,
    accountName: state.account.name,
    instrumentId: state.instrument.id,
    instrumentSymbol: state.instrument.symbol,
    instrumentName: state.instrument.name,
    assetType: state.instrument.assetType,
    currency: state.instrument.currency,
    quantity: state.quantity.toString(),
    averageUnitCost,
    costAmount,
    warnings: [...state.warnings]
  };
}

function markCostBasisUnavailable(state: HoldingState): void {
  state.costBasisUnavailable = true;
  state.warnings.add("NEGATIVE_POSITION");
  state.warnings.add("COST_BASIS_UNAVAILABLE");
}

function requiredAmount(value: string | null): Decimal {
  if (value === null) {
    throw new Error("A transaction is missing a required holdings amount.");
  }
  return new Decimal(value);
}

function formatMoney(amount: Decimal): string {
  return amount.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString();
}

function formatAverageCost(amount: Decimal): string {
  return amount.toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toString();
}

function createState(account: InvestmentAccount, instrument: Instrument): HoldingState {
  return {
    account,
    instrument,
    quantity: new Decimal(0),
    costAmount: new Decimal(0),
    costBasisUnavailable: false,
    warnings: new Set<HoldingWarning>()
  };
}

function sortTransactions(transactions: InvestmentTransaction[]): InvestmentTransaction[] {
  return [...transactions].sort((left, right) => {
    const tradeDateComparison = left.tradeDate.localeCompare(right.tradeDate);
    const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
    return tradeDateComparison || createdAtComparison || left.id.localeCompare(right.id);
  });
}
