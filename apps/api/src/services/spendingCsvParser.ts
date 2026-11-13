import { logError } from "../utils/errorLogging";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import Decimal from "decimal.js";
import {
  SPENDING_ENCODINGS,
  SPENDING_CURRENCIES,
  accountLast4,
  sanitizeSpendingMetadata,
  type SpendingAccount,
  type SpendingClass,
  type SpendingEncoding,
  type SpendingFormat,
  type SpendingPreview,
  type SpendingPreviewErrorReason,
  type SpendingPreviewWarning,
} from "@family-ledger/shared";
import { amount, dateValue, invalid } from "./spendingValidation";
import { ApiRequestError } from "../utils/apiError";

export const CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_MAX_ROWS = 5000;
export const PARSER_VERSION = "bank-csv-2";
const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;

class RowParseError extends ApiRequestError {
  constructor(message: string, readonly reason: SpendingPreviewErrorReason) {
    super("VALIDATION_ERROR", message, 400);
  }
}

function parseRowValue<T>(parse: () => T, reason: SpendingPreviewErrorReason): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ApiRequestError) throw new RowParseError(error.message, reason);
    throw error;
  }
}

function addWarning(preview: SpendingPreview, message: string, detail?: SpendingPreviewWarning): void {
  if (detail) {
    (preview.warningDetails ??= []).push({ warningIndex: preview.warnings.length, detail });
  }
  preview.warnings.push(message);
}

function legacyPreview(preview: SpendingPreview): SpendingPreview {
  return {
    encoding: preview.encoding,
    parser_version: preview.parser_version,
    rows: preview.rows,
    errors: preview.errors.map(({ row_number, message }) => ({ row_number, message })),
    warnings: preview.warnings,
  };
}

