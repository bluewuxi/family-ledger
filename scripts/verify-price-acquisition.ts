import assert from "node:assert/strict";
import { runPriceBatch, retryDecision, providerHttpError, retryAfterSeconds } from "../packages/shared/src/priceAcquisition";

async function main() {
  let active = 0, maximum = 0;
  const results = await runPriceBatch(["a", "b", "a", "c"], {
    key: value => value,
    concurrency: 2,
    acquire: async value => {
      active++; maximum = Math.max(maximum, active);
      await Promise.resolve(); active--;
      if (value === "b") throw new Error("private upstream diagnostics");
      return value.toUpperCase();
    }
  });
  assert.equal(results.length, 3);
  assert.equal(maximum, 2);
  assert.deepEqual(results.map(item => item.status), ["success", "failed", "success"]);
  assert.equal(JSON.stringify(results).includes("private upstream"), false);
  assert.deepEqual(retryDecision({ attempts: 7, dailyAttempts: 7, now: 0, transient: true, historical: true }), { status: "needs_attention", nextAttemptAt: null });
  assert.equal(retryDecision({ attempts: 1, now: 0, transient: true, historical: true }).nextAttemptAt, 300_000);
  assert.equal(retryDecision({ attempts: 4, dailyAttempts: 1, phase: "daily", now: 0, transient: true, historical: true }).nextAttemptAt, 86_400_000);
  assert.equal(retryDecision({ attempts: 1, now: 0, transient: true, retryAfterMs: 7_200_000 }).nextAttemptAt, 7_200_000);
  assert.throws(() => runPriceBatch([], { key: String, concurrency: 0, acquire: async x => x }));
  assert.equal(retryAfterSeconds("7200"), 7200);
  assert.equal(retryAfterSeconds("Wed, 04 Nov 2026 01:00:00 GMT", Date.parse("2026-11-04T00:00:00Z")), 3600);
  assert.equal(retryAfterSeconds("invalid"), undefined);
  const limited = await runPriceBatch(["limited"], { key: String, concurrency: 1, acquire: async () => { throw providerHttpError({ status: 429, headers: { get: () => "7200" } }); } });
  assert.equal(limited[0].status === "failed" && limited[0].retryAfterSeconds, 7200);
  console.log("Price acquisition fixtures passed.");
}
void main();
