import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { promisify } from "node:util";

async function main() {
  // Isolated local PostgreSQL only: never reads project connection strings or credentials.
  const base = "C:/Program Files/PostgreSQL";
  const bin =
    process.env.SPENDING_TEST_PG_BIN ??
    (process.platform === "win32" && existsSync(base)
      ? join(base, readdirSync(base).sort().reverse()[0], "bin")
      : "");
  const exe = (name: string) =>
    bin ? join(bin, name + (process.platform === "win32" ? ".exe" : "")) : name;
  const temporary = mkdtempSync(join(tmpdir(), "spending-pg-"));
  const data = join(temporary, "data");
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((r) => server.close(() => r()));
  const args = [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
  ];
  const sql = (text: string) =>
    execFileSync(exe("psql"), args, {
      input: text,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  let started = false;
  try {
    execFileSync(
      exe("initdb"),
      [
        "-D",
        data,
        "-U",
        "postgres",
        "-A",
        "trust",
        "--encoding=UTF8",
        "--no-locale",
      ],
      { windowsHide: true, stdio: "pipe" },
    );
    execFileSync(
      exe("pg_ctl"),
      [
        "-D",
        data,
        "-l",
        join(temporary, "server.log"),
        "-o",
        `-h 127.0.0.1 -p ${port}`,
        "-w",
        "start",
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    started = true;
    sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
    create function public.has_active_role(text) returns boolean language sql as $$select current_setting('test.role',true) in ('viewer','admin')$$;
    create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;`);
    const migration = readFileSync(
      "supabase/migrations/20260923090000_add_spending_statements.sql",
      "utf8",
    );
    for (const table of [
      "profiles",
      "user_roles",
      "investment_accounts",
      "instruments",
      "transactions",
      "exchange_rates",
      "instrument_prices",
      "portfolio_snapshot_headers",
      "portfolio_account_snapshots",
      "dashboard_instrument_quotes",
      "job_runs",
      "data_provider_runs",
    ])
      sql(`create table ${table}(id uuid);`);
    sql(
      "create table currencies(code text);create table monthly_reviews(month text);",
    );
    sql(migration);
    assert.equal(sql("select count(*) from information_schema.columns where table_name='account_statements' and column_name in ('opening_balance','closing_balance','charges_total','credits_total')"), "0");
    const a = sql(
      `insert into spending_accounts(name,default_currency) values('Test','CNY') returning id;`,
    );
    const s = sql(
      `insert into account_statements(account_id,month,statement_date,period_start,period_end,currency) values('${a}','2026-06-01','2026-06-27','2026-05-28','2026-06-27','CNY') returning id;`,
    );
    const insert = (
      date: string,
      type: string,
      value: string,
      tag: string | null = "food",
    ) =>
      `insert into statement_rows(statement_id,transaction_date,posting_date,description,transaction_type,original_currency,original_amount,settlement_amount,suffix_number,tag) values('${s}','${date}','2026-06-27','fixture','${type}','CNY',${value},${value},'0175',${tag === null ? "null" : `'${tag}'`}) returning id;`;
    const purchase = sql(insert("2026-05-27", "purchase", "10.123456"));
    sql(insert("2026-06-01", "purchase", "100"));
    const refund = sql(insert("2026-06-02", "refund", "-10"));
    const cashback = sql(insert("2026-06-03", "cashback", "-2"));
    sql(insert("2026-06-04", "repayment", "-50"));
    const advance = sql(insert("2026-06-05", "cash_advance", "20"));
    sql(insert("2026-06-06", "adjustment", "5", null));
    const query = (filters: Record<string, unknown> = {}) =>
      JSON.parse(
        sql(
          `select query_spending_rows('${JSON.stringify({ limit: 2, offset: 0, ...filters })}'::jsonb);`,
        ),
      );
    let r = query({ from: "2026-06-01", to: "2026-06-30" });
    assert.equal(r.rows.length, 2);
    assert.equal(r.pagination.total, 6);
    assert.equal(r.pagination.hasMore, true);
    assert.equal(r.totals[0].net_spending, "125.000000");
    assert.equal(r.totals[0].spending_count, 3);
    assert.equal(r.totals[0].excluded_amount, "-62.000000");
    assert.equal(r.entering_count, 1);
    assert.equal(
      query({ from: "2026-05-01", to: "2026-05-31" }).totals[0].net_spending,
      "10.123456",
    );
    assert.equal(query({ statementMonth: "2026-06-01" }).pagination.total, 7);
    assert.equal(query({ untagged: "true" }).pagination.total, 1);
    assert.equal(
      query({ suffixNumber: "0175", tag: "food" }).pagination.total,
      6,
    );
    assert.equal(query({ q: "fix", offset: 6 }).rows[0].id, purchase);
    assert.equal(query({ q: "%" }).pagination.total, 0);
    assert.equal(query({ suffixNumber: "9999" }).totals.length, 0);
    assert.equal(
      query({ accountId: "00000000-0000-4000-8000-000000000000" }).pagination
        .total,
      0,
    );
    assert.equal(
      sql(`select is_spending from statement_rows where id='${purchase}'`),
      "t",
    );
    assert.equal(
      sql(`select is_spending from statement_rows where id='${refund}'`),
      "f",
    );
    sql(
      `update statement_rows set is_spending=true where id in ('${refund}','${cashback}');update statement_rows set is_spending=false where id='${advance}';`,
    );
    r = query({ from: "2026-06-01", to: "2026-06-30" });
    assert.equal(r.totals[0].net_spending, "93.000000");
    assert.equal(r.totals[0].included_positive, "105.000000");
    assert.equal(r.totals[0].included_negative, "-12.000000");
    assert.equal(r.monthly[0].net_spending, "93.000000");
    assert.equal(
      query({
        from: "2026-06-01",
        to: "2026-06-30",
        tag: "food",
        suffixNumber: "0175",
        isSpending: "true",
      }).pagination.total,
      3,
    );
    r = query({ isSpending: "false" });
    assert.equal(r.pagination.total, 2);
    assert.equal(r.totals[0].net_spending, "0");
    sql(
      `update account_statements set status='complete' where id='${s}';update statement_rows set is_spending=false where id='${purchase}';`,
    );
    assert.equal(
      sql(`select status from account_statements where id='${s}'`),
      "entering",
    );
    sql(
      `update statement_rows set transaction_type='adjustment',original_amount=-3,settlement_amount=-3 where id='${purchase}';`,
    );
    assert.equal(
      sql(`select is_spending from statement_rows where id='${purchase}'`),
      "f",
    );
    sql(
      `update statement_rows set original_amount=10.123456,settlement_amount=10.123456,is_spending=true where id='${purchase}';`,
    );
    assert.throws(() =>
      sql(`update statement_rows set is_spending=null where id='${purchase}'`),
    );
    const zero = sql(insert("2026-06-09", "adjustment", "0"));
    assert.equal(
      sql(`select is_spending from statement_rows where id='${zero}'`),
      "f",
    );
    const excluded = sql(
      insert("2026-06-09", "purchase", "10")
        .replace("suffix_number,tag)", "suffix_number,tag,is_spending)")
        .replace(") returning id;", ",false) returning id;"),
    );
    assert.equal(
      sql(`select is_spending from statement_rows where id='${excluded}'`),
      "f",
    );
    const included = sql(
      insert("2026-06-09", "refund", "-1")
        .replace("suffix_number,tag)", "suffix_number,tag,is_spending)")
        .replace(") returning id;", ",true) returning id;"),
    );
    assert.equal(
      sql(`select is_spending from statement_rows where id='${included}'`),
      "t",
    );
    sql(
      `update account_statements set status='complete' where id='${s}';update statement_rows set tag='telecom',notes='test' where id='${purchase}';`,
    );
    assert.equal(
      sql(`select status from account_statements where id='${s}'`),
      "complete",
    );
    sql(
      `update statement_rows set settlement_amount=11 where id='${purchase}'`,
    );
    assert.equal(
      sql(`select status from account_statements where id='${s}'`),
      "entering",
    );
    sql(
      `update account_statements set status='complete' where id='${s}';update account_statements set period_start='2026-05-27' where id='${s}'`,
    );
    assert.equal(
      sql(`select status from account_statements where id='${s}'`),
      "entering",
    );
    assert.throws(() =>
      sql(`update account_statements set currency='NZD' where id='${s}'`),
    );
    assert.throws(() => sql(`delete from spending_accounts where id='${a}'`));
    assert.throws(() =>
      sql(
        `insert into account_statements(account_id,month,statement_date,period_start,period_end,currency) values('${a}','2026-06-01','2026-06-27','2026-05-28','2026-06-27','NZD')`,
      ),
    );
    assert.throws(() => sql(insert("2026-06-08", "refund", "10")));
    const s2 = sql(
      `insert into account_statements(account_id,month,statement_date,period_start,period_end,currency) values('${a}','2026-07-01','2026-07-27','2026-06-28','2026-07-27','NZD') returning id;`,
    );
    sql(
      insert("2026-06-28", "purchase", "99999999999999.999999").replace(s, s2),
    );
    r = query();
    assert.equal(r.totals.length, 2);
    assert.equal(
      r.totals.find((x: { currency: string }) => x.currency === "NZD")
        .net_spending,
      "99999999999999.999999",
    );
    assert.equal(
      sql(
        `select not (to_jsonb(t) ? 'closing_balance') from spending_statement_details t where id='${s2}'`,
      ),
      "t",
    );
    const concurrentFile = join(temporary, "insert.sql");
    writeFileSync(concurrentFile, insert("2026-06-10", "purchase", "1"));
    await Promise.all(
      Array.from({ length: 6 }, () =>
        promisify(execFile)(exe("psql"), [...args, "-f", concurrentFile], {
          windowsHide: true,
        }),
      ),
    );
    assert.equal(
      sql(
        `select count(*)=count(distinct row_number) from statement_rows where statement_id='${s}'`,
      ),
      "t",
    );
    assert.equal(
      sql(
        `set role authenticated;set test.role='viewer';select count(*) from spending_accounts;`,
      ),
      "1",
    );
    assert.throws(() =>
      sql(
        `set role authenticated;insert into spending_accounts(name,default_currency) values('No','CNY')`,
      ),
    );
    assert.throws(() =>
      sql(`set role authenticated;select query_spending_rows('{}')`),
    );
    assert.equal(
      sql(
        `set role authenticated;set test.role='none';select count(*) from spending_accounts;`,
      ),
      "0",
    );
    assert.equal(
      sql(
        `select jsonb_array_length(export_ledger_backup()->'account_statements');`,
      ),
      "2",
    );
    const actor = "00000000-0000-4000-8000-000000000099";
    sql(`insert into auth.users(id) values('${actor}');`);
    assert.equal(
      sql(`select delete_spending_row('${purchase}','${actor}');`),
      "t",
    );
    assert.equal(
      sql(`select updated_by_user_id from account_statements where id='${s}'`),
      actor,
    );
    assert.equal(
      sql(`select delete_spending_row('${purchase}','${actor}');`),
      "f",
    );
    sql(`delete from account_statements where id='${s}'`);
    assert.equal(
      sql(`select count(*) from statement_rows where statement_id='${s}'`),
      "0",
    );
    console.log(
      "Spending PostgreSQL migration, precision, filters, aggregates, concurrency, RLS, inclusion defaults/overrides, reopening, deletion, and backup checks passed.",
    );
  } finally {
    if (started)
      execFileSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], {
        windowsHide: true,
        stdio: "ignore",
      });
    const safe = resolve(temporary);
    if (
      !safe.startsWith(resolve(tmpdir()) + sep) ||
      !safe.includes("spending-pg-")
    )
      throw new Error("Unexpected temporary path.");
    rmSync(safe, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
