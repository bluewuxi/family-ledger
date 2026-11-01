import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cachedRead, clearReadCache } from "./src/lib/readCache";
import { observeAccountScope, resetAccountScope } from "./src/lib/accountScopeState";
import { canSaveAccountScope } from "./src/lib/accountScopeState";
import { reloadAccountScope } from "./src/lib/accountScopeState";
const invalidationEvents: string[] = [];
await assert.rejects(reloadAccountScope({
  clearCache: () => { invalidationEvents.push("clear"); },
  remount: () => { invalidationEvents.push("remount"); },
  refreshSession: async () => { invalidationEvents.push("refresh"); throw new Error("Session service unavailable"); }
}), /Session service unavailable/);
assert.deepEqual(invalidationEvents, ["clear", "remount", "refresh"]);
invalidationEvents.length = 0;
await reloadAccountScope({
  clearCache: () => { invalidationEvents.push("clear"); },
  remount: () => { invalidationEvents.push("remount"); },
  refreshSession: async () => { invalidationEvents.push("refresh"); }
});
assert.deepEqual(invalidationEvents, ["clear", "remount", "refresh", "remount"]);
// Cross-origin clients must be able to observe the revision transport header.
assert.match(readFileSync(new URL("../../scripts/local-api.ts", import.meta.url), "utf8"), /"access-control-expose-headers": "x-account-scope"/);
assert.match(readFileSync(new URL("../../infra/aws/template.yaml", import.meta.url), "utf8"), /ExposeHeaders:\s*\n\s*- x-account-scope/);
assert.equal(canSaveAccountScope({ userId: "a", revision: 1, scope: { mode: "all" } }, "b"), false);
assert.equal(canSaveAccountScope(undefined, "b"), false);
assert.equal(canSaveAccountScope({ userId: "b", revision: 1, scope: { mode: "all" } }, "b"), true);
resetAccountScope();
assert.equal(observeAccountScope("a:1"), "initial");
assert.equal(observeAccountScope("a:1"), "same");
assert.equal(observeAccountScope("a:3"), "changed");
assert.equal(observeAccountScope("a:2"), "stale");
assert.equal(observeAccountScope("b:1"), "changed");
let finish!: (value: string) => void;
const oldResponse = cachedRead("private", () => new Promise<string>(resolve => { finish = resolve; }), 60_000);
clearReadCache();
finish("revoked data");
await assert.rejects(oldResponse, /数据已更新/);
assert.equal(await cachedRead("private", async () => "current data", 60_000), "current data");
console.log("Scope revision ordering and identity fixtures passed.");
