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

    sql(`create role anon; create role authenticated; create role service_role;
      create table transactions(id integer, gross_amount numeric(28,6), price numeric(28,10), fee numeric(28,6));
      insert into transactions values(1,12345678901234.123456,999999999999999999.1234567890,null),
        (2,-9999999999999999999999.123456,0,0);
      create function export_ledger_backup(excluded_job_run_id uuid default null) returns jsonb language sql stable as $$
        select jsonb_build_object('transactions',jsonb_agg(to_jsonb(t) order by id)) from transactions t $$;`);
    const migration = readFileSync('supabase/migrations/20261031090000_lossless_ledger_backup.sql','utf8');
    sql(migration);
    const exported = JSON.parse(sql('select export_ledger_backup()'));
    assert.equal(exported.__financial_numeric_encoding,'decimal-strings-v1');
    assert.equal(exported.transactions[0].gross_amount,'12345678901234.123456');
    assert.equal(exported.transactions[0].price,'999999999999999999.1234567890');
    assert.equal(exported.transactions[0].fee,null);
    assert.equal(exported.transactions[1].id,2);
    assert.equal(exported.transactions[1].gross_amount,'-9999999999999999999999.123456');
    assert.equal(exported.transactions[1].price,'0.0000000000');
    const literal = JSON.stringify(exported.transactions).replace(/'/g,"''");
    assert.equal(sql(`select count(*) from transactions t join jsonb_populate_recordset(null::transactions,'${literal}'::jsonb) r using(id) where t.gross_amount=r.gross_amount and t.price=r.price and t.fee is not distinct from r.fee`),'2');
    assert.equal(sql("select has_function_privilege('service_role','export_ledger_backup(uuid)','execute')"),'t');
    for(const role of ['anon','authenticated']) assert.equal(sql(`select has_function_privilege('${role}','export_ledger_backup(uuid)','execute')`),'f');
    assert.equal(sql('select count(*) from transactions'),'2');
    sql('delete from transactions');
    // The real predecessor returns an empty array rather than null.
    sql(`create or replace function export_ledger_backup_before_decimal_strings(excluded_job_run_id uuid default null) returns jsonb language sql stable as $$select jsonb_build_object('transactions','[]'::jsonb)$$;`);
    assert.deepEqual(JSON.parse(sql('select export_ledger_backup()')).transactions,[]);
    console.log('Lossless backup DB verification passed: decimal JSON round-trip, numeric equality, null/zero/sign/order, source preservation and RPC privileges.');
  } finally {
    if(started) execFileSync(exe('pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{windowsHide:true,stdio:'ignore'});
    assert(temporary.startsWith(tmpdir()+sep));
    rmSync(temporary,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