export function boundSpendingPreviewDetails(preview: SpendingPreview): SpendingPreview {
  return Buffer.byteLength(JSON.stringify(preview), "utf8") <= MAX_PREVIEW_BYTES
    ? preview
    : legacyPreview(preview);
}
const headers: Record<SpendingFormat, string[]> = {
  ccb_debit: [
    "记账日",
    "交易日期",
    "交易时间",
    "支出",
    "收入",
    "账户余额",
    "币种",
    "摘要",
    "对方账号",
    "对方户名",
    "交易地点",
  ],
  ccb_credit: [
    "交易日",
    "入账日",
    "信用卡卡号",
    "类型",
    "入账币种",
    "入账金额",
    "交易描述",
  ],
  bnz: [
    "Date",
    "Amount",
    "Payee",
    "Particulars",
    "Code",
    "Reference",
    "Tran Type",
    "This Party Account",
    "Other Party Account",
    "Serial",
    "Transaction Code",
    "Batch Number",
    "Originating Bank/Branch",
    "Processed Date",
  ],
};
export function bankDate(raw: string, format: SpendingFormat): string {
  if (format === "bnz") {
    // Bank format is day/month/year, never locale guessing. This release accepts 2000–2099.
    const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(raw);
    if (!m) throw new RowParseError("BNZ 日期须为 DD/MM/YY（2000–2099）。", "invalidBnzDate");
    return parseRowValue(() => dateValue(`20${m[3]}-${m[2]}-${m[1]}`), "invalidBnzDate");
  }
  if (!/^\d{8}$/.test(raw)) throw new RowParseError("建行日期须为 YYYYMMDD。", "invalidCcbDate");
  return parseRowValue(() => dateValue(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`), "invalidCcbDate");
}
function table(text: string): string[][] {
  return parse(text, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false,
    max_record_size: 32000,
  }) as string[][];
}
function headerIndex(rows: string[][], format: SpendingFormat): number {
  return rows.findIndex(
    (r, i) =>
      i < 100 &&
      r.length === headers[format].length &&
      r.every((v, j) => v.trim() === headers[format][j]),
  );
}
export function decodeBankCsv(
  bytes: Uint8Array,
  format: SpendingFormat,
  override?: SpendingEncoding,
): { encoding: SpendingEncoding; rows: string[][] } {
  if (!bytes.length || bytes.length > CSV_MAX_BYTES)
    invalid("CSV 须为 1 字节至 2 MiB。");
  const bom: SpendingEncoding | undefined =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? "utf-8"
      : bytes[0] === 0xff && bytes[1] === 0xfe
        ? "utf-16le"
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? "utf-16be"
          : undefined;
  if (override && !SPENDING_ENCODINGS.includes(override))
    invalid("字符编码无效。");
  if (override && bom && override !== bom)
    invalid("选择的编码与文件 BOM 不一致。", "STATEMENT_ENCODING_BOM_MISMATCH");
  const candidates: {
    encoding: SpendingEncoding;
    rows: string[][];
    text: string;
  }[] = [];
  for (const encoding of override
    ? [override]
    : bom
      ? [bom]
      : SPENDING_ENCODINGS) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      if ((text.includes(String.fromCharCode(0)) || text.includes("\ufffd"))) continue;
      const rows = table(text);
      if (
        headerIndex(rows, format) >= 0 &&
        !candidates.some((c) => c.text === text)
      )
        candidates.push({ encoding, rows, text });
    } catch (caughtError) {
      logError("spendingCsvParser.decodeBankCsv", caughtError, override || bom ? "WARN" : "INFO");
      /* Strict decoder or CSV syntax failed; never repair corrupt input. */
    }
  }
  if (!candidates.length)
    invalid(
      "无法识别编码或银行格式，请检查账户格式、文件完整性，或手动选择编码。",
    );
  if (candidates.length > 1)
    invalid("文件编码有多种可能，请选择 UTF-8、GB18030 或 UTF-16 后预览确认。", "STATEMENT_ENCODING_AMBIGUOUS");
  return candidates[0];
}
function suggestion(
  format: SpendingFormat,
  type: string,
  description: string,
  value: string,
): SpendingClass {
  const a = new Decimal(value);
  if (format === "ccb_debit" && /一户通|补款转入|信用卡卡号还款|售汇/.test(description)) return "excluded";
  if (format === "ccb_credit" && a.gt(0) && /CCB/i.test(description) && /Rebate/i.test(description)) return "refund";
  if (/还款|理财产品赎回/.test(description)) return "excluded";
  if (a.gt(0) && /退款|退货|refund/i.test(description)) return "refund";
  if (
    a.gt(0) &&
    (/利息存入/.test(description) || /\bIPAYROLL\b/i.test(description))
  )
    return "income";
  if (
    a.lt(0) &&
    ((format === "ccb_credit" && type === "消费") ||
      (format === "bnz" && type === "POS"))
  )
    return "spending";
  return "review";
}
export function parseBankCsv(
  bytes: Uint8Array,
  account: SpendingAccount,
  override?: SpendingEncoding,
): SpendingPreview {
  const { encoding, rows } = decodeBankCsv(
    bytes,
    account.source_format,
    override,
  );
  const result: SpendingPreview = {
    encoding,
    parser_version: PARSER_VERSION,
    rows: [],
    errors: [],
    warnings: [],
  };
  const start = headerIndex(rows, account.source_format),
    format = account.source_format;
  if (format === "bnz") {
    const currency = SPENDING_CURRENCIES.find((code) => code === account.default_currency);
    addWarning(
      result,
      "BNZ 日期按日/月/年解析，两位年份对应 2000–2099；币种使用账户设置，请核对。",
      currency ? { reason: "bnzCurrency", currency } : undefined,
    );
  }
  const debitIdentity = format === "ccb_debit" ? rows.slice(0, start).flat().find((v) => /账.*号/.test(v)) : undefined;
  const debitLast4 = accountLast4(debitIdentity) ?? account.identity_suffix;
  if (format === "ccb_debit" && account.identity_suffix && debitIdentity && accountLast4(debitIdentity) !== account.identity_suffix)
    invalid("文件账号后四位与所选账户不符。");
  for (let i = start + 1; i < rows.length; i++) {
    // Credit exports can contain unquoted commas in the final description column.
    const source = rows[i];
    const raw = account.source_format === "ccb_credit" && source.length > 7
      ? [...source.slice(0, 6), source.slice(6).join(",")]
      : source;
    const r = raw.map((v) => v.trim()),
      row_number = i + 1;
    if (r.every((v) => !v)) continue;
    // CCB credit exports may mark a transaction with leading spaces/asterisks.
    // Normalize only the first field; account columns are redacted after hashing.
    if (format === "ccb_credit") r[0] = r[0].replace(/^[\s*]+/u, "");
    if (result.rows.length + result.errors.length >= CSV_MAX_ROWS)
      invalid("一次最多导入 5000 条交易，请缩小导出日期范围。");
    try {
      if (
        r.length < headers[format].length ||
        (format !== "ccb_debit" && r.length !== headers[format].length)
      )
        throw new RowParseError("列数与银行格式不符。", "wrongColumns");
      const metadata: Record<string, string | string[]> = {};
      headers[format].forEach((h, j) => (metadata[h] = raw[j]));
      if (r.length > headers[format].length) {
        metadata.extra_fields = raw.slice(headers[format].length);
        addWarning(
          result,
          `第 ${row_number} 行附加字段已保留，可在交易详情查看。`,
          { reason: "extraFields", row: row_number },
        );
      }
      const date = bankDate(format === "ccb_debit" ? r[1] : r[0], format);
      metadata.posting_date = bankDate(
        format === "bnz" ? r[13] : format === "ccb_debit" ? r[0] : r[1],
        format,
      );
      let value: string, description: string, type: string;
      if (format === "ccb_debit") {
        const debit = parseRowValue(() => amount(r[3] || "0"), "invalidAmount"),
          credit = parseRowValue(() => amount(r[4] || "0"), "invalidAmount");
        if (
          new Decimal(debit).lt(0) ||
          new Decimal(credit).lt(0) ||
          (new Decimal(debit).gt(0) && new Decimal(credit).gt(0))
        )
          throw new RowParseError("收入/支出列须为非负金额且不能同时有金额。", "invalidDebitCredit");
        value = parseRowValue(() => amount(new Decimal(credit).minus(debit).toFixed()), "invalidAmount");
        description = [r[7], r[10]].filter(Boolean).join(" · ");
        if (r[9].length > 1000) throw new RowParseError("对方户名过长。", "counterpartyTooLong");
        type = r[7];
        if (r[2] && !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(r[2]))
          throw new RowParseError("交易时间无效。", "invalidTime");
      } else if (format === "ccb_credit") {
        value = new Decimal(parseRowValue(() => amount(r[5]), "invalidAmount")).negated().toFixed();
        description = r[6];
        type = r[3];
        metadata.card_number = r[2].replace(/^'/, "");

      } else {
        value = parseRowValue(() => amount(r[1]), "invalidAmount");
        description = [r[2], r[3], r[4], r[5]].filter(Boolean).join(" · ");
        type = r[6];
        if (
          account.identity_suffix &&
          !r[7].replace(/-/g, "").endsWith(account.identity_suffix)
        )
          throw new RowParseError("账号后四位与所选账户不符。", "suffixMismatch");
      }
      if (format !== "bnz") {
        const sourceCurrency = format === "ccb_debit" ? r[6] : r[4];
        const mapped: Record<string, string> = {
          人民币: "CNY",
          美元: "USD",
          港币: "HKD",
          新西兰元: "NZD",
          纽币: "NZD",
        };
        if (
          (mapped[sourceCurrency] ?? sourceCurrency) !==
          account.default_currency
        )
          throw new RowParseError("入账币种与账户币种不符。", "currencyMismatch");
      }
      if (!description || description.length > 1000)
        throw new RowParseError("交易描述为空或过长。", "invalidDescription");
      // A conservative candidate fingerprint: metadata distinctions retain same-day identical purchases.
      const identity =
        format === "ccb_debit"
          ? [r[2], ...r.slice(7)]
          : format === "ccb_credit"
            ? [metadata.card_number, type, description]
            : r.slice(2, 13);
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify([
            format,
            date,
            metadata.posting_date,
            account.default_currency,
            value,
            identity,
          ]),
        )
        .digest("hex");
      result.rows.push({
        account_number_last4: format === "ccb_credit" ? accountLast4(r[2]) : format === "bnz" ? accountLast4(r[7]) : debitLast4,
        counterparty_name: format === "ccb_debit" ? r[9] || null : null,
        counterparty_account_last4: format === "ccb_debit" ? accountLast4(r[8]) : format === "bnz" ? accountLast4(r[8]) : null,
        row_number,
        transaction_date: date,
        description,
        amount: value,
        classification: suggestion(format, type, description, value),
        tag: format === "ccb_debit" ? (/信用卡卡号还款/.test(description) ? "还款" : /售汇/.test(description) ? "购汇" : null) : null,
        notes: null,
        source_metadata: sanitizeSpendingMetadata(metadata),
        fingerprint,
        duplicate_count: 0,
      });
    } catch (e) {
      logError("spendingCsvParser.parseBankCsv", e, "WARN");
      result.errors.push({
        row_number,
        message: e instanceof Error ? e.message : "交易行无效。",
        ...(e instanceof RowParseError ? { detail: { reason: e.reason } } : {}),
      });
    }
  }
  if (!result.rows.length && !result.errors.length) invalid("文件中没有交易。");
  if (Buffer.byteLength(JSON.stringify(legacyPreview(result)), "utf8") > MAX_PREVIEW_BYTES)
    invalid("解析后的预览超过 4 MiB，请缩小导出范围。", "STATEMENT_PREVIEW_TOO_LARGE");
  return boundSpendingPreviewDetails(result);
}
