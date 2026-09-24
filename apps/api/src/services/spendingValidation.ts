import Decimal from "decimal.js";
import {
  SPENDING_CURRENCIES,
  SPENDING_TYPES,
  type SpendingType,
} from "@family-ledger/shared";
import { ApiRequestError } from "../utils/apiError";

export function invalid(message: string): never {
  throw new ApiRequestError("VALIDATION_ERROR", message, 400);
}
export function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("请求内容必须是对象。");
  return input as Record<string, unknown>;
}
export function textValue(
  value: unknown,
  label: string,
  max = 200,
  optional = false,
): string | null {
  if (optional && (value === undefined || value === null || value === ""))
    return null;
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (!optional && !value.trim())
  )
    invalid(`${label}格式不正确。`);
  return value.trim() || null;
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    invalid("记录编号格式不正确。");
  return value;
}
export function dateValue(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    invalid("日期格式必须为 YYYY-MM-DD。");
  const date = new Date(`${value}T00:00:00Z`);
  if (
    Number(value.slice(0, 4)) < 1 ||
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  )
    invalid("日期不存在。");
  return value;
}
export function monthValue(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value))
    invalid("月份格式必须为 YYYY-MM。");
  return dateValue(`${value}-01`);
}
export function currency(value: unknown): string {
  if (
    !SPENDING_CURRENCIES.includes(value as (typeof SPENDING_CURRENCIES)[number])
  )
    invalid("不支持的消费币种。");
  return value as string;
}
export function amount(value: unknown, optional = false): string | null {
  if (optional && (value === undefined || value === null || value === ""))
    return null;
  if (typeof value !== "string" || !/^-?\d{1,14}(\.\d{1,6})?$/.test(value))
    invalid("金额须为十进制字符串，最多 14 位整数和 6 位小数。");
  return new Decimal(value).toFixed();
}
export function normalizeRow(
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (input.is_spending !== undefined && typeof input.is_spending !== "boolean")
    invalid("计入消费必须为 true 或 false。");
  const settlement = amount(input.settlement_amount)!;
  const original = amount(input.original_amount)!;
  const type =
    input.transaction_type ||
    (new Decimal(settlement).gt(0) ? "purchase" : null);
  if (!SPENDING_TYPES.includes(type as SpendingType))
    invalid("零或负金额必须选择交易类型。");
  const positive = ["purchase", "fee", "interest", "cash_advance"].includes(
    String(type),
  );
  const negative = ["refund", "repayment", "cashback"].includes(String(type));
  if (
    (positive &&
      (!new Decimal(settlement).gt(0) || !new Decimal(original).gt(0))) ||
    (negative &&
      (!new Decimal(settlement).lt(0) || !new Decimal(original).lt(0)))
  )
    invalid("金额正负与交易类型不一致。");
  const suffix = textValue(input.suffix_number, "卡号后四位", 4, true);
  if (suffix && !/^\d{4}$/.test(suffix)) invalid("卡号后四位须为四个数字。");
  return {
    suffix_number: suffix,
    transaction_date: dateValue(input.transaction_date),
    posting_date: dateValue(input.posting_date),
    description: textValue(input.description, "交易描述", 1000),
    transaction_type: type,
    is_spending: input.is_spending ?? new Decimal(settlement).gt(0),
    original_currency: currency(input.original_currency),
    original_amount: original,
    settlement_amount: settlement,
    tag: textValue(input.tag, "标签", 80, true),
    notes: textValue(input.notes, "备注", 4000, true),
  };
}
export function normalizeAccount(
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (input.is_active !== undefined && typeof input.is_active !== "boolean")
    invalid("账户状态格式不正确。");
  return {
    name: textValue(input.name, "账户名称", 120),
    institution: textValue(input.institution, "银行", 120, true) ?? "",
    default_currency: currency(input.default_currency),
    is_active: input.is_active ?? true,
  };
}
export function normalizeStatement(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const statementDate = dateValue(input.statement_date),
    start = dateValue(input.period_start),
    end = dateValue(input.period_end);
  if (start > end) invalid("账单开始日期不能晚于结束日期。");
  if (
    input.status !== undefined &&
    !["entering", "complete"].includes(String(input.status))
  )
    invalid("账单状态格式不正确。");
  for (const field of [
    "opening_balance",
    "closing_balance",
    "charges_total",
    "credits_total",
  ]) {
    if (Object.prototype.hasOwnProperty.call(input, field))
      invalid("消费账单不再记录余额或账单总额。");
  }
  return {
    account_id: uuid(input.account_id),
    statement_date: statementDate,
    month: `${statementDate.slice(0, 7)}-01`,
    period_start: start,
    period_end: end,
    currency: currency(input.currency),
    status: input.status ?? "entering",
    notes: textValue(input.notes, "备注", 4000, true),
  };
}
export function pagination(input: Record<string, string | undefined>) {
  const parse = (value: string | undefined, fallback: number, max: number) => {
    if (value === undefined || value === "") return fallback;
    if (
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) > max
    )
      invalid("分页参数无效。");
    return Number(value);
  };
  const limit = parse(input.limit, 50, 200),
    offset = parse(input.offset, 0, 2147483000);
  if (limit < 1) invalid("每页至少一条。");
  return { limit, offset };
}
export function normalizeQuery(
  input: Record<string, string | undefined>,
): Record<string, string | number> {
  const result: Record<string, string | number> = { ...pagination(input) };
  if (input.month && (input.from || input.to))
    invalid("月份与日期范围不能同时使用。");
  if (input.month) {
    const first = monthValue(input.month),
      d = new Date(`${first}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1, 0);
    result.from = first;
    result.to = d.toISOString().slice(0, 10);
  } else {
    if (input.from) result.from = dateValue(input.from);
    if (input.to) result.to = dateValue(input.to);
    if (result.from && result.to && result.from > result.to)
      invalid("开始日期不能晚于结束日期。");
  }
  for (const key of ["accountId", "statementId"])
    if (input[key]) result[key] = uuid(input[key]);
  if (input.statementMonth)
    result.statementMonth = monthValue(input.statementMonth);
  if (input.suffixNumber) {
    if (!/^\d{4}$/.test(input.suffixNumber))
      invalid("卡号后四位须为四个数字。");
    result.suffixNumber = input.suffixNumber;
  }
  if (input.untagged && !["true", "false"].includes(input.untagged))
    invalid("未分类筛选无效。");
  if (input.tag && input.untagged === "true")
    invalid("标签与未分类筛选不能同时使用。");
  if (input.tag) result.tag = textValue(input.tag, "标签", 80)!;
  if (input.untagged) result.untagged = input.untagged;
  if (input.transactionType) {
    if (!SPENDING_TYPES.includes(input.transactionType as SpendingType))
      invalid("交易类型无效。");
    result.transactionType = input.transactionType;
  }
  if (input.isSpending !== undefined) {
    if (!["true", "false"].includes(input.isSpending))
      invalid("计入消费筛选必须为 true 或 false。");
    result.isSpending = input.isSpending;
  }
  if (input.currency) result.currency = currency(input.currency);
  if (input.q?.trim()) result.q = textValue(input.q, "描述关键词", 200)!;
  return result;
}
