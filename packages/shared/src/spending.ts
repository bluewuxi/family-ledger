export const SPENDING_FORMATS = ["ccb_debit", "ccb_credit", "bnz"] as const;
export type SpendingFormat = (typeof SPENDING_FORMATS)[number];
export const SPENDING_FORMAT_LABELS: Record<SpendingFormat, string> = {
  ccb_debit: "建行借记卡",
  ccb_credit: "建行信用卡",
  bnz: "BNZ 账户",
};
export const SPENDING_CLASSES = [
  "income",
  "spending",
  "refund",
  "excluded",
  "review",
] as const;
export type SpendingClass = (typeof SPENDING_CLASSES)[number];
export const SPENDING_CLASS_LABELS: Record<SpendingClass, string> = {
  income: "收入",
  spending: "消费",
  refund: "退款",
  excluded: "转账/不计入",
  review: "待确认",
};
export const SPENDING_ENCODINGS = [
  "utf-8",
  "gb18030",
  "utf-16le",
  "utf-16be",
] as const;
export type SpendingEncoding = (typeof SPENDING_ENCODINGS)[number];
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
  source_format: SpendingFormat;
  default_currency: string;
  identity_suffix: string | null;
  is_active: boolean;
}
export interface ParsedSpendingRow {
  row_number: number;
  transaction_date: string;
  description: string;
  amount: string;
  classification: SpendingClass;
  tag: string | null;
  notes: string | null;
  source_metadata: Record<string, string | string[]>;
  fingerprint: string;
}
export interface SpendingPreviewRow extends ParsedSpendingRow {
  duplicate_count: number;
}
export interface SpendingPreview {
  encoding: SpendingEncoding;
  parser_version: string;
  rows: SpendingPreviewRow[];
  errors: { row_number: number; message: string }[];
  warnings: string[];
}
/** An import/document batch, retaining the existing table identity. */
export interface AccountStatement {
  id: string;
  account_id: string;
  account_name: string;
  status: "draft" | "preview" | "committed" | "undone" | "document";
  created_at: string;
  expires_at: string;
  encoding: SpendingEncoding | null;
  parser_version: string | null;
  csv_file_key: string | null;
  csv_file_version: string | null;
  csv_file_name: string | null;
  csv_sha256: string | null;
  source_file_key: string | null;
  source_file_version: string | null;
  source_file_name: string | null;
  source_file_size: number | null;
  file_sha256: string | null;
  row_count: number;
  edited_count: number;
  imported_count: number;
  skipped_count: number;
  rejected_count: number;
  date_from: string | null;
  date_to: string | null;
  preview: SpendingPreview | null;
  preview_token: string | null;
}
export interface StatementRow
  extends Omit<ParsedSpendingRow, "row_number" | "fingerprint"> {
  row_number: number | null;
  fingerprint: string | null;
  id: string;
  statement_id: string | null;
  account_id: string;
  account_name: string;
  currency: string;
  updated_at: string;
}
export interface SpendingAggregate {
  currency: string;
  income: string;
  gross_spending: string;
  refunds: string;
  net_spending: string;
  count: number;
  pending_count: number;
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
}
export interface SpendingFilterOptions {
  tags: string[];
}
export interface StatementListResult {
  statements: AccountStatement[];
  pagination: SpendingQueryResult["pagination"];
}
export interface SpendingImportDecision {
  row_number: number;
  skip: boolean;
  classification: SpendingClass;
  tag: string | null;
  allow_duplicate: boolean;
}
