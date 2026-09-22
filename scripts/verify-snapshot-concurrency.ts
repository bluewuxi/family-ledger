import assert from "node:assert/strict";
import { spawn } from "node:child_process";

// Deliberately restricted to the disposable local rehearsal cluster.
const psql = process.env.PSQL_PATH ?? "C:/Program Files/PostgreSQL/17/bin/psql.exe";
const args = ["-X", "-h", "127.0.0.1", "-p", "55439", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
function run(sql: string, onOutput?: (output: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, args, { windowsHide: true });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); onOutput?.(output); });
    child.stderr.on("data", (chunk: Buffer) => { error += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(error)));
    child.stdin.end(sql);
  });
}
function write(amount: string): string {
  return `select public.upsert_portfolio_snapshot(jsonb_build_object(
    'snapshotDate','2099-07-01','usdToNzdRate','1.6','usdToCnyRate','7','accounts',
    jsonb_build_array(jsonb_build_object('accountId',(select id from public.investment_accounts order by id limit 1),
    'accountName','Concurrency fixture','marketValueUsd','${amount}','costUsd','0',
    'unrealizedGainUsd','${amount}','dailyChangeUsd','0','dailyChangePct',null,'warnings','[]'::jsonb))));`;
}
async function main() {
  let ready!: () => void;
  const locked = new Promise<void>((resolve) => { ready = resolve; });
  const first = run(`begin; ${write("100")} select 'LOCK_READY'; select pg_sleep(2); commit;`, (out) => {
    if (out.includes("LOCK_READY")) ready();
  });
  await Promise.race([locked, first.then(() => { throw new Error("Lock marker missing"); })]);
  const [one, two] = await Promise.all([first, run(write("300"))]);
  const uuid = /[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/;
  assert.equal(one.match(uuid)?.[0], two.match(uuid)?.[0], "Concurrent writes retain one ID");
  const totals = await run("select total_market_value_usd from public.portfolio_snapshots where snapshot_date='2099-07-01'; select count(*) from public.portfolio_account_snapshots where snapshot_date='2099-07-01';");
  assert.deepEqual(totals.trim().split(/\r?\n/), ["300.000000", "1"]);
  await run("delete from public.portfolio_snapshot_headers where snapshot_date='2099-07-01';");
  console.log("Concurrent snapshot replacement: passed");
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
