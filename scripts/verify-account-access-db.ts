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
  sql(`create role anon; create role authenticated; create role service_role;
    create table app_users(id uuid primary key); create table user_roles(user_id uuid primary key references app_users,role text,is_active boolean,access_revision int default 0);
    create table investment_accounts(id uuid primary key); create table spending_accounts(id uuid primary key); create table education_reserve_funds(id uuid primary key);
    insert into app_users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
    insert into user_roles values ('00000000-0000-0000-0000-000000000001','admin',true,0),('00000000-0000-0000-0000-000000000002','viewer',true,0);
    insert into investment_accounts values ('00000000-0000-0000-0000-000000000003');`);
  sql(readFileSync('supabase/migrations/20261101090000_account_access.sql','utf8'));
  const admin='00000000-0000-0000-0000-000000000001', viewer='00000000-0000-0000-0000-000000000002';
  assert.equal(sql(`select mode from account_access_policies where user_id='${viewer}';`),'selected');
  const replace=(revision:number,scope:unknown)=>`select replace_account_scope('${admin}','${viewer}',${revision},'${JSON.stringify(scope)}'::jsonb);`;
  assert.throws(()=>sql(`select replace_account_scope('${admin}','${viewer}',null,'{"mode":"all"}');`));
  sql(replace(0,{mode:'all'}));
  assert.throws(()=>sql(replace(0,{mode:'selected',resources:[]})));
  assert.equal(sql(`select revision from account_access_policies where user_id='${viewer}';`),'1');
  assert.throws(()=>sql(replace(1,{mode:'selected',resources:[{kind:'ledger',id:admin}]})));
  assert.equal(sql(`select mode from account_access_policies where user_id='${viewer}';`),'all');
  sql(replace(1,{mode:'selected',resources:[{kind:'ledger',id:'00000000-0000-0000-0000-000000000003'}]}));
  assert.equal(sql('select count(*) from account_ledger_grants;'),'1');
  assert.equal(sql('select count(*) from account_access_audit;'),'2');
  assert.throws(()=>sql(`set role authenticated; ${replace(2,{mode:'all'})}`));
  assert.throws(()=>sql(`select replace_account_scope('${admin}','${admin}',0,'{"mode":"all"}');`));
  sql(`update user_roles set role='viewer' where user_id='${admin}';`);
  assert.equal(sql(`select mode from account_access_policies where user_id='${admin}';`),'all');
  assert.throws(()=>sql(replace(2,{mode:'all'})));
  sql(`update user_roles set role='admin' where user_id='${admin}';`);
  sql(`select update_managed_access('${admin}','${viewer}',0,'admin',null,null,null);`);
  assert.equal(sql('select count(*) from account_access_audit;'),'3');
  const revision=Number(sql(`select revision from account_access_policies where user_id='${viewer}';`));
  sql(`select update_managed_access('${admin}','${viewer}',1,'viewer',null,${revision},'{"mode":"selected","resources":[]}');`);
  assert.equal(sql(`select mode||':'||revision from account_access_policies where user_id='${viewer}';`),`selected:${revision+2}`);
  assert.throws(()=>sql(`select update_managed_access('${admin}','${viewer}',1,'admin',null,null,null);`));
  console.log('Account access DB fixtures passed: CAS, FK rollback, audit, grants, demotion and role denial.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Verification failed."); process.exitCode = 1; }).finally(() => {
  if (started) execFileSync(exe("pg_ctl"), ["-D", cluster, "-m", "immediate", "-w", "stop"], { windowsHide: true, stdio: "ignore" });
  rmSync(root, { recursive: true, force: true });
});
