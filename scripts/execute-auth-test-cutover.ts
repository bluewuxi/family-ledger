import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import dotenv from 'dotenv';
import {aws,acquireLock,stackName} from './deployment-runtime';
dotenv.config({path:'.env.test',quiet:true});
const root='.local/auth-migration/';
function sql(input:string):string {
 const password=aws<{Parameter:{Value:string}}>(['ssm','get-parameter','--name',process.env.SUPABASE_DB_PASSWORD_SSM_PARAM!,'--with-decryption']).Parameter.Value;
 return execFileSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-h',process.env.SUPABASE_DB_HOST!,'-p',process.env.SUPABASE_DB_SESSION_PORT!,'-U',process.env.SUPABASE_DB_USER!,'-d',process.env.SUPABASE_DB_NAME!,'-X','-qAt','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true,env:{...process.env,PGPASSWORD:password,PGSSLMODE:'require'},stdio:['pipe','pipe','pipe']}).trim();
}
const operation=process.argv[2];
const release=acquireLock(`operator:auth-${operation}:${Date.now()}`);
try {
 if(operation==='maintenance-on') {
  if(existsSync(root+'maintenance.json'))throw new Error('Maintenance snapshot already exists; inspect before retrying.');
  const rows=aws<{StackResourceSummaries:{ResourceType:string;PhysicalResourceId:string}[]}>(['cloudformation','list-stack-resources','--stack-name',stackName]).StackResourceSummaries;
  const functions=rows.filter(r=>r.ResourceType==='AWS::Lambda::Function'&&r.PhysicalResourceId.startsWith('family-ledger-test-')&&!r.PhysicalResourceId.toLowerCase().includes('log-retention')).map(r=>({name:r.PhysicalResourceId,previous:aws<{ReservedConcurrentExecutions?:number}>(['lambda','get-function-concurrency','--function-name',r.PhysicalResourceId]).ReservedConcurrentExecutions??null}));
  writeFileSync(root+'maintenance.json',JSON.stringify(functions));
  for(const f of functions)aws(['lambda','put-function-concurrency','--function-name',f.name,'--reserved-concurrent-executions','0']);
  console.log('TEST API/jobs invocations paused; prior concurrency saved privately.');
 } else if(operation==='maintenance-off') {
  const functions=JSON.parse(readFileSync(root+'maintenance.json','utf8')) as {name:string;previous:number|null}[];
  for(const f of functions) { if(f.previous===null)aws(['lambda','delete-function-concurrency','--function-name',f.name]);else aws(['lambda','put-function-concurrency','--function-name',f.name,'--reserved-concurrent-executions',String(f.previous)]); }
  console.log('Original TEST API/job concurrency restored.');
 } else if(operation==='sql') {
  if(!existsSync(root+'pre-auth-public.dump')||!existsSync(root+'maintenance.json'))throw new Error('Backup and maintenance required.');
  const initial=sql("select to_regclass('public.app_users') is not null;");
  if(initial==='f')sql(readFileSync('supabase/migrations/202610310001_application_users.sql','utf8'));
  if(sql("select to_regprocedure('public.export_ledger_backup_before_decimal_strings(uuid)') is not null;")==='f')sql(readFileSync('supabase/migrations/20261031090000_lossless_ledger_backup.sql','utf8'));
  if(sql("select to_regprocedure('public.export_ledger_backup_before_app_users(uuid)') is not null;")==='f')sql(readFileSync('supabase/migrations/20261031100000_auth_cutover.sql','utf8'));
  if(sql("select to_regprocedure('public.activate_first_app_admin(uuid,bigint)') is not null;")==='f')sql(readFileSync('supabase/migrations/20261031110000_first_admin_activation.sql','utf8'));
  const checks=JSON.parse(sql(`select json_build_object('users',(select count(*) from public.app_users),'old_foreign_keys',(select count(*) from pg_constraint where contype='f' and confrelid='auth.users'::regclass and connamespace='public'::regnamespace),'old_functions',(select count(*) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and prosrc like '%auth.users%'),'private_grants',(select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','PUBLIC')));`));
  if(checks.users!==2||checks.old_foreign_keys!==0||checks.old_functions!==0||checks.private_grants!==0)throw new Error('Post-migration checks failed.');
  writeFileSync(root+'sql-verification.json',JSON.stringify(checks));console.log('TEST identity/cutover/bootstrap migrations and identity/dependency/direct-grant checks passed.');
 } else throw new Error('Unknown operation.');
} catch {console.error('TEST cutover operation failed. Maintenance may remain active; inspect private checkpoint and live state. No private SQL output printed.');process.exitCode=1;} finally {release();}
