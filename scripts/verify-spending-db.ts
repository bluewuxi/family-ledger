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
    sql(readFileSync("supabase/migrations/20260927060000_allow_spending_draft_account_corrections.sql", "utf8"));
    // Exercise additive migration against a completed legacy import and an outstanding approval.
    sql(`insert into spending_accounts(id,name,source_format,default_currency) values('00000000-0000-4000-8000-000000000081','Legacy','ccb_credit','CNY');
      insert into account_statements(id,account_id,status,csv_file_key,csv_file_version,csv_sha256,imported_count,preview,preview_token) values
      ('00000000-0000-4000-8000-000000000082','00000000-0000-4000-8000-000000000081','committed','source','v1',repeat('a',64),1,'{"rows":[{"source_metadata":{"card_number":"6222333344440001","信用卡卡号":"6222333344440001"}}],"errors":[]}',gen_random_uuid()),
      ('00000000-0000-4000-8000-000000000083','00000000-0000-4000-8000-000000000081','preview','source','v1',repeat('b',64),0,'{"rows":[],"errors":[]}',gen_random_uuid());
      insert into statement_rows(account_id,statement_id,row_number,transaction_date,description,amount,classification,source_metadata,fingerprint) values
      ('00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000082',2,'2026-09-24','Legacy',-1,'spending','{"card_number":"6222333344440001","信用卡卡号":"6222333344440001"}',repeat('c',64));`);
    sql(`insert into spending_accounts(id,name,source_format,default_currency,identity_suffix) values ('00000000-0000-4000-8000-000000000084','Debit legacy','ccb_debit','CNY','0012');
      insert into statement_rows(account_id,transaction_date,description,amount,classification,source_metadata) values ('00000000-0000-4000-8000-000000000084','2026-09-24','Original description',-1,'spending','{"对方账号":"6222333344440056","对方户名":"  测试对方  "}');`);
    sql(readFileSync("supabase/migrations/20261001090000_spending_account_suffixes_and_cancellation.sql", "utf8"));
    assert.equal(sql("select account_number_last4 || ':' || counterparty_account_last4 || ':' || counterparty_name from statement_rows where description='Original description'"), "0012:0056:测试对方");
    assert(!sql("select source_metadata from statement_rows").includes("6222333344440056"));
    sql("delete from statement_rows where description='Original description'");
    assert.equal(sql("select account_number_last4 from statement_rows"), "0001");
    assert.equal(sql("select edited from statement_rows"), "f");
    assert.equal(sql("select fingerprint from statement_rows"), "c".repeat(64));
    assert(!sql("select source_metadata from statement_rows").includes("6222333344440001"));
    assert(!sql("select preview from account_statements").includes("6222333344440001"));
    assert.equal(sql("select preview_token is null from account_statements where status='preview'"), "t");
    assert.equal(sql("select total_count from spending_statement_details where status='committed'"), "1");
    sql("delete from statement_rows;delete from account_statements;delete from spending_accounts");
    sql(`begin;
      insert into spending_accounts(id,name,source_format,default_currency) values('00000000-0000-4000-8000-000000000091','Correction','ccb_debit','NZD');
      insert into account_statements(account_id,preview_token) values('00000000-0000-4000-8000-000000000091',gen_random_uuid());
      update spending_accounts set source_format='bnz' where id='00000000-0000-4000-8000-000000000091';
      do $$begin if exists(select 1 from account_statements where preview_token is not null or expires_at>now()) then raise exception 'Draft not invalidated';end if;end$$;
      rollback;`);
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
      account_number_last4: row_number === 2 ? "0001" : "1234",
      counterparty_account_last4: row_number === 2 ? "0002" : null,
      counterparty_name: row_number === 2 ? "测试对方" : null,
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
          parser_version: "bank-csv-2",
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
    assert.equal(q({ accountNumberLast4: "0001", counterpartyAccountLast4: "0002", q: "EXAMP" }).pagination.total, 1);
    assert.equal(q({ accountNumberLast4: "0001" }).totals[0].gross_spending, "20.000000");
    assert.equal(q({ accountNumberLast4: "0001" }).rows[0].counterparty_name, "测试对方");
    assert.equal(q({ q: "%" }).pagination.total, 0);
    assert.equal(q({ q: "_" }).pagination.total, 0);
    const opts = JSON.parse(sql(`select spending_filter_options('${a}')`));
    assert.deepEqual(opts.accountNumberLast4, ["0001", "1234"]);
    assert.deepEqual(opts.counterpartyAccountLast4, ["0002"]);
    assert.deepEqual(JSON.parse(sql(`select spending_filter_options('${nz}')`)).accountNumberLast4, []);
    assert.equal(sql(`select total_count from spending_statement_details where id='${b.id}'`), "6");
    const report = q();
    assert.equal(q({ offset: 4 }).pagination.hasMore, false);
    assert.equal(q({ offset: 6 }).rows.length, 0);
    assert.equal(q({ offset: 6 }).pagination.total, 6);
    assert.equal(q({ q: "absent" }).pagination.total, 0);
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
    const pending = create([makeRow(2, "-1", "spending", "f".repeat(64))], "6".repeat(64));
    const cancel = (id: string) => `select cancel_spending_import('${id}','${actor}')`;
    assert.equal(sql(cancel(pending.id)), pending.id);
    assert.equal(sql(cancel(pending.id)), pending.id);
    assert.throws(() => sql(command(pending)));
    assert.throws(() => sql(`select set_spending_preview('${pending.id}','{}','${actor}')`));
    assert.throws(() => sql(`update account_statements set source_file_key='late.pdf' where id='${pending.id}'`));
    assert.equal(sql(cancel(expired.id)), expired.id);
    const draft = sql(`insert into account_statements(account_id) values('${a}') returning id`);
    assert.equal(sql(cancel(draft)), draft);
    assert.throws(() => sql(cancel(b.id)));
    const race = create([makeRow(2, "-1", "spending", "9".repeat(64))], "7".repeat(64));
    const competing = await Promise.allSettled([
      run(exe("psql"), [...args, "-c", command(race)], { windowsHide: true }),
      run(exe("psql"), [...args, "-c", cancel(race.id)], { windowsHide: true }),
    ]);
    assert.equal(competing.filter(r => r.status === "fulfilled").length, 1);
    const status = sql(`select status from account_statements where id='${race.id}'`);
    assert.equal(sql(`select count(*) from statement_rows where statement_id='${race.id}'`), status === "committed" ? "1" : "0");
    if (status === "committed") sql(`select undo_spending_import('${race.id}','${actor}',false)`);
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
    assert.throws(() => sql(`set role authenticated;select cancel_spending_import('${pending.id}','${actor}')`));
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
      "Spending PostgreSQL: legacy redaction/backfill, suffix/name fields, exact filtered totals, preview/atomic commit/retry, cancellation races, undo isolation, RLS, backup and restore passed.",
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
