import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const bin = process.env.POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/17/bin";
const exe = (name: string) => join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
const root = mkdtempSync(join(tmpdir(), "ledger-opening-balance-"));
const cluster = join(root, "data");
let started = false;
async function main() {
  const port = await new Promise<number>(resolve => {
    const server = createServer(); server.listen(0, "127.0.0.1", () => { const address = server.address(); const port = typeof address === "object" && address ? address.port : 0; server.close(() => resolve(port)); });
  });
  execFileSync(exe("initdb"), ["-D", cluster, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"], { windowsHide: true, stdio: "pipe" });
  execFileSync(exe("pg_ctl"), ["-D", cluster, "-l", join(root, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { windowsHide: true, stdio: "ignore", timeout: 20000 });
  started = true;
  const args = ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
  const sql = (text: string) => execFileSync(exe("psql"), args, { input: text, encoding: "utf8", windowsHide: true, stdio: "pipe" }).trim();
  sql("create table public.transactions(id text primary key, account_id text not null, instrument_id text not null, transaction_type text not null);");
  const migration = readFileSync("supabase/migrations/202610120002_single_account_opening_balance.sql", "utf8");
  sql(migration); sql(migration);
  sql("insert into transactions values ('one','account','NZD','opening_balance'), ('two','other','NZD','opening_balance'), ('deposit','account','NZD','deposit');");
  assert.throws(() => sql("insert into transactions values ('duplicate','account','USD','opening_balance');"));
  assert.throws(() => sql("update transactions set transaction_type='opening_balance' where id='deposit';"));
  assert.throws(() => sql("update transactions set account_id='account' where id='two';"));
  sql("update transactions set instrument_id='USD' where id='one';");
  assert.equal(sql("select count(*) from transactions;"), "3");
  console.log("Opening balance database migration, idempotency, duplicate creates, type/account changes and same-record edits passed.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Verification failed."); process.exitCode = 1; }).finally(() => {
  if (started) execFileSync(exe("pg_ctl"), ["-D", cluster, "-m", "immediate", "-w", "stop"], { windowsHide: true, stdio: "ignore" });
  rmSync(root, { recursive: true, force: true });
});
