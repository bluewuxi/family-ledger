import assert from "node:assert/strict";
import { createResilientFetch } from "../apps/api/src/db/resilientFetch";
import { cachedRead, clearReadCache, setReadCacheIdentity } from "../apps/web/src/lib/readCache";
import { parseQuoteMode } from "../apps/api/src/services/quoteMode";
import { readHistoryCache, invalidateHistoryCache } from "../apps/api/src/services/historyCache";

async function main() {
  let calls = 0;
  const future = () => new Response(JSON.stringify({ code: "PGRST303", message: "JWT issued at future" }), { status: 401 });
  const retry = createResilientFetch(async () => ++calls < 3 ? future() : new Response("{}"));
  assert.equal((await retry("https://fixture.invalid/rest/v1/user_roles")).status, 200);
  assert.equal(calls, 3);
  for (const method of ["POST", "PATCH", "DELETE"]) {
    calls = 0;
    const write = createResilientFetch(async () => { calls++; return future(); });
    assert.equal((await write("https://fixture.invalid", { method })).status, 401);
    assert.equal(calls, 1);
  }
  calls = 0;
  const wrongToken = createResilientFetch(async () => { calls++; return new Response(JSON.stringify({ code: "PGRST303", message: "JWT expired" }), { status: 401 }); });
  assert.equal((await wrongToken("https://fixture.invalid")).status, 401); assert.equal(calls, 1);
  calls = 0;
  const unavailable = createResilientFetch(async () => { calls++; return future(); });
  const exhausted = await unavailable("https://fixture.invalid");
  assert.equal(calls, 4); assert.equal(exhausted.status, 503); assert.equal((await exhausted.json()).code, "DEPENDENCY_UNAVAILABLE");
  const controller = new AbortController(); calls = 0;
  const cancel = createResilientFetch(async () => { calls++; controller.abort(); return future(); });
  await assert.rejects(cancel("https://fixture.invalid", { signal: controller.signal })); assert.equal(calls, 1);

  setReadCacheIdentity("first-user"); calls = 0;
  const read = async () => ++calls;
  assert.deepEqual(await Promise.all([cachedRead("instruments", read, 60_000), cachedRead("instruments", read, 60_000)]), [1, 1]);
  assert.equal(await cachedRead("instruments", read, 60_000), 1);
  assert.equal(await cachedRead("instruments", read, 60_000, true), 2);
  setReadCacheIdentity("second-user"); assert.equal(await cachedRead("instruments", read, 60_000), 3);
  let release!: (value: number) => void;
  const pending = cachedRead("old", () => new Promise<number>(resolve => { release = resolve; }), 60_000);
  clearReadCache(); release(10); await assert.rejects(pending, /数据已更新/);
  invalidateHistoryCache(); calls = 0;
  assert.deepEqual(await Promise.all([readHistoryCache("user:USD", read), readHistoryCache("user:USD", read)]), [1, 1]);
  invalidateHistoryCache(); assert.equal(await readHistoryCache("user:USD", read), 2);
  assert.equal(parseQuoteMode(undefined), "refresh"); assert.equal(parseQuoteMode("cached"), "cached");
  assert.throws(() => parseQuoteMode("other"));
  console.log("Loading performance: bounded read retries, cancellation, deduplication, cache bypass and identity/write invalidation passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
