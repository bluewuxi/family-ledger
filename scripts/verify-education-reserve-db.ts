import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";

async function main() {
  const bin = "C:/Program Files/PostgreSQL/17/bin";
  assert(existsSync(join(bin, "psql.exe")));
  const temporary = mkdtempSync(join(tmpdir(), "education-pg-")), data = join(temporary, "data");
  const server = createServer(); await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const address = server.address(); assert(address && typeof address !== "string"); const port = address.port;
  await new Promise<void>(r => server.close(() => r()));
  const exe = (name: string) => join(bin, `${name}.exe`);
  const args = ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
  const sql = (input: string) => execFileSync(exe("psql"), args, { input, encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trim();
  let started = false;
  try {
    execFileSync(exe("initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"], { windowsHide: true, stdio: "pipe" });
    execFileSync(exe("pg_ctl"), ["-D", data, "-l", join(temporary, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { windowsHide: true, stdio: "ignore" }); started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);
      create function public.has_active_role(text) returns boolean language sql as $$select true$$;
      create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
      create table investment_accounts(id uuid primary key,purpose text); create table transactions(id uuid primary key,account_id uuid);
      create table spending_accounts(id uuid primary key,default_currency text);
      create table statement_rows(id uuid primary key,account_id uuid,transaction_date date,classification text,tag text,amount numeric(20,6),notes text,description text);
      create table kernel_price_anchors(id uuid primary key,kernel_unit_price numeric,proxy_close numeric);
      create table currencies(code text primary key);create table monthly_reviews(month text primary key);`);
    for (const table of ["account_statements", "profiles", "user_roles", "instruments", "exchange_rates", "instrument_prices", "portfolio_snapshot_headers", "portfolio_account_snapshots", "dashboard_instrument_quotes", "job_runs", "data_provider_runs"]) sql(`create table ${table}(id uuid primary key)`);
    sql(readFileSync("supabase/migrations/20261004090000_add_education_reserve.sql", "utf8"));
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    sql(`insert into auth.users values('${id(1)}'); update education_reserve_funds set cutover_at=now();`);
    const entry = (type: string, amount: string, extra: Record<string, unknown> = {}) => ({ entryDate: "2026-10-04", entryType: type, currency: "CNY", amount, expenseCategory: ["expense", "refund"].includes(type) ? "tuition" : null, relatedExpenseId: null, targetCurrency: null, targetAmount: null, notes: null, ...extra });
    const literal = (value: unknown) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
    const mutate = (operation: string, n: number, value: unknown, version: number | null = null) => sql(`select mutate_education_reserve_entry('${operation}','${id(n)}','${id(1)}',${version ?? "null"},${literal(value)})`);
    mutate("create", 2, entry("opening_balance", "100000")); mutate("create", 3, entry("expense", "20000"));
    mutate("create", 4, entry("refund", "1000", { relatedExpenseId: id(3) }));
    assert.throws(() => mutate("create", 5, entry("refund", "20000", { relatedExpenseId: id(3) })));
    assert.throws(() => mutate("create", 5, entry("refund", "1", { relatedExpenseId: id(3), currency: "HKD" })));
    assert.throws(() => mutate("update", 3, entry("expense", "500"), 1));
    assert.throws(() => mutate("delete", 3, null, 1));
    mutate("update", 3, entry("expense", "21000"), 1);
    assert.throws(() => mutate("update", 3, entry("expense", "22000"), 1));
    const execAsync = promisify(execFile);
    const competing = await Promise.allSettled([20, 21].map(n => execAsync(exe("psql"), [...args, "-c", `select mutate_education_reserve_entry('create','${id(n)}','${id(1)}',null,${literal(entry("refund", "11000", { relatedExpenseId: id(3) }))})`], { windowsHide: true })));
    assert.equal(competing.filter(r => r.status === "fulfilled").length, 1, "Only one concurrent refund can fit under the original expense.");
    const winner = competing[0].status === "fulfilled" ? 20 : 21; mutate("delete", winner, null, 1);
    mutate("create", 5, entry("exchange", "1000", { targetCurrency: "HKD", targetAmount: "1095.123456" }));
    const read = JSON.parse(sql("select read_education_reserve()"));
    assert.equal(read.entries.length, 4); assert.equal(read.entries.find((r: { id: string }) => r.id === id(5)).targetAmount, "1095.123456");
    sql(`insert into spending_accounts values('${id(6)}','CNY'); insert into statement_rows values('${id(7)}','${id(6)}','2026-10-04','spending','food',-300,null,'food');`);
    const report = JSON.parse(sql(`select query_family_cashflows('${JSON.stringify({ domain: "all", limit: 2, offset: 0 })}')`));
    assert.equal(report.rows.length, 2); assert.equal(report.pagination.total, 5); assert.equal(report.pagination.hasMore, true);
    assert.equal(report.totals.find((t: { domain: string }) => t.domain === "education").netSpending, "20000.000000");
    assert.equal(report.totals.find((t: { domain: string }) => t.domain === "daily_expense").netSpending, "300.000000");
    const exact = JSON.parse(sql("select export_ledger_backup()")); assert.equal(exact.education_reserve_entries.find((e: { id: string }) => e.id === id(5)).target_amount, "1095.123456");
    assert.throws(() => sql(`set role authenticated;select mutate_education_reserve_entry('delete','${id(2)}','${id(1)}',1,null)`));
    assert.equal(sql("set role authenticated; select count(*) from education_reserve_entries"), "4");
    assert.throws(() => sql(`insert into investment_accounts values('${id(8)}','education')`));
    // Restore both new tables in one transaction with deferred self references, then roll back.
    sql(`begin;set constraints all deferred;delete from education_reserve_entries;delete from education_reserve_funds;
      insert into education_reserve_funds select * from jsonb_populate_recordset(null::education_reserve_funds,${literal(exact.education_reserve_funds)});
      insert into education_reserve_entries select * from jsonb_populate_recordset(null::education_reserve_entries,${literal(exact.education_reserve_entries)});set constraints all immediate;rollback;`);
    console.log("Education PostgreSQL migration, exact amounts, refund integrity, stale edits, RLS, legacy guards, separate report totals and backup restore passed.");
  } finally {
    if (started) execFileSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { windowsHide: true, stdio: "ignore" });
    const safe = resolve(temporary); if (!safe.startsWith(resolve(tmpdir()) + sep) || !safe.includes("education-pg-")) throw new Error("Unexpected temporary path.");
    rmSync(safe, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
