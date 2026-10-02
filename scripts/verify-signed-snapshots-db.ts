import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
    sql(`create table public.portfolio_snapshot_headers (
      id uuid primary key default gen_random_uuid(), snapshot_date date unique,
      usd_to_nzd_rate numeric, usd_to_cny_rate numeric, updated_at timestamptz default now());
      create table public.portfolio_account_snapshots (
      portfolio_snapshot_id uuid references public.portfolio_snapshot_headers(id), snapshot_date date,
      account_id uuid, account_name text, market_value_usd numeric(28,6), cost_usd numeric(28,6),
      unrealized_gain_usd numeric, daily_change_usd numeric, daily_change_pct numeric, warnings jsonb,
      constraint portfolio_account_snapshots_market_value_usd_non_negative_check check (market_value_usd >= 0),
      constraint portfolio_account_snapshots_cost_usd_non_negative_check check (cost_usd >= 0));`);
    const cutover = readFileSync("supabase/migrations/20260922091000_cut_over_derived_portfolio_snapshots.sql", "utf8");
    const definition = cutover.match(/create or replace function public\.upsert_portfolio_snapshot[\s\S]*?\n\$\$;/);
    assert(definition);
    sql(definition[0]);
    const valuation = JSON.stringify({ snapshotDate: "2026-09-30", usdToNzdRate: "1.6", usdToCnyRate: "7", accounts: [{
      accountId: "00000000-0000-0000-0000-000000000001", accountName: "Signed value regression",
      marketValueUsd: "-1.655071", costUsd: "0", unrealizedGainUsd: "-1.655071", dailyChangeUsd: "0", dailyChangePct: "0", warnings: []
    }] });
    const write = `select public.upsert_portfolio_snapshot('${valuation}'::jsonb);`;
    assert.throws(() => sql(write), /market_value_usd_non_negative_check/);
    const migration = readFileSync("supabase/migrations/20261003000000_allow_signed_account_snapshot_values.sql", "utf8");
    sql(migration);
    sql(migration);
    const id = sql(write);
    assert.equal(sql(write), id);
    assert.equal(sql("select market_value_usd from public.portfolio_account_snapshots;"), "-1.655071");
    assert.equal(sql("select count(*) from public.portfolio_account_snapshots;"), "1");
    assert.throws(() => sql("update public.portfolio_account_snapshots set cost_usd = -1;"), /cost_usd_non_negative_check/);
    console.log("Signed snapshot persistence, repeat writes, and retained cost constraint: passed");
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.user_roles(user_id uuid primary key, role text, is_active boolean);
      insert into public.user_roles values ('00000000-0000-0000-0000-000000000099','admin',true);
      create table public.investment_accounts(id uuid primary key);
      insert into public.investment_accounts values ('00000000-0000-0000-0000-000000000001');
      create table public.instruments(id uuid primary key, symbol text, name text, short_name text, asset_type text);
      insert into public.instruments values ('00000000-0000-0000-0000-000000000002','FUND','Fund','Fund','pie_fund'),
        ('00000000-0000-0000-0000-000000000003','CASH_NZD','Cash','Cash','cash');
      create table public.transactions (
        id uuid primary key default gen_random_uuid(), account_id uuid references public.investment_accounts(id),
        instrument_id uuid references public.instruments(id), transaction_type text, trade_date date, settlement_date date,
        quantity numeric, price numeric, gross_amount numeric check (gross_amount >= 0), fee numeric, tax numeric, currency text,
        adjustment_direction text, transaction_source text, linked_transaction_id uuid references public.transactions(id) on delete cascade,
        settlement_currency text, settlement_amount numeric, notes text, created_by_user_id uuid, updated_by_user_id uuid,
        created_at timestamptz default now(), updated_at timestamptz default now());
      create unique index transactions_generated_cash_leg_parent_key on public.transactions(linked_transaction_id)
        where transaction_source='generated_cash_leg';
      create table public.instrument_prices (
        id uuid primary key default gen_random_uuid(), instrument_id uuid references public.instruments(id), price_date date,
        close_price numeric check (close_price > 0), currency text, provider text, source_symbol text,
        is_adjusted boolean, fetched_at timestamptz, source_transaction_id uuid references public.transactions(id) on delete cascade);
      create table public.exchange_rates(id uuid primary key);
      grant usage on schema public to service_role;
      grant all on all tables in schema public to service_role;
      grant execute on function public.upsert_portfolio_snapshot(jsonb) to service_role;`);
    sql(readFileSync("supabase/migrations/20261003010000_atomic_transaction_writes.sql", "utf8"));
    const actorId = "00000000-0000-0000-0000-000000000099";
    const transactionId = "00000000-0000-0000-0000-000000000010";
    const parent = { account_id: "00000000-0000-0000-0000-000000000001", instrument_id: "00000000-0000-0000-0000-000000000002",
      transaction_type: "buy", trade_date: "2026-09-30", settlement_date: "2026-09-30", quantity: "134.4935", price: "6.6918",
      gross_amount: "899.999853", fee: "0", tax: "0", currency: "NZD", transaction_source: "manual",
      settlement_currency: "NZD", settlement_amount: "899.999853", notes: null };
    const cash = { ...parent, instrument_id: "00000000-0000-0000-0000-000000000003", transaction_type: "withdrawal",
      quantity: null, price: null, transaction_source: "generated_cash_leg", linked_transaction_id: transactionId,
      settlement_currency: null, settlement_amount: null };
    const price = { instrumentId: parent.instrument_id, priceDate: "2026-09-30", closePrice: "6.6918", currency: "NZD",
      sourceTransactionId: transactionId, fetchedAt: "2026-10-02T22:44:00Z" };
    const snapshots = [JSON.parse(valuation)];
    const json = (value: unknown) => value === null ? "null" : `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
    const revision = () => sql("select public.get_ledger_write_revision();");
    const state = () => sql(`select jsonb_build_object('transactions',(select jsonb_agg(t order by id) from public.transactions t),
      'prices',(select jsonb_agg(p order by id) from public.instrument_prices p),
      'headers',(select jsonb_agg(h order by id) from public.portfolio_snapshot_headers h),
      'accounts',(select jsonb_agg(a order by snapshot_date,account_id) from public.portfolio_account_snapshots a),
      'revision',public.get_ledger_write_revision());`);
    const commit = (operation: string, parentValue: unknown, cashValue: unknown, priceValue: unknown,
      snapshotValue: unknown, expected = revision(), derived = true) => sql(`set role service_role;
      select public.commit_transaction_write('${operation}','${transactionId}','${expected}','${actorId}',
      ${json(parentValue)},${json(cashValue)},${json(priceValue)},${json(snapshotValue)},${derived});`);
    const before = state();
    assert.throws(() => commit("create", parent, { ...cash, gross_amount: "-1" }, price, snapshots), /DETAIL:.*cash/s);
    assert.equal(state(), before, "Cash failure rolls back parent and revision");
    assert.throws(() => commit("create", parent, cash, { ...price, closePrice: "-1" }, snapshots), /DETAIL:.*price/s);
    assert.equal(state(), before, "Price failure rolls back parent and cash");
    const invalidSnapshot = { ...snapshots[0], snapshotDate: "2026-10-01", accounts: [{ ...snapshots[0].accounts[0], costUsd: "-1" }] };
    assert.throws(() => commit("create", parent, cash, price, [...snapshots, invalidSnapshot]), /DETAIL:.*snapshot/s);
    assert.equal(state(), before, "Late snapshot failure rolls back earlier snapshots and every ledger row");
    const stale = revision();
    sql("insert into public.exchange_rates values(gen_random_uuid());");
    assert.throws(() => commit("create", parent, cash, price, snapshots, stale), /Atomic transaction write failed/);
    assert.equal(sql("select count(*) from public.transactions;"), "0");
    const created = JSON.parse(commit("create", parent, cash, price, snapshots));
    assert.equal(created.id, transactionId);
    assert.equal(created.instruments.asset_type, "pie_fund");
    assert.equal(sql("select count(*) from public.transactions; select count(*) from public.instrument_prices;"), "2\n1");
    const saved = state();
    assert.throws(() => commit("update", { ...parent, quantity: "2" }, cash, price, [invalidSnapshot]), /DETAIL:.*snapshot/s);
    assert.equal(state(), saved, "Failed update retains previous parent, cash, price, and snapshots");
    assert.throws(() => commit("delete", null, null, null, [invalidSnapshot]), /DETAIL:.*snapshot/s);
    assert.equal(state(), saved, "Failed delete restores cascaded cash and prices");
    commit("update", { ...parent, notes: "Changed note" }, null, null, [], revision(), false);
    assert.equal(sql("select notes from public.transactions where transaction_source='manual';"), "Changed note");
    assert.equal(sql("select count(*) from public.instrument_prices;"), "1");
    assert.equal(sql(`select has_function_privilege('authenticated',
      'public.commit_transaction_write(text,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,boolean)','execute');`), "f");
    commit("delete", null, null, null, snapshots);
    assert.equal(sql("select count(*) from public.transactions; select count(*) from public.instrument_prices;"), "0\n0");
    console.log("Atomic create/update/delete, four-layer rollback, revision conflicts, and service-only access: passed");
  } finally {
    if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    // This directory was created by mkdtemp for this disposable cluster only.
    assert(resolve(temporary).startsWith(resolve(tmpdir()) + sep));
    assert(temporary.includes("signed-snapshot-pg-"));
    rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
