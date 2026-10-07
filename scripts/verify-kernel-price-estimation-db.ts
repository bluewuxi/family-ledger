import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const bin = findPostgresBin();
  const executable = (name: string) => bin ? join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
  const temporary = mkdtempSync(join(tmpdir(), "kernel-price-pg-"));
  const dataDirectory = join(temporary, "data");
  const port = await reservePort();
  const psqlArgs = [
    "-h", "127.0.0.1",
    "-p", String(port),
    "-U", "postgres",
    "-d", "postgres",
    "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1"
  ];
  const sql = (statement: string): string => execFileSync(executable("psql"), psqlArgs, {
    input: statement,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  }).trim();
  const sqlAsync = async (statement: string): Promise<string> => {
    const result = await execFileAsync(executable("psql"), [...psqlArgs, "-c", statement], {
      encoding: "utf8",
      windowsHide: true
    });
    return result.stdout.trim();
  };

  let started = false;
  try {
    execFileSync(executable("initdb"), [
      "-D", dataDirectory,
      "-U", "postgres",
      "-A", "trust",
      "--encoding=UTF8",
      "--no-locale"
    ], { windowsHide: true, stdio: "pipe" });
    execFileSync(executable("pg_ctl"), [
      "-D", dataDirectory,
      "-l", join(temporary, "server.log"),
      "-o", `-h 127.0.0.1 -p ${port}`,
      "-w", "start"
    ], { windowsHide: true, stdio: "ignore" });
    started = true;

    sql(minimalPreMigrationSchema());
    sql(readFileSync("supabase/migrations/20261002090000_add_kernel_price_estimation.sql", "utf8"));
    const actor = "00000000-0000-4000-8000-000000000099";
    sql(`insert into auth.users(id) values ('${actor}')`);
    const instrumentId = sql("select id from instruments where symbol = 'KERNEL_SP500_UNHEDGED'");
    assert.match(instrumentId, /^[0-9a-f-]{36}$/u);
    const legacyAnchorId = sql(`insert into kernel_price_anchors (
      instrument_id, anchor_date, kernel_unit_price, proxy_symbol, proxy_currency, proxy_close,
      proxy_price_date, proxy_fetched_at, created_by_user_id
    ) values (
      '${instrumentId}', '2026-09-29', 1.9, 'USF.NZ', 'NZD', 11.5,
      '2026-09-29', '2026-09-30T05:15:00Z', '${actor}'
    ) returning id`);
    sql(readFileSync("supabase/migrations/20261002120000_align_kernel_proxy_dates.sql", "utf8"));
    assert.equal(sql(`select count(*) from kernel_price_anchors where id = '${legacyAnchorId}'`), "1");
    assert.equal(
      sql("select convalidated from pg_constraint where conname = 'kernel_price_anchors_proxy_date_after_anchor_check'"),
      "f"
    );
    assert.throws(() => saveAnchorSql(sql, {
      instrumentId,
      actor,
      anchorDate: "2026-09-30",
      proxyPriceDate: "2026-09-30",
      kernelPrice: "2.0000000000",
      proxyClose: "12.0000000000",
      fetchedAt: "2026-10-01T05:15:00Z",
      estimates: []
    }), /Proxy price date must be after/u);
    sql(`delete from kernel_price_anchors where id = '${legacyAnchorId}'`);

    assert.equal(sql(`select price_update_enabled from instruments where id = '${instrumentId}'`), "f");
    assert.equal(sql("select has_table_privilege('service_role', 'public.kernel_price_anchors', 'SELECT')"), "t");
    assert.equal(sql("select has_table_privilege('service_role', 'public.kernel_price_anchors', 'INSERT,UPDATE,DELETE')"), "f");
    assert.equal(sql("select has_function_privilege('authenticated', 'public.save_kernel_price_anchor(uuid,date,numeric,text,text,numeric,date,timestamptz,uuid,jsonb)', 'EXECUTE')"), "f");
    assert.equal(sql("set role authenticated; select count(*) from kernel_price_anchors; reset role"), "0");

    sql(`insert into instrument_prices (
      instrument_id, price_date, close_price, currency, provider, source_symbol, is_adjusted, is_estimated, fetched_at
    ) values (
      '${instrumentId}', '2026-09-30', 1.9, 'NZD', 'Kernel Estimate (USF.NZ)', 'USF.NZ', false, true, '2026-10-01T05:00:00Z'
    )`);

    const firstId = saveAnchorSql(sql, {
      instrumentId,
      actor,
      anchorDate: "2026-09-30",
      proxyPriceDate: "2026-10-01",
      kernelPrice: "2.0000000000",
      proxyClose: "12.0000000000",
      fetchedAt: "2026-10-01T05:15:00Z",
      estimates: [{ price_date: "2026-10-01", close_price: "2.1000000000", fetched_at: "2026-10-02T05:15:00Z" }]
    });
    assert.match(firstId, /^[0-9a-f-]{36}$/u);
    assert.equal(sql(`select proxy_price_date from kernel_price_anchors where id = '${firstId}'`), "2026-10-01");
    assert.equal(sql(`select price_update_enabled from instruments where id = '${instrumentId}'`), "t");
    assert.equal(sql(`select count(*) from instrument_prices where instrument_id = '${instrumentId}' and provider = 'Kernel Estimate (USF.NZ)' and price_date = '2026-09-30'`), "0");
    assert.equal(sql(`select close_price || ':' || is_estimated from instrument_prices where instrument_id = '${instrumentId}' and provider = 'Kernel Anchor' and price_date = '2026-09-30'`), "2.0000000000:false");
    assert.equal(sql(`select close_price || ':' || is_estimated from instrument_prices where instrument_id = '${instrumentId}' and provider = 'Kernel Estimate (USF.NZ)' and price_date = '2026-10-01'`), "2.1000000000:true");

    const retryId = saveAnchorSql(sql, {
      instrumentId,
      actor,
      anchorDate: "2026-09-30",
      proxyPriceDate: "2026-10-01",
      kernelPrice: "2.0000000000",
      proxyClose: "12.0000000000",
      fetchedAt: "2026-10-03T05:15:00Z",
      estimates: [{ price_date: "2026-10-01", close_price: "9.9999999999", fetched_at: "2026-10-03T05:15:00Z" }]
    });
    assert.equal(retryId, firstId);
    assert.equal(sql(`select count(*) from kernel_price_anchors where instrument_id = '${instrumentId}'`), "1");
    assert.equal(sql(`select close_price from instrument_prices where instrument_id = '${instrumentId}' and provider = 'Kernel Estimate (USF.NZ)' and price_date = '2026-10-01'`), "2.1000000000");

    saveAnchorSql(sql, {
      instrumentId,
      actor,
      anchorDate: "2026-09-30",
      proxyPriceDate: "2026-10-01",
      kernelPrice: "2.2000000000",
      proxyClose: "12.0000000000",
      fetchedAt: "2026-10-04T05:15:00Z",
      estimates: [{ price_date: "2026-10-01", close_price: "2.3100000000", fetched_at: "2026-10-04T05:15:00Z" }]
    });
    assert.equal(sql(`select count(*) from kernel_price_anchors where instrument_id = '${instrumentId}' and anchor_date = '2026-09-30'`), "2");
    assert.equal(sql(`select close_price from instrument_prices where instrument_id = '${instrumentId}' and provider = 'Kernel Anchor' and price_date = '2026-09-30'`), "2.2000000000");

    saveAnchorSql(sql, {
      instrumentId,
      actor,
      anchorDate: "2026-09-30",
      proxyPriceDate: "2026-10-01",
      kernelPrice: "2.0000000000",
      proxyClose: "12.0000000000",
      fetchedAt: "2026-10-05T05:15:00Z",
      estimates: [{ price_date: "2026-10-01", close_price: "8.8888888888", fetched_at: "2026-10-05T05:15:00Z" }]
    });
    assert.equal(sql(`select close_price from instrument_prices where instrument_id = '${instrumentId}' and provider = 'Kernel Anchor' and price_date = '2026-09-30'`), "2.2000000000");
    assert.equal(sql(`select close_price from instrument_prices where instrument_id = '${instrumentId}' and provider = 'Kernel Estimate (USF.NZ)' and price_date = '2026-10-01'`), "2.3100000000");

    sql(`update instruments set price_update_enabled = false where id = '${instrumentId}'`);
    sql(`insert into instrument_prices (
      instrument_id, price_date, close_price, currency, provider, source_symbol, is_adjusted, is_estimated
    ) values (
      '${instrumentId}', '2026-10-05', 9.9, 'NZD', 'Kernel Estimate (USF.NZ)', 'USF.NZ', false, true
    )`);
    saveAnchorSql(sql, {
      instrumentId,
      actor,
      anchorDate: "2026-10-02",
      proxyPriceDate: "2026-10-05",
      kernelPrice: "2.4000000000",
      proxyClose: "13.0000000000",
      fetchedAt: "2026-10-03T05:15:00Z",
      estimates: []
    });
    assert.equal(sql(`select price_update_enabled from instruments where id = '${instrumentId}'`), "f");
    assert.equal(sql(`select count(*) from instrument_prices where instrument_id = '${instrumentId}' and provider = 'Kernel Estimate (USF.NZ)' and price_date = '2026-10-05'`), "0");

    sql(`insert into instrument_prices (instrument_id, price_date, close_price, currency, provider, source_symbol, is_adjusted, is_estimated)
      values ('${instrumentId}', '2026-10-01', 2.3, 'NZD', 'Another Exact Source', 'USF.NZ', false, false)`);
    assert.equal(sql(`select provider from latest_instrument_prices_for_dates(array['2026-10-01'::date], array['${instrumentId}'::uuid]) order by price_date desc limit 1`), "Another Exact Source");
    sql(`insert into instrument_prices (instrument_id, price_date, close_price, currency, provider, source_symbol, is_adjusted, is_estimated)
      values ('${instrumentId}', '2026-10-01', 2.29, 'NZD', 'manual', 'USF.NZ', false, false)`);
    assert.equal(sql(`select provider from latest_instrument_prices_for_dates(array['2026-10-01'::date], array['${instrumentId}'::uuid]) order by price_date desc limit 1`), "manual");

    const concurrentA = anchorCall({
      instrumentId,
      actor,
      anchorDate: "2026-10-03",
      proxyPriceDate: "2026-10-05",
      kernelPrice: "2.5000000000",
      proxyClose: "14.0000000000",
      fetchedAt: "2026-10-04T05:15:00Z",
      estimates: []
    });
    const concurrentB = anchorCall({
      instrumentId,
      actor,
      anchorDate: "2026-10-03",
      proxyPriceDate: "2026-10-05",
      kernelPrice: "2.6000000000",
      proxyClose: "14.0000000000",
      fetchedAt: "2026-10-04T05:15:01Z",
      estimates: []
    });
    await Promise.all([sqlAsync(concurrentA), sqlAsync(concurrentB)]);
    const newestRevision = sql(`select kernel_unit_price from kernel_price_anchors where instrument_id = '${instrumentId}' and anchor_date = '2026-10-03' order by created_at desc, id desc limit 1`);
    const exactPrice = sql(`select close_price from instrument_prices where instrument_id = '${instrumentId}' and provider = 'Kernel Anchor' and price_date = '2026-10-03'`);
    assert.equal(exactPrice, newestRevision);
    assert.equal(sql(`select price_update_enabled from instruments where id = '${instrumentId}'`), "f");
    assert.equal(sql("select jsonb_typeof(export_ledger_backup()->'kernel_price_anchors'->0->'kernel_unit_price')"), "string");

    sql("alter table public.dashboard_instrument_quotes add column instrument_id uuid");
    sql(readFileSync("supabase/migrations/20261007120000_kernel_nta_estimation.sql", "utf8"));
    sql(readFileSync("supabase/migrations/20261007130000_kernel_nta_target_configuration.sql", "utf8"));
    sql(`update instruments set symbol='KN_SP500' where id='${instrumentId}'`);
    sql(`delete from instrument_prices where instrument_id='${instrumentId}'; delete from kernel_price_anchors where instrument_id='${instrumentId}'`);
    sql("alter table instrument_prices disable trigger reject_legacy_kernel_estimate");
    const ntaPayload = JSON.stringify([{source_id:"00000000-0000-4000-8000-000000000077",anchor_date:"2026-09-30",kernel_unit_price:"6.67",proxy_close:"23.60990",proxy_price_date:"2026-10-01",announcement_id:481058,published_at:"2026-10-02T00:00:00Z",created_by_user_id:actor,revision_at:"2026-10-02T08:25:57Z"}]);
    const ntaEstimates = JSON.stringify([{price_date:"2026-10-01",close_price:"6.7285866353"},{price_date:"2026-10-05",close_price:"6.8349906776"}]);
    const refresh = (estimates=ntaEstimates) => sql(`select refresh_kernel_nta('${instrumentId}','2026-09-30','2026-10-07T02:00:00Z','${ntaPayload}'::jsonb,'${estimates}'::jsonb)`);
    sql(`insert into instrument_prices(instrument_id,price_date,close_price,currency,provider,is_adjusted,is_estimated) values('${instrumentId}','2026-10-02',6.756567,'NZD','manual',false,false),('${instrumentId}','2026-10-05',9,'NZD','Kernel Estimate (USF.NZ)',false,true)`);
    sql("alter table instrument_prices enable trigger reject_legacy_kernel_estimate");
    const firstRefresh = JSON.parse(refresh());
    assert.equal(firstRefresh.pending_snapshot_from,"2026-09-30");
    assert.equal(sql("select close_price from instrument_prices where provider='Kernel Estimate (USF NTA)' and price_date='2026-10-05'"),"6.8349906776");
    assert.equal(sql("select count(*) from instrument_prices where provider='Kernel Estimate (USF.NZ)'"),"0");
    assert.equal(sql("select close_price from instrument_prices where provider='manual'"),"6.7565670000");
    sql(`select complete_kernel_nta_snapshots('${instrumentId}','${firstRefresh.refresh_token}')`);
    const repeated = JSON.parse(refresh());
    assert.equal(repeated.changed_count,0);
    assert.equal(repeated.pending_snapshot_from,null);
    assert.equal(sql("select count(*) from kernel_price_anchors"),"1");
    assert.throws(()=>refresh(JSON.stringify([{price_date:"2026-10-01",close_price:"-1"}])));
    assert.equal(sql("select close_price from instrument_prices where provider='Kernel Estimate (USF NTA)' and price_date='2026-10-05'"),"6.8349906776");
    const corrected = JSON.parse(refresh(JSON.stringify([{price_date:"2026-10-01",close_price:"6.7285866353"},{price_date:"2026-10-05",close_price:"6.84"}])));
    assert.equal(corrected.pending_snapshot_from,"2026-10-05");
    assert.equal(sql("select has_function_privilege('authenticated','public.refresh_kernel_nta(uuid,date,timestamptz,jsonb,jsonb)','EXECUTE')"),"f");
    assert.equal(sql("select has_function_privilege('service_role','public.save_kernel_price_anchor(uuid,date,numeric,text,text,numeric,date,timestamptz,uuid,jsonb)','EXECUTE')"),"f");
    assert.equal(sql("select jsonb_typeof(list_kernel_nta_anchors()->0->'kernel_unit_price')"),"string");
    console.log("Kernel price-estimation database verification: success");
  } finally {
    if (started) {
      execFileSync(executable("pg_ctl"), ["-D", dataDirectory, "-m", "fast", "-w", "stop"], {
        windowsHide: true,
        stdio: "ignore"
      });
    }
    const resolvedTemporary = resolve(temporary);
    const resolvedTempRoot = `${resolve(tmpdir())}${sep}`;
    if (!resolvedTemporary.startsWith(resolvedTempRoot)) {
      throw new Error("Refusing to remove a database fixture outside the temporary directory.");
    }
    rmSync(resolvedTemporary, { recursive: true, force: true });
  }
}

