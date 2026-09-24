export const SPENDING_TYPES = [
  "purchase",
  "refund",
  "repayment",
  "cashback",
  "fee",
  "interest",
  "cash_advance",
  "adjustment",
] as const;
export type SpendingType = (typeof SPENDING_TYPES)[number];
export const SPENDING_TYPE_LABELS: Record<SpendingType, string> = {
  purchase: "消费",
  refund: "退款",
  repayment: "还款",
  cashback: "返现",
  fee: "手续费",
  interest: "利息",
  cash_advance: "取现",
  adjustment: "调整",
};
export const SPENDING_CURRENCIES = [
  "CNY",
  "NZD",
  "USD",
  "JPY",
  "HKD",
  "GBP",
  "EUR",
  "AUD",
] as const;
export interface SpendingAccount {
  id: string;
  name: string;
  institution: string;
  default_currency: string;
  is_active: boolean;
}
export interface AccountStatement {
  id: string;
  account_id: string;
  month: string;
  statement_date: string;
  period_start: string;
  period_end: string;
  currency: string;
  status: "entering" | "complete";
  notes: string | null;
  source_file_key: string | null;
  source_file_version: string | null;
  source_file_name: string | null;
  source_file_size: number | null;
  file_sha256: string | null;
  account_name: string;
  row_count: number;
}
export interface StatementRow {
  id: string;
  statement_id: string;
  row_number: number;
  suffix_number: string | null;
  transaction_date: string;
  posting_date: string;
  description: string;
  transaction_type: SpendingType;
  is_spending: boolean;
  original_currency: string;
  original_amount: string;
  settlement_amount: string;
  tag: string | null;
  notes: string | null;
  currency: string;
  account_id: string;
  account_name: string;
  statement_month: string;
}
export interface SpendingAggregate {
  currency: string;
  included_positive: string;
  included_negative: string;
  net_spending: string;
  excluded_amount: string;
  spending_count: number;
  count: number;
}
export interface SpendingBreakdown extends SpendingAggregate {
  label: string | null;
}
export interface SpendingQueryResult {
  rows: StatementRow[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  totals: SpendingAggregate[];
  monthly: SpendingBreakdown[];
  tags: SpendingBreakdown[];
  entering_count: number;
}
export interface SpendingFilterOptions {
  tags: string[];
  suffixes: string[];
}
export interface StatementListResult {
  statements: AccountStatement[];
  pagination: SpendingQueryResult["pagination"];
}
export interface SpendingQuery {
  month?: string;
  from?: string;
  to?: string;
  statementMonth?: string;
  statementId?: string;
  accountId?: string;
  suffixNumber?: string;
  tag?: string;
  untagged?: string;
  transactionType?: string;
  isSpending?: string;
  currency?: string;
  q?: string;
  limit?: string;
  offset?: string;
}

/** UI default only; the API validates money before applying the same rule. */
export function defaultSpendingInclusion(amount: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(amount) && /[1-9]/.test(amount);
}
