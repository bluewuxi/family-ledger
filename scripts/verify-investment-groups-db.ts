import assert from "node:assert/strict";

import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";


async function main() {
  const bin = "C:/Program Files/PostgreSQL/17/bin";
  assert(existsSync(join(bin, "psql.exe")));
  const temporary = mkdtempSync(join(tmpdir(), "investment-groups-pg-")), data = join(temporary, "data");
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


    sql(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key,email text,created_at timestamptz default now());
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`);
    const migrations = readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
    for(const migration of migrations) {

      sql("begin;\n" + readFileSync(join('supabase/migrations',migration),'utf8') + "\ncommit;");
    }


    const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    sql(`insert into app_users(id,email) values ('${id(1)}','groups@example.invalid');insert into user_roles(user_id,role) values('${id(1)}','admin');
      insert into instruments(id,symbol,short_name,name,market_region,exchange,currency,asset_type) values
      ('${id(2)}','TEST','Test','Test','US','TEST','USD','stock'),('${id(3)}','CASH','Cash','Cash','US','CASH','USD','cash'),('${id(4)}','SECOND','Second','Second','US','TEST','USD','stock');`);
    const read=()=>JSON.parse(sql('select read_investment_group_configuration()'));
    const save=(op:string,g:string|null,name:string,ids:string[],rev:string)=>`select write_investment_group('${op}',${g ? "'"+g+"'" : 'null'},'${name.replaceAll("'","''")}',array[${ids.map(i=>"'"+i+"'").join(',')}]::uuid[],'${rev}','${id(1)}')`;
    assert.equal(read().revision,'0');
    const financial=()=>sql(`select md5((select row_to_json(s)::text from ledger_write_state s)||coalesce((select jsonb_agg(s)::text from snapshot_repair_state s),'')||coalesce((select jsonb_agg(s)::text from portfolio_snapshot_headers s),''))`);
    const before=financial();
    const first=JSON.parse(sql(save('create',null,'　中文　',[id(2)],'0')));assert.equal(first.revision,'1');assert.equal(first.group.name,'中文');
    assert.equal(financial(),before);
    assert.throws(()=>sql(save('create',null,'Bad',[id(3)],'1')),/non-cash/);assert.equal(read().revision,'1');
    assert.throws(()=>sql(save('create',null,'中文',[],'1')),/unique/);
    assert.throws(()=>sql(save('create',null,'😀'.repeat(33),[],'1')),/name/);
    const second=JSON.parse(sql(save('create',null,'Case',[],'1')));
    assert.throws(()=>sql(save('create',null,'case',[],'2')),/unique/);
    const run=(q:string)=>new Promise<boolean>(resolve=>execFile(exe('psql'),[...args,'-c',q],{windowsHide:true},error=>resolve(!error)));
    const concurrent=await Promise.all([run(save('update',first.group.id,'First',[id(2)],'2')),run(save('update',second.group.id,'Second',[id(2)],'2'))]);
    assert.equal(concurrent.filter(Boolean).length,1);assert.equal(read().revision,'3');
    sql(save('update',second.group.id,'Second',[id(2)],'3'));assert.equal(read().groups.find((g:{id:string;instrumentIds:string[]})=>g.id===first.group.id).instrumentIds.length,0);
    assert.throws(()=>sql(`update instruments set asset_type='cash' where id='${id(2)}'`),/membership/);
    const snapshot=read();assert.throws(()=>sql('begin;'+save('update',second.group.id,'Rollback',[],'4')+';select 1/0;commit;'),/division by zero/);assert.deepEqual(read(),snapshot);
    sql(`delete from instruments where id='${id(2)}'`);assert.equal(read().revision,'5');assert.equal(read().groups.find((g:{id:string;instrumentIds:string[]})=>g.id===second.group.id).instrumentIds.length,0);
    sql(save('delete',second.group.id,'',[],'5'));assert.equal(read().revision,'6');
    sql("insert into resource_revisions(scope_key,revision) values('investment_groups',0) on conflict do nothing");assert.equal(read().revision,'6');
    assert.throws(()=>sql(`insert into investment_group_members(instrument_id,group_id) values('${id(3)}','${first.group.id}')`),/non-cash/);
    sql(save('create',null,'😀'.repeat(32),[],'6'));assert.equal(read().revision,'7');
    for(const space of ['\t','\n','\r','\u00a0','\u1680','\u2000','\u2028','\u2029','\u202f','\u205f','\u3000','\ufeff'])assert.equal(sql(`select trim_investment_group_name('${space}边界${space}')`),'边界');
    const race=await Promise.all([run(`delete from instruments where id='${id(4)}'`),run(save('update',first.group.id,'Race',[id(4)],'7'))]);assert(race[0]);
    assert.equal(sql(`select count(*) from investment_group_members where instrument_id='${id(4)}'`),'0');
    sql("delete from resource_revisions where scope_key='investment_groups'");assert.throws(()=>read(),/revision/);assert.throws(()=>sql(save('create',null,'Missing',[],'0')),/revision/);
    for(const role of ['anon','authenticated'])assert.equal(sql(`select has_function_privilege('${role}','write_investment_group(text,uuid,text,uuid[],text,uuid)','execute')`),'f');
    console.log('Investment group isolated DB: atomic CRUD, concurrent revision guard, cash constraints, deletion invalidation, rollback, initialization and fail-closed state passed.');
  } finally {
    if(started)execFileSync(exe('pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{windowsHide:true,stdio:'ignore'});
    const target=resolve(temporary),root=resolve(tmpdir());assert(target.startsWith(root+sep)&&target!==root);rmSync(target,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
