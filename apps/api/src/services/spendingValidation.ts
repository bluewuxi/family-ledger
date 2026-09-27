import Decimal from "decimal.js";
import {
  SPENDING_CURRENCIES,
  SPENDING_CLASSES,
  SPENDING_FORMATS,
  type SpendingClass,
  type SpendingFormat,
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
  const d = new Date(`${value}T00:00:00Z`);
  if (
    Number(value.slice(0, 4)) < 1 ||
    !Number.isFinite(d.valueOf()) ||
    d.toISOString().slice(0, 10) !== value
  )
    invalid("日期不存在。");
  return value;
}
export function currency(value: unknown): string {
  if (
    !SPENDING_CURRENCIES.includes(value as (typeof SPENDING_CURRENCIES)[number])
  )
    invalid("不支持的币种。");
  return value as string;
}
export function amount(value: unknown): string {
  if (typeof value !== "string" || !/^-?\d{1,14}(\.\d{1,6})?$/.test(value))
    invalid("金额须为十进制字符串，最多 14 位整数和 6 位小数。");
  return new Decimal(value).toFixed();
}
export function classification(value: unknown): SpendingClass {
  if (!SPENDING_CLASSES.includes(value as SpendingClass))
    invalid("统计归类无效。");
  return value as SpendingClass;
}
export function normalizeRow(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const a = amount(input.amount),
    c = classification(input.classification ?? "review");
  if (
    (c === "spending" && !new Decimal(a).lt(0)) ||
    (["income", "refund"].includes(c) && !new Decimal(a).gt(0))
  )
    invalid("消费须为负数，收入和退款须为正数。");
  return {
    account_id: uuid(input.account_id),
    transaction_date: dateValue(input.transaction_date),
    description: textValue(input.description, "交易描述", 1000),
    amount: a,
    classification: c,
    tag: textValue(input.tag, "标签", 80, true),
    notes: textValue(input.notes, "备注", 4000, true),
  };
}
export function normalizeAccount(
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (!SPENDING_FORMATS.includes(input.source_format as SpendingFormat))
    invalid("请选择支持的银行格式。");
  if (input.is_active !== undefined && typeof input.is_active !== "boolean")
    invalid("账户状态无效。");
  const suffix = textValue(input.identity_suffix, "账号后四位", 4, true);
  if (suffix && !/^\d{4}$/.test(suffix)) invalid("账号后四位须为四个数字。");
  return {
    name: textValue(input.name, "账户名称", 120),
    source_format: input.source_format,
    default_currency: currency(input.default_currency),
    identity_suffix: suffix,
    is_active: input.is_active ?? true,
  };
}
export function pagination(input: Record<string, string | undefined>) {
  const parse = (s: string | undefined, d: number, max: number) => {
    if (!s) return d;
    if (!/^\d+$/.test(s) || !Number.isSafeInteger(Number(s)) || Number(s) > max)
      invalid("分页参数无效。");
    return Number(s);
  };
  const limit = parse(input.limit, 50, 200),
    offset = parse(input.offset, 0, 2147483000);
  if (!limit) invalid("每页至少一条。");
  return { limit, offset };
}
export function normalizeQuery(
  input: Record<string, string | undefined>,
): Record<string, string | number> {
  const out: Record<string, string | number> = { ...pagination(input) };
  if (input.month && (input.from || input.to))
    invalid("月份与日期范围不能同时使用。");
  if (input.month) {
    const first = dateValue(`${input.month}-01`),
      d = new Date(`${first}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1, 0);
    out.from = first;
    out.to = d.toISOString().slice(0, 10);
  } else {
    if (input.from) out.from = dateValue(input.from);
    if (input.to) out.to = dateValue(input.to);
    if (out.from && out.to && out.from > out.to)
      invalid("开始日期不能晚于结束日期。");
  }
  for (const k of ["accountId", "statementId"])
    if (input[k]) out[k] = uuid(input[k]);
  if (input.classification)
    out.classification = classification(input.classification);
  if (input.currency) out.currency = currency(input.currency);
  if (input.tag && input.untagged === "true")
    invalid("标签与未分类筛选不能同时使用。");
  if (input.tag) out.tag = textValue(input.tag, "标签", 80)!;
  if (input.untagged) {
    if (!["true", "false"].includes(input.untagged))
      invalid("未分类筛选无效。");
    out.untagged = input.untagged;
  }
  if (input.q?.trim()) out.q = textValue(input.q, "关键词", 200)!;
  return out;
}
