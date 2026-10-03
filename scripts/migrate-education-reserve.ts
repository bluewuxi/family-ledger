import assert from "node:assert/strict";
import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { testDatabaseSql } from "./education-reserve-test-db";
import { prepareLedgerRestoreRows, stableStringify, type LedgerBackupPayload } from "../apps/jobs/src/services/ledgerBackupBundle";

dotenv.config({ path: ".env.test", quiet: true });
async function main() {
  const backupPath = process.argv[process.argv.indexOf("--backup") + 1];
  if (!process.argv.includes("--backup") || !backupPath) throw new Error("A verified pre-migration backup is required (--backup). Add --apply to apply the reviewed migration.");
  const payload = JSON.parse(gunzipSync(readFileSync(backupPath)).toString("utf8")) as LedgerBackupPayload;
  assert.equal(payload.manifest.environment, "test");
  const restored = prepareLedgerRestoreRows(payload);
  const accounts = restored.investment_accounts as Record<string, unknown>[];
  const education = accounts.filter(a => a.purpose === "education");
  assert.equal(education.length, 1, "Expected exactly one legacy education account.");
  const transactions = restored.transactions as Record<string, unknown>[];
  const old = transactions.filter(t => t.account_id === education[0].id);
  assert.equal(old.length, 7, "Expected the reviewed seven education records.");
  assert.equal(restored.statement_rows.length, 0); assert.equal(restored.account_statements.length, 0);
  const mappingPath = process.argv[process.argv.indexOf("--mapping") + 1];
  if (!process.argv.includes("--mapping") || !mappingPath) throw new Error("Provide a reviewed, private --mapping JSON file with id, type and category for all seven legacy records.");
  const mapping = JSON.parse(readFileSync(mappingPath, "utf8")) as { id: string; type: string; category: string | null }[];
  assert(Array.isArray(mapping)); assert.equal(mapping.length, old.length); assert.equal(new Set(mapping.map(m => m.id)).size, old.length);
  old.forEach(t => {
    assert.equal(t.currency, "CNY"); assert.equal(t.transaction_source, "manual");
    assert.equal(Number(t.fee), 0); assert.equal(Number(t.tax), 0); assert.equal(t.linked_transaction_id, null);
    assert(["deposit", "withdrawal"].includes(String(t.transaction_type)));
    const mapped = mapping.find(m => m.id === t.id); assert(mapped, "Every legacy row requires a reviewed mapping.");
    if (t.transaction_type === "deposit") { assert.equal(mapped.type, "contribution"); assert.equal(mapped.category, null); }
    else { assert(["expense", "withdrawal"].includes(mapped.type)); assert.equal(mapped.category, mapped.type === "expense" ? "tuition" : null); }
  });
  assert.equal(mapping.filter(m => m.type === "expense").length, 1);
  const sql = await testDatabaseSql();
  const current = JSON.parse(sql("select export_ledger_backup()")) as Record<string, unknown[]>;
  if ((current.education_reserve_funds as Record<string, unknown>[] | undefined)?.some(f => f.cutover_at)) {
    const existing = current.education_reserve_entries as Record<string, unknown>[];
    assert(old.every(t => existing.some(e => e.legacy_transaction_id === t.id)), "Active fund is missing migration provenance.");
    console.log("Education cutover already applied; no duplicate records were created."); return;
  }
  const hash = (rows: unknown[]) => createHash("sha256").update(stableStringify(rows)).digest("hex");
  // Compare raw backup data, not restore-normalized rows. Ignore operational job log changes.
  for (const table of ["investment_accounts", "transactions", "instruments", "portfolio_snapshot_headers", "portfolio_account_snapshots", "spending_accounts", "statement_rows", "account_statements"] as const) {
    assert.equal(hash(current[table]), hash(payload.tables[table]), `Data changed since backup: ${table}; take another backup and review.`);
  }
  const literal = (value: unknown) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  const protectedTables = ["investment_accounts", "transactions", "instruments", "portfolio_snapshot_headers", "portfolio_account_snapshots", "spending_accounts", "statement_rows", "account_statements"];
  const migration = `begin;
    lock table investment_accounts,transactions in share row exclusive mode;
    do $$ declare fid uuid; aid uuid; total numeric; legacy_total numeric; expected_spending numeric; begin
      ${protectedTables.map(table => `if export_ledger_backup()->'${table}'<>${literal(current[table])} then raise exception 'Data changed since review: ${table}'; end if;`).join("\n")}
      select id into strict aid from investment_accounts where purpose='education';
      select id into strict fid from education_reserve_funds where singleton_key='education' and cutover_at is null for update;
      if (select count(*) from transactions where account_id=aid)<>7 or exists(select 1 from education_reserve_entries) then raise exception 'Unexpected migration state'; end if;
      select sum(case when transaction_type='deposit' then gross_amount else -gross_amount end) into legacy_total from transactions where account_id=aid;
      select sum(t.gross_amount) into expected_spending from transactions t join jsonb_to_recordset(${literal(mapping)}) as m(id uuid,type text,category text) on m.id=t.id where m.type='expense';
      insert into education_reserve_entries(fund_id,entry_date,entry_type,currency,amount,expense_category,notes,legacy_transaction_id,created_at,updated_at,created_by_user_id,updated_by_user_id)
      select fid,t.trade_date,m.type,t.currency,t.gross_amount,m.category,t.notes,t.id,t.created_at,t.updated_at,t.created_by_user_id,t.updated_by_user_id
      from transactions t join jsonb_to_recordset(${literal(mapping)}) as m(id uuid,type text,category text) on m.id=t.id where t.account_id=aid;
      if (select count(*) from education_reserve_entries)<>7 then raise exception 'Missing migrated rows'; end if;
      select sum(case when entry_type='contribution' then amount else -amount end) into total from education_reserve_entries;
      if total<>legacy_total or (select sum(amount) from education_reserve_entries where entry_type='expense')<>expected_spending then raise exception 'Balance/spending mismatch'; end if;
      update education_reserve_funds set legacy_account_id=aid,cutover_at=now() where id=fid;
    end $$;
    commit;`;
  writeFileSync("tmp/education-reserve/reviewed-cutover.sql", migration, "utf8");
  console.log("Reviewed: one fund, seven CNY records, one tuition expense, five reserve withdrawals. Native balances and tuition totals reconcile using exact database numeric values.");
  if (!process.argv.includes("--apply")) { console.log("Dry run only; reviewed SQL saved under ignored tmp/education-reserve. No data changed."); return; }
  sql(migration);
  const after = JSON.parse(sql("select export_ledger_backup()")) as Record<string, unknown[]>;
  for (const table of ["investment_accounts", "transactions", "instruments", "portfolio_snapshot_headers", "portfolio_account_snapshots", "spending_accounts", "statement_rows", "account_statements"] as const) assert.equal(hash(after[table]), hash(current[table]), `Protected data changed: ${table}`);
  assert.equal(after.education_reserve_entries.length, 7);
  console.log("Education cutover completed; protected account, investment, daily and snapshot rows are unchanged.");
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Education migration failed."); process.exitCode = 1; });
