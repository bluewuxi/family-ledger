import assert from "node:assert/strict";
import { withAccountAccessRequest, setRequestAccountAccess, requestAccountIds, requestScopeKey } from "../apps/api/src/auth/accountAccessContext";
import type { AccountAccessPolicy } from "@family-ledger/shared";
const policy: AccountAccessPolicy = { userId: "a", revision: 2, scope: { mode: "selected", resources: [{ kind: "ledger", id: "a" }] } };
async function main() {
  assert.equal(requestAccountIds("ledger"), null);
  await withAccountAccessRequest(async () => {
    assert.throws(() => requestAccountIds("ledger"));
    setRequestAccountAccess(policy);
    assert.deepEqual(requestAccountIds("ledger"), ["a"]);
    assert.deepEqual(requestAccountIds("spending"), []);
    assert.match(requestScopeKey(), /a/);
  });
  await Promise.all([policy, { ...policy, userId: "b", scope: { mode: "all" as const } }].map(p => withAccountAccessRequest(async () => {
    setRequestAccountAccess(p); await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(requestAccountIds("ledger") === null, p.scope.mode === "all");
  })));
  console.log("Request scope isolation and fail-closed context fixtures passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
