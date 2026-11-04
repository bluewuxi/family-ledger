import assert from "node:assert/strict";
import { SSMClient } from "@aws-sdk/client-ssm";
import { withAccountAccessRequest, setRequestAccountAccess } from "../apps/api/src/auth/accountAccessContext";
import { getMonthlySummary } from "../apps/api/src/services/monthlySummaryService";

// Entirely local transport fixtures: no SQL, AWS or shared TEST mutations.
async function main() {
  process.env.SUPABASE_URL = "https://monthly.fixture.invalid";
  process.env.AWS_REGION = "ap-southeast-2";
  process.env.SUPABASE_SECRET_KEY_SSM_PARAM = "/fixture/key";
  const originalFetch = globalThis.fetch;
  const originalSend = SSMClient.prototype.send;
  SSMClient.prototype.send = (async () => ({ Parameter: { Value: "fixture-key" } })) as typeof SSMClient.prototype.send;
  let expected: string | null = null;
  let carried = false;
  const scoped = (url: URL, column: string) => {
    assert.equal(url.searchParams.get(column), expected, `Missing scope on ${url.pathname}`);
    return expected === "in.()" ? [] : expected === null ? ["A", "B"] : ["A"];
  };
  globalThis.fetch = async input => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    let rows: unknown[];
    if (url.pathname.endsWith("/portfolio_snapshot_headers")) {
      const ids = scoped(url, "portfolio_account_snapshots.account_id");
      const start = url.searchParams.getAll("snapshot_date").includes("lte.2026-05-31");
      assert.equal(url.searchParams.get("is_available"), "eq.true");
      rows = ids.length ? [{ id: start ? "start" : "end", snapshot_date: start ? (carried ? "2026-05-29" : "2026-05-31") : (carried ? "2026-06-28" : "2026-06-30"), usd_to_nzd_rate: "1.6", usd_to_cny_rate: "7" }] : [];
    } else if (url.pathname.endsWith("/portfolio_account_snapshots")) {
      const ids = scoped(url, "account_id");
      const start = url.searchParams.get("portfolio_snapshot_id") === "in.(start)";
      rows = ids.map(id => ({ id, account_id: id, account_name: id, portfolio_snapshot_id: start ? "start" : "end",
        snapshot_date: start ? "2026-05-31" : "2026-06-30", market_value_usd: id === "B" ? null : start ? "100" : "150",
        cost_usd: "100", unrealized_gain_usd: "0", daily_change_usd: "0", daily_change_pct: "0",
        warnings: id === "B" ? [{ code: "MISSING_PRICE", accountId: "B", message: "Hidden B" }] : [] }));
    } else if (url.pathname.endsWith("/transactions")) {
      rows = scoped(url, "account_id").flatMap(id => ["deposit", "buy", "dividend", "adjustment"].map((type) => ({
        id: `${id}-${type}`, account_id: id, instrument_id: `${id}-security`, transaction_type: type, transaction_source: "manual",
        trade_date: "2026-06-15", created_at: "2026-06-15T00:00:00Z", gross_amount: "10", fee: "0", tax: "0", currency: "USD", quantity: "1", price: "10",
        adjustment_direction: "increase", linked_transaction_id: null, instruments: { short_name: `${id}-security`, asset_type: "stock" }
      })));
    } else throw new Error(`Unexpected fixture request: ${url.pathname}`);
    return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json" } });
  };
  try {
    for (const mode of ["selected", "empty", "all", "carried"] as const) {
      carried = mode === "carried";
      expected = mode === "all" ? null : mode === "empty" ? "in.()" : "in.(A)";
      await withAccountAccessRequest(async () => {
        setRequestAccountAccess({ userId: "fixture", revision: 1, scope: mode === "all" ? { mode: "all" } : { mode: "selected", resources: mode === "empty" ? [] : [{ kind: "ledger", id: "A" }] } });
        const summary = await getMonthlySummary({ month: "2026-06", currency: "USD" });
        if (mode === "carried") {
          assert.equal(summary.startValue, "100.00");
          assert.equal(summary.endValue, "150.00");
          assert.equal(summary.startSnapshotDate, "2026-05-29");
          assert.equal(summary.endSnapshotDate, "2026-06-28");
          assert.equal(summary.requestedStartSnapshotDate, "2026-05-31");
          assert.equal(summary.requestedEndSnapshotDate, "2026-06-30");
          assert.equal(summary.fullPeriodAvailable, false);
          assert.equal(summary.assetChange, null);
          assert.equal(summary.valuationMovement, null);
          assert.equal(summary.netPrincipalFlow, "10.000000");
          assert.ok(summary.accountChanges.every(row => row.valuationMovement === null && row.valuationContributionPct === null));
          assert.equal(JSON.stringify(summary).includes("Hidden B"), false);
        } else if (mode === "selected") {
          assert.equal(summary.startValue, "100.00");
          assert.equal(summary.endValue, "150.00");
          assert.equal(summary.assetChange, "50.000000");
          assert.equal(summary.netPrincipalFlow, "10.000000");
          assert.equal(summary.valuationMovement, "30.000000");
          assert.deepEqual(summary.accountChanges.map(row => row.accountId), ["A"]);
          for (const rows of [summary.principalTransactions, summary.dividendTransactions]) assert.ok(rows.every(row => row.accountId === "A"));
          assert.equal(summary.tradeActivity.length, 1);
          assert.equal(summary.tradeActivity[0].transaction.accountId, "A");
          assert.equal(summary.cashAdjustments.length, 1);
          assert.ok(!JSON.stringify(summary).includes("Hidden B"));
        } else if (mode === "empty") {
          assert.equal(summary.accountChanges.length, 0);
          assert.equal(summary.principalTransactions.length, 0);
          assert.equal(summary.tradeActivity.length, 0);
        } else {
          assert.equal(summary.accountChanges.length, 2);
          assert.equal(summary.tradeActivity.length, 2);
          assert.equal(summary.endValue, null, "Visible broken B must invalidate the full total");
        }
      });
    }
  } finally { globalThis.fetch = originalFetch; SSMClient.prototype.send = originalSend; }
  console.log("Monthly summary repository/service authorization fixtures passed (selected, empty, all).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
