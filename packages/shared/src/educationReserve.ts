import Decimal from "decimal.js";

export const EDUCATION_ENTRY_TYPES = ["opening_balance", "contribution", "expense", "refund", "withdrawal", "exchange"] as const;
export type EducationEntryType = typeof EDUCATION_ENTRY_TYPES[number];
export const EDUCATION_ENTRY_LABELS: Record<EducationEntryType, string> = {
  opening_balance: "期初储备", contribution: "储备投入", expense: "教育支出", refund: "教育退款", withdrawal: "储备转出", exchange: "币种兑换"
};
export const EDUCATION_CATEGORIES = ["tuition", "accommodation", "living_allowance", "other"] as const;
export type EducationCategory = typeof EDUCATION_CATEGORIES[number];
export const EDUCATION_CATEGORY_LABELS: Record<EducationCategory, string> = {
  tuition: "学费", accommodation: "住宿费", living_allowance: "生活费", other: "其他"
};
export interface EducationEntryInput {
  entryDate: string;
  entryType: EducationEntryType;
  currency: string;
  amount: string;
  expenseCategory: EducationCategory | null;
  relatedExpenseId: string | null;
  targetCurrency: string | null;
  targetAmount: string | null;
  notes: string | null;
}
export interface EducationEntry extends EducationEntryInput {
  id: string;
  fundId: string;
  version: number;
  legacyTransactionId: string | null;
}
export interface EducationFund { id: string; name: string; legacyAccountId: string | null; cutoverAt: string | null }
export interface EducationCurrencyTotal {
  currency: string; balance: string; grossExpenses: string; refunds: string; netSpending: string;
}
export function calculateEducationTotals(entries: EducationEntryInput[]): EducationCurrencyTotal[] {
  const totals = new Map<string, { balance: Decimal; grossExpenses: Decimal; refunds: Decimal }>();
  function bucket(currency: string) {
    let value = totals.get(currency);
    if (!value) { value = { balance: new Decimal(0), grossExpenses: new Decimal(0), refunds: new Decimal(0) }; totals.set(currency, value); }
    return value;
  }
  for (const entry of entries) {
    const value = bucket(entry.currency), amount = new Decimal(entry.amount);
    const outgoing = ["expense", "withdrawal", "exchange"].includes(entry.entryType);
    value.balance = outgoing ? value.balance.minus(amount) : value.balance.plus(amount);
    if (entry.entryType === "expense") value.grossExpenses = value.grossExpenses.plus(amount);
    if (entry.entryType === "refund") value.refunds = value.refunds.plus(amount);
    if (entry.entryType === "exchange" && entry.targetCurrency && entry.targetAmount) {
      const target = bucket(entry.targetCurrency); target.balance = target.balance.plus(entry.targetAmount);
    }
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => ({
    currency, balance: value.balance.toFixed(6), grossExpenses: value.grossExpenses.toFixed(6),
    refunds: value.refunds.toFixed(6), netSpending: value.grossExpenses.minus(value.refunds).toFixed(6)
  }));
}
export interface CashflowRecord {
  domain: "daily_expense" | "education";
  sourceId: string; date: string; kind: string; category: string | null; currency: string; amount: string; notes: string | null;
}
export interface CashflowReport {
  rows: CashflowRecord[];
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
  totals: { domain: CashflowRecord["domain"]; currency: string; income: string; expenses: string; refunds: string; netSpending: string; count: number }[];
}
