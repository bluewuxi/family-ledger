import assert from "node:assert/strict";
import { ApiRequestError } from "../apps/api/src/utils/apiError";
import { parseCreateAccountInput } from "../apps/api/src/services/accountService";
import { parseCreateInstrumentInput, parseUpdateInstrumentInput } from "../apps/api/src/services/instrumentService";
import { parseMonthlyReportMonth } from "../apps/api/src/services/monthlyReportMonth";
import { INVESTMENT_ERROR_FIELDS, INVESTMENT_SIMPLE_ERROR_REASONS, parseInvestmentErrorDetails, type InvestmentErrorDetails } from "@family-ledger/shared";
import { assertInstrumentActivity, calculateSettlementCashAmount } from "../apps/api/src/services/transactionService";
import { transactionCreateIntent } from "../apps/api/src/services/transactionIdempotency";
import { failure } from "../apps/api/src/utils/response";
import { serializeLogError } from "../apps/api/src/utils/errorLogging";

function expectDetails(run: () => unknown, message: string, details: unknown): void {
  assert.throws(run, (error: unknown) => {
    assert(error instanceof ApiRequestError);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.equal(error.statusCode, 400);
    assert.equal(error.message, message);
    assert.deepEqual((error as ApiRequestError & { details?: unknown }).details, details);
    return true;
  });
}
expectDetails(() => parseCreateAccountInput({}), "name is required.", { reason: "FIELD_REQUIRED", field: "name" });
expectDetails(() => parseUpdateInstrumentInput({ shortName: "x".repeat(33) }), "shortName must be 32 characters or fewer.", { reason: "FIELD_TOO_LONG", field: "shortName", limit: 32 });
expectDetails(() => parseMonthlyReportMonth("invalid"), "month must use YYYY-MM format.", { reason: "INVALID_REPORT_MONTH" });
expectDetails(() => parseMonthlyReportMonth("2026-13"), "month must be a valid calendar month.", { reason: "INVALID_REPORT_MONTH" });
expectDetails(() => parseMonthlyReportMonth("2027-01", "2026-11"), "不能查看未来月份的月度回顾。", { reason: "FUTURE_REPORT_MONTH" });
expectDetails(() => parseCreateInstrumentInput({ name: "Fixture", symbol: "X", exchange: null, assetType: "stock", marketRegion: "US", currency: "USD", priceSource: "manual", priceUpdateEnabled: false, priceUpdatePriority: 0 }), "symbol and exchange must be supplied together.", { reason: "INSTRUMENT_IDENTITY_REQUIRED" });
expectDetails(() => assertInstrumentActivity({ id: "fixture", active: false }), "投资标的已停用，请选择启用的标的。", { reason: "INACTIVE_INSTRUMENT" });
expectDetails(() => transactionCreateIntent("invalid", {}), "请刷新页面后重试，交易请求缺少有效的操作编号。", { reason: "INVALID_OPERATION_ID" });
expectDetails(() => calculateSettlementCashAmount({ transactionType: "dividend", grossAmount: "1", tax: "2" } as never), "Dividend tax cannot exceed grossAmount.", { reason: "DIVIDEND_TAX_EXCEEDS_GROSS" });

const details: InvestmentErrorDetails[] = [
  ...INVESTMENT_SIMPLE_ERROR_REASONS.map(reason => ({ reason })),
  ...INVESTMENT_ERROR_FIELDS.flatMap(field => [
    { reason: "FIELD_REQUIRED" as const, field }, { reason: "FIELD_INVALID" as const, field },
    { reason: "DECIMAL_INVALID" as const, field }, { reason: "POSITIVE_AMOUNT_REQUIRED" as const, field },
    { reason: "FIELD_TOO_LONG" as const, field, limit: 32 }, { reason: "DECIMAL_PRECISION" as const, field, scale: 6 }
  ]),
  { reason: "MISSING_CASH_INSTRUMENT", currency: "USD" }, { reason: "MISSING_CASH_INSTRUMENT" },
  { reason: "INACTIVE_CASH_INSTRUMENT", currency: "NZD" }, { reason: "CURRENCY_MISMATCH", currency: "CNY" },
  { reason: "INSUFFICIENT_CASH", date: "2026-11-08" }, { reason: "INSUFFICIENT_POSITION", date: "2026-11-08" },
  { reason: "MISSING_SETTLEMENT_FX", date: "2026-11-08", fromCurrency: "USD", toCurrency: "NZD" }
];
for (const detail of details) {
  assert.deepEqual(parseInvestmentErrorDetails(JSON.parse(JSON.stringify(detail))), detail);
  const error = new ApiRequestError("VALIDATION_ERROR", "Legacy message", 400, detail);
  assert.equal(error.message, "Legacy message");
  assert.deepEqual(error.details, detail);
  const response = failure({ code: error.code, message: error.message, details: error.details }, error.statusCode);
  const body = JSON.parse(response.body!);
  assert.deepEqual({ code: body.error.code, message: body.error.message }, { code: "VALIDATION_ERROR", message: "Legacy message" });
  assert.deepEqual(parseInvestmentErrorDetails(body.error.details), detail);
  assert.equal(serializeLogError(error).details, undefined, "Structured metadata must not start logging request facts");
  assert.equal(parseInvestmentErrorDetails({ ...detail, secret: "synthetic-secret-marker" }), undefined);
}
for (const invalid of [null, [], "secret-marker", { reason: "UNKNOWN" }, { reason: "FIELD_INVALID", field: "secret-marker" },
  { reason: "FIELD_TOO_LONG", field: "name", limit: -1 }, { reason: "DECIMAL_PRECISION", field: "price", scale: 1.5 },
  { reason: "INSUFFICIENT_CASH", date: "2026-02-30" }, { reason: "INSUFFICIENT_POSITION", date: "not-a-date" },
  { reason: "MISSING_CASH_INSTRUMENT", currency: "secret-marker" }, { reason: "MISSING_SETTLEMENT_FX", date: "2026-11-08", fromCurrency: "USD" }]) {
  assert.equal(parseInvestmentErrorDetails(invalid), undefined);
  assert.equal(new ApiRequestError("INTERNAL_ERROR", "Legacy message", 500, invalid as InvestmentErrorDetails).details, undefined);
}
assert.equal(new ApiRequestError("NOT_FOUND", "Legacy message", 404).details, undefined);
assert.deepEqual(JSON.parse(failure({ code: "NOT_FOUND", message: "Legacy message" }, 404).body!), { success: false, error: { code: "NOT_FOUND", message: "Legacy message" } });
console.log("Investment error metadata preserves legacy failures; all catalog variants reject unknown or secret-bearing facts.");
