import assert from "node:assert/strict";
import dotenv from "dotenv";
import { getAppBusinessDate } from "@family-ledger/shared";
import { listAccounts } from "../apps/api/src/repositories/accountRepository";
import { listAccountSnapshotTrendRows, listPortfolioSnapshots } from "../apps/api/src/repositories/portfolioSnapshotRepository";
import { listTransactions } from "../apps/api/src/repositories/transactionRepository";
import { exportLedgerTables } from "../apps/jobs/src/repositories/ledgerBackupRepository";
import { createLedgerBackupObject, prepareLedgerRestoreRows, validateLedgerBackupPayload } from "../apps/jobs/src/services/ledgerBackupBundle";

dotenv.config({ path: ".env.test", quiet: true });
async function main() {
  const accounts = await listAccounts();
  const query = { from: "0001-01-01", to: getAppBusinessDate(), currency: "USD" as const };
  const all = await listPortfolioSnapshots(query);
  for (const purpose of ["investment", "daily_expense", "education"] as const) {
    const ids = new Set(accounts.filter((account) => account.purpose === purpose).map((account) => account.id));
    const snapshots = await listPortfolioSnapshots({ ...query, purpose });
    assert.equal(snapshots.length, all.length);
    for (const snapshot of snapshots) {
      assert.ok(snapshot.accounts.every((account) => ids.has(account.accountId)));
      assert.equal(snapshot.accounts.length, all.find((item) => item.id === snapshot.id)!.accounts.filter((account) => ids.has(account.accountId)).length);
    }
    const transactions = await listTransactions({ purpose });
    assert.ok(transactions.every((transaction) => ids.has(transaction.accountId)));
  }
  for (const account of accounts) {
    const points = await listAccountSnapshotTrendRows({ ...query, accountId: account.id });
    assert.equal(points.length, all.filter((snapshot) => snapshot.accounts.some((item) => item.accountId === account.id)).length);
  }
  const rows = await exportLedgerTables();
  const bundle = createLedgerBackupObject({ environment: "test", generatedAt: new Date().toISOString(), rows });
  validateLedgerBackupPayload(bundle.payload);
  const restored = prepareLedgerRestoreRows(bundle.payload);
  assert.equal(restored.portfolio_snapshot_headers.length, all.length);
  console.log(`Read-only API repository verification passed: ${accounts.length} accounts, ${all.length} dates, backup version ${bundle.payload.manifest.version}.`);
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
