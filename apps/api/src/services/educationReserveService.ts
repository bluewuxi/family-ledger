import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { calculateEducationTotals, EDUCATION_ENTRY_TYPES, EDUCATION_CATEGORIES, type EducationEntryInput, type EducationEntryType, type EducationCategory, type AuthenticatedUser } from "@family-ledger/shared";
import * as repo from "../repositories/educationReserveRepository";
import { amount, currency, dateValue, invalid, pagination, record, textValue, uuid } from "./spendingValidation";

export function parseEducationEntry(body: unknown): EducationEntryInput {
  const row = record(body);
  if (!EDUCATION_ENTRY_TYPES.includes(row.entryType as EducationEntryType)) invalid("请选择教育记录类型。");
  const entryType = row.entryType as EducationEntryType;
  const expense = ["expense", "refund"].includes(entryType), exchange = entryType === "exchange";
  if (expense && !EDUCATION_CATEGORIES.includes(row.expenseCategory as EducationCategory)) invalid("请选择教育支出分类。");
  if (!expense && row.expenseCategory) invalid("此记录不能设置教育支出分类。");
  if (!exchange && (row.targetCurrency || row.targetAmount)) invalid("只有换汇记录可以设置目标币种和金额。");
  if (entryType !== "refund" && row.relatedExpenseId) invalid("只有退款可以关联教育支出。");
  const sourceCurrency = currency(row.currency);
  const positive = (input: unknown) => { const value = amount(input); if (!new Decimal(value).gt(0)) invalid("金额必须大于零。"); return value; };
  const targetCurrency = exchange ? currency(row.targetCurrency) : null;
  if (targetCurrency === sourceCurrency) invalid("兑换币种必须不同。");
  return { entryDate: dateValue(row.entryDate), entryType, currency: sourceCurrency, amount: positive(row.amount),
    expenseCategory: expense ? row.expenseCategory as EducationCategory : null,
    relatedExpenseId: row.relatedExpenseId ? uuid(row.relatedExpenseId) : null,
    targetCurrency, targetAmount: exchange ? positive(row.targetAmount) : null,
    notes: textValue(row.notes, "备注", 4000, true) };
}
export function parseCashflowFilters(query: Record<string, string | undefined>) {
  const domain = query.domain ?? "all";
  if (!["all", "education", "daily_expense"].includes(domain)) invalid("资金用途无效。");
  const from = query.from ? dateValue(query.from) : undefined, to = query.to ? dateValue(query.to) : undefined;
  if (from && to && from > to) invalid("开始日期不能晚于结束日期。");
  if (query.category && !EDUCATION_CATEGORIES.includes(query.category as EducationCategory)) invalid("教育分类无效。");
  return { ...pagination(query), domain, ...(from ? { from } : {}), ...(to ? { to } : {}),
    ...(query.currency ? { currency: currency(query.currency) } : {}), ...(query.category ? { category: query.category } : {}) };
}
export async function getEducationReserve(query: Record<string, string | undefined>) {
  const filters = parseCashflowFilters({ ...query, domain: "education" });
  const { fund, entries } = await repo.readEducationReserve();
  const selected = entries.filter(row => (!filters.from || row.entryDate >= filters.from) && (!filters.to || row.entryDate <= filters.to)
    && (!filters.currency || row.currency === filters.currency || row.targetCurrency === filters.currency)
    && (!filters.category || row.expenseCategory === filters.category));
  return { fund, totals: calculateEducationTotals(entries), periodTotals: calculateEducationTotals(selected), expenses: entries.filter(e => e.entryType === "expense"),
    entries: selected.slice(filters.offset, filters.offset + filters.limit),
    pagination: { limit: filters.limit, offset: filters.offset, total: selected.length, hasMore: filters.offset + filters.limit < selected.length } };
}
export async function saveEducationEntry(body: unknown, user: AuthenticatedUser, id?: string) {
  const row = record(body), entry = parseEducationEntry(body);
  const version = id ? parseVersion(row.version) : null;
  return repo.mutateEducationEntry({ operation: id ? "update" : "create", id: id ? uuid(id) : randomUUID(), actorId: user.id, version, entry });
}
export function parseVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalid("请刷新记录后重试。");
  return value;
}
export async function deleteEducationEntry(id: string, body: unknown, user: AuthenticatedUser) {
  return repo.mutateEducationEntry({ operation: "delete", id: uuid(id), actorId: user.id, version: parseVersion(record(body).version), entry: null });
}
export async function getCashflowReport(query: Record<string, string | undefined>) { return repo.queryCashflows(parseCashflowFilters(query)); }
