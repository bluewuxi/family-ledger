import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { normalizeDecimalString, addDecimalStrings, compareDecimalStrings } from "../apps/web/src/lib/transactionDecimal";
import { validateTransactionBalances } from "../apps/web/src/lib/transactionBalances";

async function main(): Promise<void> {
assert.equal(normalizeDecimalString(12.5), "12.5");
assert.equal(normalizeDecimalString(null), null);
assert.equal(normalizeDecimalString(" 12.500 "), "12.500");
assert.equal(normalizeDecimalString(Number.NaN), null);
// Runtime numbers from legacy responses must not crash buy/sell balance checks.
assert.equal(addDecimalStrings("100", 12.5 as unknown as string, 6), "112.5");
assert.equal(compareDecimalStrings("2", 3 as unknown as string, 10), -1);

// Exercise the real Supabase query builder without credentials or database writes.
const directory = await mkdtemp(join(tmpdir(), "ledger-transactions-"));
const requests: URL[] = [];
const row = {
  id: "parent", account_id: "account", instrument_id: "instrument",
  transaction_type: "buy", trade_date: "2026-10-01", settlement_date: null,
  quantity: 2, price: "123.1234567890", gross_amount: 246.25,
  fee: 0, tax: 0, settlement_amount: 246.25,
  transaction_source: "manual", linked_transaction_id: null,
  currency: "USD", settlement_currency: "USD",
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  requests.push(url);
  const linked = url.searchParams.has("linked_transaction_id");
  if (url.searchParams.get("transaction_type") === "eq.sell") return new Response("[]", { headers: { "Content-Type": "application/json", "Content-Range": "*/0" } });
  return new Response(JSON.stringify([linked ? {
    ...row, id: "cash", quantity: null, price: null, gross_amount: "246.25",
    transaction_source: "generated_cash_leg", linked_transaction_id: "parent",
  } : row]), { headers: { "Content-Type": "application/json", "Content-Range": "0-0/251" } });
};

try {
  const result = await build({
    stdin: { contents: 'export { getTransactions, getTransactionBalances, assertSingleOpeningBalance } from "./apps/api/src/services/transactionService";', resolveDir: process.cwd() },
    bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{ name: "test-database", setup(builder) {
      builder.onLoad({ filter: /[/\\]db[/\\]supabaseServer\.ts$/ }, () => ({
        contents: 'import { createClient } from "@supabase/supabase-js"; export async function getSupabaseAdmin() { return createClient("https://example.supabase.co", "test-public-key", { auth: { persistSession: false, autoRefreshToken: false } }); }',
        loader: "ts", resolveDir: join(process.cwd(), "apps/api/src/db"),
      }));
    } }],
  });
  const file = join(directory, "verification.cjs");
  await writeFile(file, result.outputFiles[0]!.text);
  const { getTransactions, getTransactionBalances, assertSingleOpeningBalance } = createRequire(join(process.cwd(), "package.json"))(file);
  for (const sortBy of ["tradeDate", "settlementDate", "instrument", "transactionType"]) {
    for (const sortDirection of ["asc", "desc"]) {
      requests.length = 0;
      const page = await getTransactions({ sortBy, sortDirection, limit: "50", offset: "200",
        excludeGeneratedCashLegs: "true", includeLinkedCashLegs: "true",
        from: "2026-09-01", to: "2026-10-02", transactionType: "buy" });
      assert.equal(page.pagination.total, 251);
      assert.equal(page.pagination.hasMore, true);
      assert.equal(page.items[0].quantity, "2");
      assert.equal(page.items[0].price, "123.1234567890");
      assert.equal(page.items[0].fee, "0");
      assert.equal(page.items[0].settlementAmount, "246.25");
      assert.equal(page.linkedCashLegs[0].price, null);
      assert.equal(page.linkedCashLegs[0].linkedTransactionId, "parent");
      const query = requests[0]!.searchParams;
      const column = { tradeDate: "trade_date", settlementDate: "settlement_date", instrument: "instruments(short_name)", transactionType: "transaction_type" }[sortBy];
      assert.ok(query.get("order")!.startsWith(`${column}.${sortDirection}.nullslast`));
      assert.ok(query.get("order")!.endsWith("created_at.desc,id.desc"));
      assert.equal(query.get("offset"), "200");
      assert.equal(query.get("limit"), "50");
      assert.equal(query.get("account_id"), null);
      assert.equal(query.get("transaction_source"), "neq.generated_cash_leg");
      assert.equal(query.get("transaction_type"), "eq.buy");
      assert.equal(query.getAll("trade_date").length, 2);
      assert.equal(requests[1]!.searchParams.get("linked_transaction_id"), "in.(parent)");
    }
  }
  requests.length = 0;
  await getTransactions({ limit: "20", accountId: "00000000-0000-4000-8000-000000000001", instrumentId: "00000000-0000-4000-8000-000000000002" });
  assert.equal(requests.length, 1);
  assert.ok(requests[0]!.searchParams.has("account_id"));
  assert.ok(requests[0]!.searchParams.has("instrument_id"));
  requests.length = 0;
  const empty = await getTransactions({ limit: "50", transactionType: "sell", includeLinkedCashLegs: "true" });
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.linkedCashLegs, []);
  assert.equal(empty.pagination.total, 0);
  assert.equal(empty.pagination.hasMore, false);
  assert.equal(requests.length, 1);
  const finalPage = await getTransactions({ limit: "50", offset: "250" });
  assert.equal(finalPage.pagination.hasMore, false);
  for (const query of [{ sortBy: "price" }, { sortDirection: "sideways" }, { includeLinkedCashLegs: "maybe" }]) {
    await assert.rejects(() => getTransactions(query), { code: "VALIDATION_ERROR" });
  }
  // Transaction forms must include daily-expense bank balances, without changing investment scope.
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const data = url.pathname.endsWith("investment_accounts")
      ? ["investment", "daily_expense", "education", "empty"].map(purpose => ({ id: purpose, name: purpose, purpose: purpose === "empty" ? "daily_expense" : purpose, base_currency: "NZD", account_type: "bank", market_region: "NZ" }))
      : url.pathname.endsWith("instruments")
        ? [{ id: "cash", symbol: "CASH_NZD", name: "NZD Cash", short_name: "NZD cash", asset_type: "cash", currency: "NZD" }]
        : ["investment", "daily_expense"].flatMap(account_id => [
          { ...row, account_id, instrument_id: "cash", transaction_type: "opening_balance", quantity: null, gross_amount: "80000", currency: "NZD" },
          { ...row, account_id, instrument_id: "cash", transaction_type: "withdrawal", quantity: null, gross_amount: "79906", currency: "NZD" },
          { ...row, account_id, instrument_id: "cash", transaction_type: "deposit", quantity: null, gross_amount: "80000", currency: "NZD" }
        ]);
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  };
  requests.length = 0;
  const balances = await getTransactionBalances();
  assert.equal(balances.holdings.find((h: { accountId: string }) => h.accountId === "daily_expense")?.quantity, "80094");
  assert.equal(balances.cashBalances.find((h: { accountId: string }) => h.accountId === "daily_expense")?.quantity, "80094");
  assert.equal(balances.cashBalances.find((h: { accountId: string }) => h.accountId === "empty")?.quantity, "0");
  validateTransactionBalances(balances);
  assert.throws(() => validateTransactionBalances({ ...balances, cashBalances: undefined }));
  assert.throws(() => validateTransactionBalances({ ...balances, cashBalances: [...balances.cashBalances, balances.cashBalances[0]] }));
  assert.throws(() => validateTransactionBalances({ ...balances, cashBalances: [{ ...balances.cashBalances[0], quantity: undefined }] }));
  assert.equal(balances.holdings.some((h: { accountId: string }) => h.accountId === "education"), false);
  const balanceQuery = requests.find(url => url.pathname.endsWith("transactions"))!.searchParams;
  assert.equal(balanceQuery.get("investment_accounts.purpose"), "neq.education");
  assert.ok(balanceQuery.get("trade_date")?.startsWith("lte."));
  const opening = { accountId: "daily_expense", transactionType: "opening_balance" };
  const existing = { ...opening, id: "existing" };
  assert.throws(() => assertSingleOpeningBalance(opening, [existing]), { code: "VALIDATION_ERROR" });
  assert.throws(() => assertSingleOpeningBalance(opening, [{ ...existing, instrumentId: "other-cash" }]), { code: "VALIDATION_ERROR" });
  assert.doesNotThrow(() => assertSingleOpeningBalance(opening, [existing], "existing"));
  assert.doesNotThrow(() => assertSingleOpeningBalance({ ...opening, accountId: "other" }, [existing]));
  assert.doesNotThrow(() => assertSingleOpeningBalance({ ...opening, transactionType: "deposit" }, [existing]));
  const balanceFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => new URL(String(input)).pathname.endsWith("instruments")
    ? new Response("[]", { headers: { "Content-Type": "application/json" } }) : balanceFetch(input, init);
  await assert.rejects(() => getTransactionBalances(), { code: "INTERNAL_ERROR" });
  console.log("Transaction table and cross-purpose balance verification: success");
} finally {
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
}

}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
