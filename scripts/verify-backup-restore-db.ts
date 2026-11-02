import { createLedgerBackupObject, prepareLedgerRestoreRows, type LedgerBackupPayload } from "../apps/jobs/src/services/ledgerBackupBundle";
import { normalizeLedgerBackupRows } from "../apps/jobs/src/repositories/ledgerBackupRepository";
import { RESTORE_ORDER } from "../apps/jobs/src/services/ledgerRestoreOrder";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { calculatePortfolioSnapshotValuation, type HoldingSummary, type InvestmentAccount, type ExchangeRateRecord } from "@family-ledger/shared";

async function main() {
  const bin = "C:/Program Files/PostgreSQL/17/bin";
  assert(existsSync(join(bin, "psql.exe")));
  const temporary = mkdtempSync(join(tmpdir(), "backup-restore-pg-")), data = join(temporary, "data");
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

    sql('create database restore_target template postgres');
    const targetArgs = args.map((v,i)=>i>0 && args[i-1]==='-d' ? 'restore_target' : v);
    const targetSql = (input: string) => execFileSync(exe('psql'),targetArgs,{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
    const id = (n: number) => '00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    sql(`insert into app_users(id,email) values('${id(1)}','fixture@example.invalid');
      insert into profiles(id,email) values('${id(1)}','fixture@example.invalid');
      insert into user_roles(user_id,role) values('${id(1)}','admin');
      insert into investment_accounts(id,name,account_type,base_currency,created_by_user_id) values('${id(2)}','Fixture','brokerage','USD','${id(1)}');
      insert into instruments(id,symbol,short_name,name,market_region,exchange,currency,asset_type) values
        ('${id(3)}','CASH','Cash','Cash','US','CASH','USD','cash'),('${id(4)}','TEST','Test','Test','US','TEST','USD','stock');
      insert into transactions(id,account_id,instrument_id,transaction_type,trade_date,gross_amount,currency) values
        ('${id(5)}','${id(2)}','${id(3)}','opening_balance','2026-10-01',12345678901234.123456,'USD');
      insert into transactions(id,account_id,instrument_id,transaction_type,trade_date,quantity,price,gross_amount,currency) values
        ('${id(6)}','${id(2)}','${id(4)}','buy','2026-10-02',2,10,20,'USD');
      insert into transactions(id,account_id,instrument_id,transaction_type,trade_date,gross_amount,currency,transaction_source,linked_transaction_id) values
        ('${id(7)}','${id(2)}','${id(3)}','withdrawal','2026-10-02',20,'USD','generated_cash_leg','${id(6)}');
      insert into exchange_rates(rate_date,from_currency,to_currency,rate,provider) values('2026-10-01','NZD','USD',0.6123456789,'fixture');
      insert into instrument_prices(instrument_id,price_date,close_price,currency,provider) values('${id(4)}','2026-10-02',11,'USD','manual');
      insert into portfolio_snapshot_headers(id,snapshot_date,usd_to_nzd_rate,usd_to_cny_rate) values('${id(8)}','2026-10-02',1.6,7);
      insert into portfolio_account_snapshots(portfolio_snapshot_id,snapshot_date,account_id,account_name,market_value_usd) values('${id(8)}','2026-10-02','${id(2)}','Fixture',12345678901236.123456);
      insert into spending_accounts(id,name,source_format,default_currency) values('${id(9)}','Fixture bank','bnz','NZD');
      insert into statement_rows(account_id,transaction_date,description,amount,classification) values('${id(9)}','2026-10-02','Fixture expense',-12.123456,'spending');
      insert into education_reserve_entries(fund_id,entry_date,entry_type,currency,amount) select id,'2026-10-02','contribution','NZD',100 from education_reserve_funds;
      insert into kernel_nta_refresh_state(instrument_id,pending_snapshot_from) select id,'2026-10-02' from instruments where symbol='KERNEL_SP500_UNHEDGED';`);
    sql(`insert into kernel_price_anchors(id,instrument_id,anchor_date,kernel_unit_price,proxy_symbol,proxy_currency,proxy_close,proxy_price_date,proxy_fetched_at,created_by_user_id,proxy_value_type,proxy_announcement_id,proxy_published_at)
      select '${id(20)}',id,'2026-10-01',6.1234567890,'USF.NZ','NZD',23.1234567890,'2026-10-02','2026-10-02T00:00Z','${id(1)}','nta',101,'2026-10-02T00:00Z' from instruments where symbol='KERNEL_SP500_UNHEDGED';
      insert into kernel_price_anchors(id,instrument_id,anchor_date,kernel_unit_price,proxy_symbol,proxy_currency,proxy_close,proxy_price_date,proxy_fetched_at,created_by_user_id,proxy_value_type,proxy_announcement_id,proxy_published_at,derived_from_anchor_id)
      select '${id(19)}',instrument_id,anchor_date,kernel_unit_price,proxy_symbol,proxy_currency,24,'2026-10-03',proxy_fetched_at,created_by_user_id,'nta',102,proxy_published_at,id from kernel_price_anchors where id='${id(20)}';`);
    sql(`insert into account_statements(account_id,status,source_file_key,source_file_version,source_file_name,source_file_size,file_sha256) values('${id(9)}','document','statements/retained/fixture.pdf','synthetic-version','fixture.pdf',10,repeat('a',64));
      insert into dashboard_instrument_quotes(instrument_id,quote_date,quote_price,currency,provider,fetched_at) values('${id(4)}','2026-10-02',11.1234567890,'USD','fixture','2026-10-02T00:00Z');
      insert into monthly_reviews(month,family_notes,review_status) values('2026-10','Fixture notes','in_progress');
      insert into job_runs(id,job_name,status,job_started_at,triggered_by_user_id) values('${id(30)}','fixture','succeeded','2026-10-02T00:00Z','${id(1)}');
      insert into data_provider_runs(job_run_id,provider,data_kind,status,provider_started_at) values('${id(30)}','fixture','instrument_prices','succeeded','2026-10-02T00:00Z');`);
    sql(`insert into account_ledger_grants values('${id(1)}','${id(2)}'); insert into account_spending_grants values('${id(1)}','${id(9)}'); insert into account_education_grants select '${id(1)}',id from education_reserve_funds;
      insert into account_access_audit(actor_id,target_id,previous_scope,next_scope) values('${id(1)}','${id(1)}','{}','{}');`);
    assert.equal(sql(`select active from instruments where id='${id(4)}'`), 't');
    sql(`update instruments set active=false where id='${id(4)}'`);
    const revision = sql('select get_ledger_write_revision()');
    const parent = JSON.stringify({account_id:id(2),instrument_id:id(3),transaction_type:'deposit',trade_date:'2026-10-02',gross_amount:'42',fee:'0',tax:'0',currency:'USD',transaction_source:'manual',created_at:'2026-10-02T12:00:00Z'});
    const commitIntent = (transactionId: string, fingerprint = 'a'.repeat(64), rev = revision, requestKey=id(31)) => `select commit_transaction_create_idempotent('create','${transactionId}','${rev}','${id(1)}','${parent}'::jsonb,null,null,'[]'::jsonb,true,'${requestKey}','${fingerprint}');`;
    const asyncSql = (input: string) => new Promise<string>((resolve,reject)=>{
      const child=execFile(exe('psql'),args,{encoding:'utf8',windowsHide:true},(error,stdout,stderr)=>error?reject(new Error(stderr)):resolve(stdout.trim()));
      child.stdin!.end(input);
    });
    const pair = await Promise.all([asyncSql(commitIntent(id(32))),asyncSql(commitIntent(id(33)))]);
    assert.equal(pair[0],pair[1], 'Concurrent retries return the identical original result');
    const original = JSON.parse(pair[0]);
    assert.equal(sql(`select count(*) from transactions where id in ('${id(32)}','${id(33)}')`),'1');
    assert.equal(sql(commitIntent(id(34))),pair[0], 'Stale revision replay succeeds after lost response');
    const oldToken=sql('select token::text from snapshot_repair_state where id');
    sql(`insert into exchange_rates(rate_date,from_currency,to_currency,rate,provider) values('2026-10-31','NZD','USD',0.625,'late-fixture')`);
    const repairToken=sql('select token::text from snapshot_repair_state where id');
    assert.notEqual(repairToken,oldToken);
    assert.equal(sql(`select advance_snapshot_repair('${oldToken}',null)`),'f','Old worker cannot clear late FX invalidation');
    const cash=sql(`select sum(case when transaction_type in ('opening_balance','deposit') then gross_amount when transaction_type='withdrawal' then -gross_amount else 0 end)::text from transactions where instrument_id='${id(3)}'`);
    assert.equal(cash,'12345678901256.123456','Concurrent retry changes cash exactly once');
    const holdings=[{accountId:id(2),accountName:'Fixture',instrumentId:id(3),instrumentName:'Cash',currency:'USD',assetType:'cash',quantity:cash,warnings:[]},
      {accountId:id(2),accountName:'Fixture',instrumentId:id(4),instrumentName:'Test',currency:'USD',assetType:'stock',quantity:'2',costAmount:'20',costAmountUsd:'20',warnings:[]}] as unknown as HoldingSummary[];
    const repairValuation=(date:string)=>calculatePortfolioSnapshotValuation({snapshotDate:date,accounts:[{id:id(2),name:'Fixture'}] as InvestmentAccount[],holdings,
      prices:[{id:'price',instrumentId:id(4),priceDate:'2026-10-02',closePrice:'11',currency:'USD',source:'manual',createdAt:'2026-10-02',updatedAt:'2026-10-02',isAdjusted:false}],
      fxRates:[{id:'fx',rateDate:'2026-10-31',fromCurrency:'NZD',toCurrency:'USD',rate:'0.625',rateType:'valuation',provider:'late-fixture',createdAt:'2026-10-31',updatedAt:'2026-10-31'}] as ExchangeRateRecord[]});
    const saveRepaired=(date:string)=>sql(`select upsert_portfolio_snapshot('${JSON.stringify(repairValuation(date))}'::jsonb,'${sql('select get_ledger_write_revision()')}')`);
    saveRepaired('2026-10-31');
    assert.equal(sql(`select advance_snapshot_repair('${repairToken}','2026-11-01')`),'t');
    // Simulated interruption: no in-memory progress is carried into resumed work.
    assert.match(sql(`select snapshot_date from snapshot_maintenance_dates('2026-11-01',30,'2026-10-01') where snapshot_date='2026-11-01'`),/2026-11-01/);
    saveRepaired('2026-11-01');
    assert.equal(sql(`select advance_snapshot_repair('${repairToken}','2026-11-02')`),'t');
    assert.equal(sql(`select market_value_usd::text from portfolio_account_snapshots where account_id='${id(2)}' and snapshot_date='2026-11-01'`),'12345678901278.123456');
    assert.equal(sql(`select usd_to_nzd_rate::text from portfolio_snapshot_headers where snapshot_date='2026-11-01'`),'1.6000000000');
    console.log('Combined concurrent-create, delayed-FX, weekend-boundary repair, stale completion rejection and resumed progress: passed');
    assert.throws(()=>sql(commitIntent(id(34),'b'.repeat(64))), /Idempotency key content conflict/);
    sql(`delete from transactions where id='${original.id}'`);
    assert.equal(sql(commitIntent(id(34))),pair[0], 'Deleted transaction retains its replay tombstone');
    sql(`update user_roles set is_active=false where user_id='${id(1)}'`);
    assert.throws(()=>sql(commitIntent(id(34))),/Active administrator required/);
    sql(`update user_roles set is_active=true where user_id='${id(1)}'`);
    assert.throws(()=>sql(commitIntent(id(34),'c'.repeat(64),'stale',id(35))),/Atomic transaction write failed/);
    assert.equal(sql(`select count(*) from transaction_create_requests where request_key='${id(35)}'`),'0','Failed commit does not reserve a key');
    assert.equal(sql("select has_function_privilege('authenticated','find_transaction_create_replay(uuid,uuid,text)','execute')"),'f');
    const exported = JSON.parse(sql('select export_ledger_backup()'));
    for(const table of RESTORE_ORDER) assert(exported[table].length > 0,table+' fixture must be nonempty');
    const bundle = createLedgerBackupObject({environment:'synthetic',generatedAt:'2026-10-31T00:00:00Z',rows:normalizeLedgerBackupRows(exported)});
    const decoded = JSON.parse(gunzipSync(bundle.body).toString('utf8')) as LedgerBackupPayload;
    const corrupt = structuredClone(decoded); corrupt.manifest.payloadChecksumSha256 = "bad";
    assert.throws(()=>prepareLedgerRestoreRows(corrupt), /checksum/);
    const backupPath = join(temporary,"fixture.json.gz"), normalizedPath = join(temporary,"normalized.json");
    writeFileSync(backupPath,bundle.body);
    execFileSync(process.execPath,[resolve("node_modules/tsx/dist/cli.mjs"),"scripts/restore-backup-dry-run.ts","--file",backupPath,"--output-tables",normalizedPath],{windowsHide:true,stdio:"pipe"});
    const restored = prepareLedgerRestoreRows(decoded);
    assert.deepEqual(JSON.parse(readFileSync(normalizedPath,"utf8")),restored);
    const literal = (v: unknown) => "'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
    const tables = RESTORE_ORDER.join(',');
    targetSql('truncate '+tables+' cascade');

    const inserts = RESTORE_ORDER.map(table => `insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},${literal(restored[table])}) ${table==="account_access_policies" ? "on conflict(user_id) do update set mode=excluded.mode,revision=excluded.revision" : ""};`).join('\n');
    const withoutUsers = inserts.replace(/insert into public.app_users[^\n]+/, '');
    assert.throws(()=>targetSql('begin; set constraints all deferred;'+withoutUsers+' commit;'), /foreign key/);
    assert.equal(targetSql('select count(*) from profiles'),'0');
    // A failure near the end must roll back the entire load.
    assert.throws(()=>targetSql('begin; set constraints all deferred;'+inserts+' select 1/0; commit;'), /division by zero/);
    for(const table of RESTORE_ORDER) assert.equal(targetSql('select count(*) from '+table),'0',table+' must roll back');
    assert.equal(targetSql('select count(*) from transactions'),'0');
    targetSql('begin; set constraints all deferred;'+inserts+' commit;');
    assert.equal(targetSql("select count(*) from pg_constraint where confrelid='auth.users'::regclass and connamespace='public'::regnamespace"),'0');
    for(const role of ['anon','authenticated']) {
      assert.equal(targetSql(`select has_table_privilege('${role}','public.profiles','select')`),'f');
      assert.equal(targetSql(`select has_function_privilege('${role}','export_ledger_backup(uuid)','execute')`),'f');
    }
    assert.equal(targetSql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc like '%auth.users%'"),'0');
    assert.equal(targetSql(`select active from instruments where id='${id(4)}'`), 'f');
    const after = JSON.parse(targetSql('select export_ledger_backup()'));
    for(const table of RESTORE_ORDER) assert.deepEqual(after[table],exported[table],table+' differs after restore');
    assert.equal(targetSql(`select count(*) from transactions where linked_transaction_id='${id(6)}'`),'1');
    assert.equal(targetSql('select count(*) from kernel_nta_refresh_state where pending_snapshot_from is not null'),'1');
    assert.equal(targetSql("select has_function_privilege('authenticated','export_ledger_backup(uuid)','execute')"),'f');
    assert.equal(targetSql("select has_function_privilege('service_role','export_ledger_backup(uuid)','execute')"),'t');
    assert.equal(targetSql('select count(*) from kernel_price_anchors where derived_from_anchor_id is not null'),'1');
    assert.equal(targetSql(`select sum(case when transaction_type='withdrawal' then -gross_amount else gross_amount end)::text from transactions where instrument_id='${id(3)}'`),'12345678901214.123456');
    assert.equal(targetSql(`select sum(quantity)::text from transactions where instrument_id='${id(4)}'`),'2.0000000000');
    assert.equal(targetSql("select sum(market_value_usd)::text from portfolio_account_snapshots where snapshot_date='2026-10-02'"),'12345678901236.123456');
    console.log('Current-format full-table restore passed: '+RESTORE_ORDER.length+' tables, '+migrations.length+' real migrations, version '+decoded.manifest.version+', exact data equality, linked cash, pending state, application identity dependencies, privileges and late-failure rollback.');

  } finally {
    if(started) execFileSync(exe('pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{windowsHide:true,stdio:'ignore'});
    assert(temporary.startsWith(tmpdir()+sep)); rmSync(temporary,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