interface AnchorInput {
  instrumentId: string;
  actor: string;
  anchorDate: string;
  proxyPriceDate: string;
  kernelPrice: string;
  proxyClose: string;
  fetchedAt: string;
  estimates: Array<{ price_date: string; close_price: string; fetched_at: string }>;
}

function saveAnchorSql(sql: (statement: string) => string, input: AnchorInput): string {
  return sql(anchorCall(input));
}

function anchorCall(input: AnchorInput): string {
  const estimates = JSON.stringify(input.estimates).replace(/'/gu, "''");
  return `select (save_kernel_price_anchor(
    '${input.instrumentId}', '${input.anchorDate}', ${input.kernelPrice}, 'USF.NZ', 'NZD', ${input.proxyClose},
    '${input.proxyPriceDate}', '${input.fetchedAt}', '${input.actor}', '${estimates}'::jsonb
  )).id`;
}

function findPostgresBin(): string {
  if (process.env.KERNEL_TEST_PG_BIN) return process.env.KERNEL_TEST_PG_BIN;
  const base = "C:/Program Files/PostgreSQL";
  if (process.platform !== "win32" || !existsSync(base)) return "";
  const versions = readdirSync(base).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  return versions.length > 0 ? join(base, versions[0], "bin") : "";
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
  const address = server.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
  return port;
}

function minimalPreMigrationSchema(): string {
  const idTables = [
    "spending_accounts", "account_statements", "profiles", "user_roles", "investment_accounts", "transactions",
    "exchange_rates", "portfolio_snapshot_headers", "portfolio_account_snapshots", "dashboard_instrument_quotes",
    "job_runs", "data_provider_runs"
  ].map((table) => `create table public.${table}(id uuid primary key default gen_random_uuid());`).join("\n");
  return `
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function public.has_active_role(text) returns boolean language sql stable as $$ select true $$;
    create table public.currencies(code text primary key);
    insert into public.currencies(code) values ('NZD'), ('USD');
    ${idTables}
    create table public.statement_rows(id uuid primary key default gen_random_uuid(), amount numeric);
    create table public.monthly_reviews(month text primary key);
    create table public.instruments(
      id uuid primary key default gen_random_uuid(),
      symbol text not null,
      short_name text not null,
      name text not null,
      description text,
      market_region text not null,
      exchange text not null,
      currency text not null references public.currencies(code),
      asset_type text not null,
      isin text,
      provider text,
      price_source text not null,
      price_source_symbol text,
      price_source_exchange text,
      price_update_enabled boolean not null default false,
      price_update_priority integer not null default 100,
      source_url text,
      source_checked_at timestamptz,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint instruments_price_source_check check (price_source in (
        'manual', 'yahoo_finance', 'alpha_vantage', 'stooq', 'twelvedata', 'eastmoney', 'sina', 'investnow_manual', 'custom'
      )),
      unique(market_region, exchange, symbol)
    );
    create table public.instrument_prices(
      id uuid primary key default gen_random_uuid(),
      instrument_id uuid not null references public.instruments(id),
      price_date date not null,
      close_price numeric(28, 10) not null,
      currency text not null references public.currencies(code),
      provider text not null,
      source_symbol text,
      is_adjusted boolean not null default false,
      fetched_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(instrument_id, provider, price_date)
    );
    create function public.latest_instrument_prices_for_dates(date[], uuid[] default null)
    returns table(as_of_date date) language sql stable as $$ select null::date where false $$;
  `;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
