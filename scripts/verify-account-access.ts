import assert from "node:assert/strict";
import { parseAccountScope, canAccessAccount } from "../packages/shared/src/accountAccess";

const id = "11111111-1111-4111-8111-111111111111";
const ledger = { kind: "ledger" as const, id };
const spending = { kind: "spending" as const, id };
const empty = parseAccountScope({ mode: "selected", resources: [] });
assert.equal(canAccessAccount(empty, ledger), false);
const selected = parseAccountScope({ mode: "selected", resources: [ledger, ledger] });
assert.deepEqual(selected, { mode: "selected", resources: [ledger] });
assert.equal(canAccessAccount(selected, ledger), true);
assert.equal(canAccessAccount(selected, spending), false);
assert.equal(canAccessAccount(parseAccountScope({ mode: "all" }), spending), true);
for (const input of [null, {}, { mode: "unknown" }, { mode: "selected" },
  { mode: "selected", resources: [{ kind: "other", id }] },
  { mode: "selected", resources: [{ kind: "ledger", id: "bad" }] },
  { mode: "all", resources: [ledger] }]) {
  assert.throws(() => parseAccountScope(input));
}
console.log("Account scope contract fixtures passed.");
