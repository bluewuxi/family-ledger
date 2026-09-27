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
    const redesign = readFileSync(
      "supabase/migrations/20260926090000_redesign_spending_imports.sql",
      "utf8",
    );
    // Guard must fail without modifying data when the empty-table assumption is false.
    sql(
      "insert into spending_accounts(name,default_currency) values('Guard','CNY')",
    );
    assert.throws(() => sql(redesign));
    assert.equal(sql("select count(*) from spending_accounts"), "1");
    sql("delete from spending_accounts");
    sql(redesign);
    const a = sql(
      "insert into spending_accounts(name,source_format,default_currency) values('Example','ccb_credit','CNY') returning id",
    );
    const nz = sql(
      "insert into spending_accounts(name,source_format,default_currency) values('Example NZ','bnz','NZD') returning id",
    );
    const actor = "00000000-0000-4000-8000-000000000099";
    sql(`insert into auth.users values('${actor}')`);
    const json = (v: unknown) =>
      "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
    const makeRow = (
      row_number: number,
      amount: string,
      classification: string,
      fingerprint: string,
      date = "2026-09-24",
    ) => ({
      row_number,
      amount,
      classification,
      fingerprint,
      transaction_date: date,
      description: "Example",
      tag: null,
      notes: null,
      source_metadata: { test: "source" },
      duplicate_count: 0,
    });
    const rows = [
      makeRow(2, "-20", "spending", "a".repeat(64)),
      makeRow(3, "-20", "spending", "a".repeat(64)),
      makeRow(4, "5", "refund", "b".repeat(64)),
      makeRow(5, "100", "income", "c".repeat(64)),
      makeRow(6, "1000", "excluded", "d".repeat(64)),
      makeRow(7, "-3", "review", "e".repeat(64)),
    ];
    const choices = (rs: typeof rows) =>
      rs.map((r) => ({
        row_number: r.row_number,
        skip: false,
        classification: r.classification,
        tag: null,
        allow_duplicate: false,
      }));
    const create = (rs = rows, hash = "1".repeat(64), account = a) => {
      const id = sql(
        `insert into account_statements(account_id) values('${account}') returning id`,
      );
      const payload = {
        preview: {
          encoding: "utf-8",
          parser_version: "bank-csv-1",
          rows: rs,
          errors: [],
          warnings: [],
        },
        key: `statements/pending/${id}/file.csv`,
        version: "v1",
        filename: "sample.csv",
        sha256: hash,
      };
      const token = sql(
        `select set_spending_preview('${id}',${json(payload)},'${actor}')`,
      );
      return { id, token, rs };
    };
    const command = (b: ReturnType<typeof create>, cs = choices(b.rs)) =>
      `select commit_spending_import('${b.id}','${b.token}',${json(cs)},'${actor}','statements/${b.id}/file.csv','v2')`;
    const b = create();
    assert.equal(sql("select count(*) from statement_rows"), "0");
    assert.throws(() => sql(command(b, choices(rows).slice(1))));
    assert.throws(() =>
      sql(
        command(
          b,
          choices(rows).map((c, i) =>
            i === 0 ? { ...c, classification: "income" } : c,
          ),
        ),
      ),
    );
    assert.equal(sql("select count(*) from statement_rows"), "0");
    assert.equal(sql(command(b)), b.id);
    assert.equal(sql(command(b)), b.id); // Lost response/retry does not duplicate rows.
    assert.equal(sql("select count(*) from statement_rows"), "6");
    assert.equal(
      sql(
        `select count(*) from statement_rows where fingerprint='${"a".repeat(64)}'`,
      ),
      "2",
    );
    assert.throws(() =>
      sql(
        command(
          b,
          choices(rows).map((c) => ({ ...c, skip: true })),
        ),
      ),
    );
    const q = (filters = {}) =>
      JSON.parse(
        sql(
          `select query_spending_rows(${json({ limit: 2, offset: 0, ...filters })})`,
        ),
      );
    const report = q();
    assert.equal(report.rows.length, 2);
    assert.equal(report.pagination.total, 6);
    assert.equal(report.pagination.hasMore, true);
    assert.equal(report.totals[0].gross_spending, "40.000000");
    assert.equal(report.totals[0].refunds, "5.000000");
    assert.equal(report.totals[0].net_spending, "35.000000");
    assert.equal(report.totals[0].income, "100.000000");
    assert.equal(report.totals[0].pending_count, 1);
    assert.equal(q({ classification: "review" }).pagination.total, 1);
    assert.equal(q({ from: "2026-10-01" }).totals.length, 0);
    const duplicates = JSON.parse(
      sql(
        `select spending_duplicate_counts('${a}',array['${"a".repeat(64)}'])`,
      ),
    );
    assert.equal(duplicates["a".repeat(64)], 2);
    // A different file with overlapping transactions needs explicit review.
    const overlap = create(
      rows.map((r) => ({ ...r, duplicate_count: r.row_number <= 3 ? 2 : 1 })),
      "2".repeat(64),
    );
    assert.throws(() => sql(command(overlap)));
    assert.equal(
      sql(
        command(
          overlap,
          choices(overlap.rs).map((c) => ({ ...c, skip: true })),
        ),
      ),
      overlap.id,
    );
    assert.equal(sql("select count(*) from statement_rows"), "6");
    // Unique file guard is independent of the row choices.
    const repeat = create(
      rows.map((r) => ({ ...r, duplicate_count: r.row_number <= 3 ? 2 : 1 })),
    );
    assert.throws(() =>
      sql(
        command(
          repeat,
          choices(repeat.rs).map((c) => ({ ...c, allow_duplicate: true })),
        ),
      ),
    );
    // Manual rows do not require any statement and preserve exact decimal precision.
    const manual = (amount: string, classification: string, account = nz) =>
      JSON.parse(
        JSON.stringify({
          account_id: account,
          transaction_date: "2026-02-01",
          description: "manual",
          amount,
          classification,
          tag: "Food",
          notes: null,
        }),
      );
    const mid = sql(
      `select mutate_spending_row(null,${json(manual("-99999999999999.999999", "spending"))},'${actor}',false)`,
    );
    assert.equal(
      sql(`select amount::text from statement_rows where id='${mid}'`),
      "-99999999999999.999999",
    );
    assert.equal(q().totals.length, 2);
    assert.equal(q({ currency: "NZD" }).pagination.total, 1);
    assert.equal(q({ tag: "Food" }).pagination.total, 1);
    assert.throws(() =>
      sql(
        `update spending_accounts set default_currency='USD' where id='${a}'`,
      ),
    );
    const rid = sql(
      `select id from statement_rows where statement_id='${b.id}' order by row_number limit 1`,
    );
    sql(
      `select bulk_classify_spending(array['${rid}'::uuid],'{"tag":"Groceries"}','${actor}')`,
    );
    assert.equal(q({ tag: "Groceries" }).pagination.total, 1);
    assert.equal(
      sql(
        `select edited_count from spending_statement_details where id='${b.id}'`,
      ),
      "1",
    );
    assert.throws(() =>
      sql(`select undo_spending_import('${b.id}','${actor}',false)`),
    );
    assert.equal(
      sql(`select undo_spending_import('${b.id}','${actor}',true)`),
      "6",
    );
    assert.equal(
      sql(`select undo_spending_import('${b.id}','${actor}',true)`),
      "0",
    );
    assert.equal(
      sql(`select count(*) from statement_rows where id='${mid}'`),
      "1",
    );
    assert.equal(
      sql(`select csv_file_version from account_statements where id='${b.id}'`),
      "v2",
    );
    // Concurrent overlapping imports serialize on the account; exactly one wins.
    const one = create([rows[0]], "3".repeat(64)),
      two = create([rows[0]], "4".repeat(64));
    const run = promisify(execFile);
    const results = await Promise.allSettled([
      run(exe("psql"), [...args, "-c", command(one)], { windowsHide: true }),
      run(exe("psql"), [...args, "-c", command(two)], { windowsHide: true }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      sql(`select count(*) from statement_rows where account_id='${a}'`),
      "1",
    );
    const expired = create([rows[0]], "5".repeat(64));
    sql(
      `update account_statements set expires_at=now()-interval '1 hour' where id='${expired.id}'`,
    );
    assert.throws(() => sql(command(expired)));
    sql("grant usage on schema public to authenticated");
    assert.equal(
      sql(
        "set role authenticated;set test.role='viewer';select count(*) from spending_accounts",
      ),
      "2",
    );
    assert.equal(
      sql(
        "set role authenticated;set test.role='none';select count(*) from spending_accounts",
      ),
      "0",
    );
    assert.throws(() =>
      sql(
        "set role authenticated;insert into spending_accounts(name,source_format,default_currency) values('No','bnz','NZD')",
      ),
    );
    assert.throws(() =>
      sql("set role authenticated;select query_spending_rows('{}')"),
    );
    const exported = JSON.parse(sql("select export_ledger_backup()"));
    assert.equal(exported.statement_rows.length, 2);
    assert.equal(exported.spending_accounts.length, 2);
    // Restore the current schema payload in a rollback-only transaction; investments remain untouched.
    sql(`begin;delete from statement_rows;delete from account_statements;delete from spending_accounts;
      insert into spending_accounts select * from jsonb_populate_recordset(null::spending_accounts,${json(exported.spending_accounts)});
      insert into account_statements select * from jsonb_populate_recordset(null::account_statements,${json(exported.account_statements)});
      insert into statement_rows select * from jsonb_populate_recordset(null::statement_rows,${json(exported.statement_rows)});rollback;`);
    assert.equal(sql("select count(*) from statement_rows"), "2");
    console.log(
      "Spending PostgreSQL: empty guard, schema, exact totals, preview/atomic commit/retry, duplicate multiplicity, concurrency, undo isolation, RLS, backup and restore passed.",
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
