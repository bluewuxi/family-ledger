import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";

async function main(): Promise<void> {
  const base = "C:/Program Files/PostgreSQL";
  const bin = process.env.SNAPSHOT_TEST_PG_BIN ?? (process.platform === "win32" && existsSync(base)
    ? join(base, readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0], "bin") : "");
  const exe = (name: string) => bin ? join(bin, `${name}.exe`) : name;
  const temporary = mkdtempSync(join(tmpdir(), "signed-snapshot-pg-"));
  const data = join(temporary, "data");
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const run = (name: string, args: string[]) => execFileSync(exe(name), args, { windowsHide: true, stdio: "ignore" });
  const sql = (input: string) => execFileSync(exe("psql"), ["-X", "-qAt", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input, encoding: "utf8", windowsHide: true, stdio: "pipe"
  }).trim().replaceAll("\r\n", "\n");
  let started = false;
  try {
    run("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
    run("pg_ctl", ["-D", data, "-l", join(temporary, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
    started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.ledger_write_state(id boolean primary key,revision bigint); insert into public.ledger_write_state values(true,0);
      create table public.portfolio_snapshot_headers(id uuid primary key default gen_random_uuid(),snapshot_date date unique,usd_to_nzd_rate numeric,usd_to_cny_rate numeric,updated_at timestamptz);
      create table public.portfolio_account_snapshots(portfolio_snapshot_id uuid,snapshot_date date,account_id uuid,account_name text,market_value_usd numeric,cost_usd numeric,unrealized_gain_usd numeric,daily_change_usd numeric,daily_change_pct numeric,warnings jsonb);
      create table public.transactions(trade_date date); insert into public.transactions values('2026-10-30');
      create table public.instrument_prices(price_date date,close_price numeric);
      create table public.exchange_rates(rate_date date,rate numeric);
      create table public.kernel_nta_refresh_state(pending_snapshot_from date);
      create function public.commit_transaction_write(text,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,boolean) returns jsonb language sql as 'select null::jsonb';
      create function public.advance_test_revision() returns trigger language plpgsql as $$begin update public.ledger_write_state set revision=revision+1; return null; end$$;
      create trigger advance_revision before insert or update or delete on public.portfolio_snapshot_headers for each statement execute function public.advance_test_revision();
    `);
    const cutover = readFileSync('supabase/migrations/20260922091000_cut_over_derived_portfolio_snapshots.sql','utf8');
    const definition = cutover.match(/create or replace function public\.upsert_portfolio_snapshot[\s\S]*?\n\$\$;/); assert(definition);sql(definition[0]);
    sql(readFileSync('supabase/migrations/20261102120000_snapshot_reliability.sql','utf8'));
    const valuation=JSON.stringify({snapshotDate:'2026-10-31',usdToNzdRate:'1.6',usdToCnyRate:'7',accounts:[]});
    const publish=(revision:string)=>sql(`set role service_role; select public.upsert_portfolio_snapshot('${valuation}'::jsonb,'${revision}')->>'snapshotId';`);
    assert(publish('0'));
    assert.throws(()=>publish('0'),/Ledger changed/);
    assert.equal(sql('select count(*) from public.portfolio_snapshot_headers'),'1');
    // Hold the ledger row in one session, start a snapshot from an older read in
    // a second session, then release the first session after its write commits.
    const blocker = spawn(exe("psql"),["-X","-qAt","-h","127.0.0.1","-p",String(port),"-U","postgres","-v","ON_ERROR_STOP=1"],{windowsHide:true});
    let readyResolve!: () => void;
    const ready = new Promise<void>(resolve => {readyResolve=resolve;});
    blocker.stdout.on("data",chunk => {if(String(chunk).includes("LOCKED")) readyResolve();});
    blocker.stdin.write("begin; select revision from public.ledger_write_state where id for update; select 'LOCKED';\n");
    await ready;
    const contender = spawn(exe("psql"),["-X","-qAt","-h","127.0.0.1","-p",String(port),"-U","postgres","-v","ON_ERROR_STOP=1"],{windowsHide:true});
    let diagnostic="";
    contender.stderr.on("data",chunk => {diagnostic+=String(chunk);});
    const contenderResult = new Promise<number|null>(resolve=>contender.on("exit",resolve));
    contender.stdin.end(`set role service_role; select public.upsert_portfolio_snapshot('${valuation}'::jsonb,'1');`);
    const blockerResult = new Promise<number|null>(resolve=>blocker.on("exit",resolve));
    blocker.stdin.end("update public.ledger_write_state set revision=revision+1; commit;\n");
    assert.equal(await blockerResult,0);
    assert.notEqual(await contenderResult,0);
    assert.match(diagnostic,/Ledger changed/);
    assert.equal(sql('select count(*) from public.portfolio_snapshot_headers'),'1');
    assert.throws(()=>sql(`set role service_role; select public.upsert_portfolio_snapshot_unchecked('${valuation}'::jsonb);`),/permission denied/);
    assert.throws(()=>sql(`set role authenticated; select public.upsert_portfolio_snapshot('${valuation}'::jsonb,'1');`),/permission denied/);
    assert.equal(sql(`set role service_role; select snapshot_date from public.snapshot_maintenance_dates('2026-11-01',30,null);`),'2026-11-01');
    sql(`insert into public.instrument_prices values('2026-10-30',100);`);
    assert.equal(sql('select from_date from public.snapshot_repair_state'),'2026-10-30');
    const token=sql('select token from public.snapshot_repair_state');
    sql(`insert into public.exchange_rates values('2026-10-29',0.6);`);
    assert.equal(sql(`set role service_role; select public.advance_snapshot_repair('${token}',null)`),'f');
    assert.equal(sql('select from_date from public.snapshot_repair_state'),'2026-10-29');
    assert.throws(()=>sql(`begin; insert into public.instrument_prices values('2026-01-01',1); select 1/0; commit;`));
    assert.equal(sql('select from_date from public.snapshot_repair_state'),'2026-10-29');
    assert.equal(sql(`select count(*) from public.snapshot_maintenance_dates('2026-11-01',30,'2026-10-30');`),'3');
    sql(`update public.snapshot_repair_state set from_date=null;
      insert into public.transactions values ('2026-08-01');
      set role service_role; select public.request_snapshot_catchup('2026-08-01');`);
    const catchupToken=sql('select token from public.snapshot_repair_state');
    assert.equal(sql(`select count(*) from public.snapshot_maintenance_dates('2026-10-31',30,null);`),'30');
    assert.equal(sql(`set role service_role; select public.advance_snapshot_repair('${catchupToken}','2026-08-31');`),'t');
    assert.equal(sql(`select min(snapshot_date) from public.snapshot_maintenance_dates('2026-10-31',30,null);`),'2026-08-31','later ordinary worker sees durable catchup after the first batch');
    assert.equal(sql(`select count(*) from public.snapshot_maintenance_dates('2026-10-31',30,null);`),'30');
    assert.throws(()=>sql(`set role authenticated; select public.request_snapshot_catchup('2026-08-01');`),/permission denied/);
    console.log('Snapshot revision rejection, private helper permissions, atomic invalidation, CAS, and calendar coverage: passed');
  } finally {
    if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    // This directory was created by mkdtemp for this disposable cluster only.
    assert(resolve(temporary).startsWith(resolve(tmpdir()) + sep));
    assert(temporary.includes("signed-snapshot-pg-"));
    rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
