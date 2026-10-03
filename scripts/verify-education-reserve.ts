import assert from "node:assert/strict";
import { calculateEducationTotals, type EducationEntryInput } from "@family-ledger/shared";
import { parseEducationEntry, parseCashflowFilters } from "../apps/api/src/services/educationReserveService";
import { educationReserveRoute } from "../apps/api/src/routes/educationReserveRoutes";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

async function main() {
  const row = (entryType: EducationEntryInput["entryType"], amount: string, extra: Partial<EducationEntryInput> = {}): EducationEntryInput => ({ entryDate: "2026-10-04", entryType, currency: "CNY", amount,
    expenseCategory: ["expense", "refund"].includes(entryType) ? "tuition" : null, relatedExpenseId: null, targetCurrency: null, targetAmount: null, notes: null, ...extra });
  const entries = [row("opening_balance", "100000"), row("expense", "20000"), row("refund", "1000"), row("contribution", "0.000001"), row("withdrawal", "0.000001")];
  assert.deepEqual(calculateEducationTotals(entries), [{ currency: "CNY", balance: "81000.000000", grossExpenses: "20000.000000", refunds: "1000.000000", netSpending: "19000.000000" }]);
  const exchanged = calculateEducationTotals([...entries, row("exchange", "1000", { targetCurrency: "HKD", targetAmount: "1095.123456" })]);
  assert.equal(exchanged[0].balance, "80000.000000"); assert.equal(exchanged[0].netSpending, "19000.000000"); assert.equal(exchanged[1].balance, "1095.123456");
  assert.equal(calculateEducationTotals([row("expense", "1")])[0].balance, "-1.000000");
  assert.equal(parseEducationEntry(row("expense", "0.000001")).amount, "0.000001");
  for (const invalid of [row("expense", "0"), row("expense", "-1"), row("expense", "1e4"), row("expense", "1.0000001"), row("expense", "2", { entryDate: "2026-02-30" }), row("exchange", "1", { targetCurrency: "CNY", targetAmount: "1" }), row("contribution", "1", { expenseCategory: "tuition" })]) assert.throws(() => parseEducationEntry(invalid));
  assert.throws(() => parseCashflowFilters({ domain: "investment" })); assert.throws(() => parseCashflowFilters({ from: "2026-10-04", to: "2026-01-01" }));
  const event = { rawPath: "/education-reserve/entries", requestContext: { http: { method: "POST" } }, body: "{}" } as APIGatewayProxyEventV2;
  await assert.rejects(() => educationReserveRoute(event, async (_event, role) => { assert.equal(role, "admin"); throw new Error("Denied viewer"); }), /Denied viewer/);
  const read = { ...event, rawPath: "/education-reserve/not-found", requestContext: { http: { method: "GET" } } } as APIGatewayProxyEventV2;
  const response = await educationReserveRoute(read, async (_event, role) => { assert.equal(role, "viewer"); return { id: "user", role: "viewer", email: "" }; });
  assert.equal(response.statusCode, 404);
  console.log("Education reserve exact calculations, validation, filters and API authorization passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
