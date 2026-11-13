import type { CashflowRecord, EducationCategory, EducationEntryType, SpendingFormat } from "@family-ledger/shared";

const spendingFormatKeys = {
  ccb_debit: "formats.ccbDebit",
  ccb_credit: "formats.ccbCredit",
  bnz: "formats.bnz",
} as const satisfies Record<SpendingFormat, string>;

export function spendingFormatKey(format: SpendingFormat) {
  return spendingFormatKeys[format];
}

export const educationEntryKeys = {
  opening_balance: "entryTypes.openingBalance",
  contribution: "entryTypes.contribution",
  expense: "entryTypes.expense",
  refund: "entryTypes.refund",
  withdrawal: "entryTypes.withdrawal",
  exchange: "entryTypes.exchange",
} as const satisfies Record<EducationEntryType, string>;

export const educationCategoryKeys = {
  tuition: "categories.tuition",
  accommodation: "categories.accommodation",
  living_allowance: "categories.livingAllowance",
  other: "categories.other",
} as const satisfies Record<EducationCategory, string>;

export const cashflowScopeKeys = {
  all: "scopes.all",
  daily_expense: "scopes.dailyExpense",
  education: "scopes.education",
} as const satisfies Record<CashflowRecord["domain"] | "all", string>;
