import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

// This verification creates only a disposable local cluster. Never use project DB credentials.
const bin = process.env.POSTGRES_BIN ?? (process.platform === "win32" ? "C:/Program Files/PostgreSQL/17/bin" : "");
const exe = (name: string) => bin ? join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
const root = mkdtempSync(join(tmpdir(), "family-ledger-error-db-"));
const cluster = join(root, "data"), sqlFile = join(root, "verify.sql");
let started = false;
async function main() {
  if (bin && !existsSync(exe("initdb"))) throw new Error("Set POSTGRES_BIN to a PostgreSQL server installation.");
  const port = await new Promise<number>(resolvePort => {
    const server = createServer(); server.listen(0, "127.0.0.1", () => { const address = server.address(); const chosen = typeof address === "object" && address ? address.port : 0; server.close(() => resolvePort(chosen)); });
  });
  execFileSync(exe("initdb"), ["-D", cluster, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"], { windowsHide: true, stdio: "pipe" });
  execFileSync(exe("pg_ctl"), ["-D", cluster, "-l", join(root, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { windowsHide: true, stdio: "ignore", timeout: 20000 });
  started = true;
  const args = ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  function run(sql: string) { return execFileSync(exe("psql"), [...args, "-At", "-c", sql], { windowsHide: true, encoding: "utf8", stdio: "pipe" }); }
  writeFileSync(sqlFile, `create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values ('00000000-0000-4000-8000-000000000001');\n`
    + readFileSync("supabase/migrations/202610120001_api_error_tracking.sql", "utf8"));
  execFileSync(exe("psql"), [...args, "-f", sqlFile], { windowsHide: true, stdio: "pipe" });
  const event = (id: string, time: string) => JSON.stringify([{ fingerprint: "fixture", summary: "Network failure", method: "GET", path: "/portfolio-snapshots", operation: "getUserRole", error_code: "ECONNRESET", log_group: "synthetic", log_stream: "synthetic", event_id: id, occurred_at: time, request_id: "fixture-request", legacy: false }]);
  const observe = (id: string, time: string) => `select observe_api_errors('${event(id, time)}'::jsonb);`;
  assert.equal(run(observe("first", "2026-10-01T00:00:00Z")).trim(), "1");
  assert.equal(run(observe("first", "2026-10-01T00:00:00Z")).trim(), "0");
  assert.equal(run("select observed_count from api_error_groups").trim(), "1");
  const group = run("select id from api_error_groups").trim();
  run(`select update_api_error_status('${group}', 'resolved', 'Fixed connection', '00000000-0000-4000-8000-000000000001')`);
  assert.equal(run(observe("old", "2026-09-30T00:00:00Z")).trim(), "1");
  assert.equal(run("select status || ':' || recurring from api_error_groups").trim(), "resolved:false");
  assert.equal(run(observe("new", "2099-01-01T00:00:00Z")).trim(), "1");
  assert.equal(run("select status || ':' || recurring from api_error_groups").trim(), "open:true");
  run(`select update_api_error_status('${group}', 'in_progress', 'Investigating', '00000000-0000-4000-8000-000000000001')`);
  assert.equal(run("select status || ':' || notes from api_error_groups").trim(), "in_progress:Investigating");
  const concurrentSql = observe("concurrent", "2099-01-02T00:00:00Z");
  const concurrent = () => new Promise<string>((resolveResult, reject) => {
    const child = spawn(exe("psql"), [...args, "-At", "-c", concurrentSql], { windowsHide: true });
    let stdout = "", stderr = ""; child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject); child.on("close", code => code === 0 ? resolveResult(stdout.trim()) : reject(new Error(stderr)));
  });
  assert.deepEqual((await Promise.all([concurrent(), concurrent()])).sort(), ["0", "1"]);
  assert.equal(run("select observed_count from api_error_groups").trim(), "4");
  assert.equal(run("select count(*) from api_error_events").trim(), "4");
  for (const role of ["anon", "authenticated"]) {
    assert.throws(() => run(`set role ${role}; select * from api_error_groups`));
    assert.throws(() => run(`set role ${role}; ${observe("blocked", "2026-10-01T00:00:00Z")}`));
  }
  assert.throws(() => run(`select update_api_error_status('${group}', 'invalid', '', null)`));
  assert.throws(() => run(`select update_api_error_status('${group}', 'open', repeat('x',2001), null)`));
  assert.equal(run("select observed_count from api_error_groups").trim(), "4");
  console.log("Error tracking DB: migration, deduplication, concurrent observation, recurrence, status, constraints and access checks passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (started && existsSync(join(cluster, "postmaster.pid"))) execFileSync(exe("pg_ctl"), ["-D", cluster, "-m", "immediate", "-w", "stop"], { windowsHide: true, stdio: "ignore", timeout: 20000 });
  const absoluteRoot = resolve(root), allowedRoot = resolve(tmpdir());
  if (absoluteRoot.startsWith(allowedRoot + (process.platform === "win32" ? "\\" : "/")) && absoluteRoot.includes("family-ledger-error-db-")) rmSync(absoluteRoot, { recursive: true, force: true });
});
