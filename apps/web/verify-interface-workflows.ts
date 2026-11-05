import assert from "node:assert/strict";
import type { AccountStatement } from "@family-ledger/shared";
import { commitStatementWithRecovery, isDefinitiveStatementRejection } from "./src/lib/statementCommit";
const attempt = { id: "statement-1", token: "original-token", decisions: [{ row_number: 7, classification: "spending" as const, tag: null, skip: false, allow_duplicate: true }] };
const committed = { id: attempt.id, status: "committed" } as AccountStatement;
const uncertain = new Error("Response lost");
let calls = 0;
const result = await commitStatementWithRecovery(attempt, async (id, token, decisions) => {
  calls++; assert.equal(id, attempt.id); assert.equal(token, "original-token"); assert.deepEqual(decisions, attempt.decisions); throw uncertain;
}, async id => { assert.equal(id, attempt.id); return committed; });
assert.equal(result, committed);
assert.equal(calls, 1, "Recovery reads must never replay a write automatically");
await assert.rejects(commitStatementWithRecovery(attempt, async () => { throw uncertain; }, async () => ({ id: attempt.id, status: "preview" } as AccountStatement)), error => error === uncertain);
await assert.rejects(commitStatementWithRecovery(attempt, async () => { throw uncertain; }, async () => { throw new Error("Read unavailable"); }), error => error === uncertain);
assert.equal(await commitStatementWithRecovery(attempt, async () => committed, async () => { throw new Error("Unexpected read"); }), committed);

assert.equal(isDefinitiveStatementRejection({ status: 400 }), true);
assert.equal(isDefinitiveStatementRejection({ status: 403 }), true);
assert.equal(isDefinitiveStatementRejection({ status: 408 }), false);
assert.equal(isDefinitiveStatementRejection({ status: 429 }), false);
assert.equal(isDefinitiveStatementRejection({ status: 503 }), false);
assert.equal(isDefinitiveStatementRejection(new Error("Response lost")), false);

console.log("Interface workflow recovery fixtures passed.");
