import assert from "node:assert/strict";
import { recoverHistoricalPrices, type PriceRecoveryRepository } from "../apps/jobs/src/services/priceRecoveryService";
import type { DuePriceGap } from "../apps/jobs/src/repositories/priceAcquisitionRepository";

async function main() {
  const gaps: DuePriceGap[] = ["2026-11-02", "2026-11-03"].map(targetDate => ({ source: "yahoo_finance", instrumentId: "fixture", queryKind: "daily_history", targetDate, sourceSymbol: "TEST", currency: "USD", sourceExchange: "NYSE" }));
  const outcomes: Array<{ status: string; prices?: unknown[] }> = [];
  const repository: PriceRecoveryRepository = {
    listDuePriceGaps: async () => gaps,
    claimPriceAcquisition: async gap => ({ ...gap, targetDate: gap.targetDate!, leaseToken: gap.targetDate!, attempts: 1 }),
    completePriceAcquisition: async outcome => { outcomes.push(outcome); return true; }
  };
  let calls = 0;
  const result = await recoverHistoricalPrices({ throughDate: "2026-11-03", budgetMs: 2000, repository, providers: [{ source: "yahoo_finance", fetchHistory: async input => {
    calls++; assert.equal(input.fromDate, "2026-11-02"); assert.equal(input.toDate, "2026-11-03");
    return [{ instrumentId: "fixture", priceDate: "2026-11-03", closePrice: "100", currency: "USD", provider: "fixture", fetchedAt: input.fetchedAt }];
  }}] });
  assert.equal(calls, 1, "Consecutive due dates share a historical request");
  assert.deepEqual(outcomes.map(o => o.status), ["unavailable", "success"], "Missing Monday does not discard Tuesday");
  assert.equal(result.incomplete, true); assert.equal(result.resolved, 1); assert.equal(result.pending, 1);
  outcomes.length = 0;
  await recoverHistoricalPrices({ throughDate: "2026-11-03", budgetMs: 2000, repository, providers: [] });
  assert.deepEqual(outcomes.map(o => o.status), ["unsupported", "unsupported"]);
  outcomes.length = 0;
  await recoverHistoricalPrices({ throughDate: "2026-11-03", budgetMs: 2000, repository, providers: [{ source: "yahoo_finance", fetchHistory: async () => { throw new Error("Private upstream failure"); } }] });
  assert.deepEqual(outcomes.map(o => o.status), ["failed", "failed"], "Every failed range member retains its own outcome");
  console.log("Historical range coalescing, partial coverage, unsupported history, and durable failed outcomes: passed");
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });

