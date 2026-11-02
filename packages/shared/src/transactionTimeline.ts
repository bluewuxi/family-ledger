import Decimal from "decimal.js";
import type { Instrument, InvestmentAccount, InvestmentTransaction } from "./index";

export interface TransactionTimelineViolation {
  accountId: string;
  instrumentId: string;
  transactionId: string;
  tradeDate: string;
  reason: "INSUFFICIENT_CASH" | "INSUFFICIENT_POSITION";
  availableAmount: string;
  requestedAmount: string;
  deficit: string;
}

/** Compare instants, retaining PostgreSQL sub-millisecond precision and ID ties. */
export function compareTransactionOrder(left: InvestmentTransaction, right: InvestmentTransaction): number {
  return left.tradeDate.localeCompare(right.tradeDate)
    || normalizedInstant(left.createdAt).localeCompare(normalizedInstant(right.createdAt))
    || left.id.localeCompare(right.id);
}

function normalizedInstant(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error("Transaction creation timestamp is invalid.");
  const fraction = /[T ]\d{2}:\d{2}:\d{2}(?:\.(\d+))?/.exec(value)?.[1] ?? "";
  return `${instant.toISOString().slice(0, 19)}.${fraction.padEnd(9, "0")}`;
}

/** Return newly introduced or worsened trade deficits, preserving corrective legacy edits. */
export function validateTransactionTimeline(input: {
  before: InvestmentTransaction[];
  after: InvestmentTransaction[];
  accounts: InvestmentAccount[];
  instruments: Instrument[];
}): TransactionTimelineViolation[] {
  const baseline = new Map(replay(input.before, input.instruments).map(item => [violationKey(item), new Decimal(item.deficit)]));
  return replay(input.after, input.instruments).filter(item => new Decimal(item.deficit).gt(baseline.get(violationKey(item)) ?? 0));
}

function violationKey(item: TransactionTimelineViolation): string {
  return `${item.transactionId}:${item.accountId}:${item.instrumentId}:${item.reason}`;
}

function replay(rows: InvestmentTransaction[], instruments: Instrument[]): TransactionTimelineViolation[] {
  const byId = new Map(instruments.map(item => [item.id, item]));
  const cashByCurrency = new Map(instruments.filter(item => item.assetType === "cash").map(item => [item.currency, item.id]));
  const parentIds = new Set(rows.filter(item => item.transactionSource !== "generated_cash_leg"
    && ["buy", "sell", "dividend"].includes(item.transactionType)
    && item.settlementCurrency && item.settlementAmount !== null).map(item => item.id));
  const balances = new Map<string, Decimal>();
  const violations: TransactionTimelineViolation[] = [];
  const balance = (accountId: string, instrumentId: string) => balances.get(`${accountId}:${instrumentId}`) ?? new Decimal(0);
  const change = (accountId: string, instrumentId: string, amount: Decimal) => balances.set(`${accountId}:${instrumentId}`, balance(accountId, instrumentId).plus(amount));
  const check = (row: InvestmentTransaction, instrumentId: string, requested: Decimal, reason: TransactionTimelineViolation["reason"]) => {
    const available = balance(row.accountId, instrumentId);
    if (requested.gt(available)) violations.push({ accountId: row.accountId, instrumentId, transactionId: row.id,
      tradeDate: row.tradeDate, reason, availableAmount: available.toString(), requestedAmount: requested.toString(),
      deficit: requested.minus(available).toString() });
  };
  const sorted = [...rows].sort(compareTransactionOrder);
  for (const row of sorted) {
    // Linked settlement is applied at the parent, irrespective of the cash row's creation time.
    if (row.transactionSource === "generated_cash_leg" && row.linkedTransactionId && parentIds.has(row.linkedTransactionId)) continue;
    const instrument = byId.get(row.instrumentId);
    if (!instrument) throw new Error("Transaction timeline reference data is incomplete.");
    const gross = new Decimal(row.grossAmount ?? "0");
    if (instrument.assetType === "cash") {
      const amount = row.transactionType === "fee" ? new Decimal(row.fee)
        : row.transactionType === "tax" ? new Decimal(row.tax) : gross;
      const subtract = ["withdrawal", "fee", "tax"].includes(row.transactionType)
        || (row.transactionType === "adjustment" && row.adjustmentDirection === "decrease");
      change(row.accountId, row.instrumentId, subtract ? amount.negated() : amount);
      continue;
    }
    const quantity = new Decimal(row.quantity ?? "0");
    if (row.transactionType === "sell") check(row, row.instrumentId, quantity, "INSUFFICIENT_POSITION");
    if (row.transactionType === "buy" || row.transactionType === "opening_position") change(row.accountId, row.instrumentId, quantity);
    if (row.transactionType === "sell") change(row.accountId, row.instrumentId, quantity.negated());
    if (["buy", "sell", "dividend"].includes(row.transactionType) && row.settlementCurrency && row.settlementAmount !== null) {
      const cashId = cashByCurrency.get(row.settlementCurrency);
      if (!cashId) throw new Error("Transaction timeline settlement cash instrument is missing.");
      const amount = new Decimal(row.settlementAmount);
      if (row.transactionType === "buy") check(row, cashId, amount, "INSUFFICIENT_CASH");
      change(row.accountId, cashId, row.transactionType === "buy" ? amount.negated() : amount);
    }
  }
  return violations;
}
