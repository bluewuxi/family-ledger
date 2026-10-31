import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import dotenv from 'dotenv';
import {aws,region} from './deployment-runtime';
dotenv.config({path:'.env.test',quiet:true});
const password=aws<{Parameter:{Value:string}}>(['ssm','get-parameter','--name',process.env.SUPABASE_DB_PASSWORD_SSM_PARAM!,'--with-decryption']).Parameter.Value;
const bin='C:/Program Files/PostgreSQL/17/bin/';
const args=['-h',process.env.SUPABASE_DB_HOST!,'-p',process.env.SUPABASE_DB_SESSION_PORT!,'-U',process.env.SUPABASE_DB_USER!,'-d',process.env.SUPABASE_DB_NAME!];
const env={...process.env,PGPASSWORD:password,PGSSLMODE:'require'};
const sql=(input:string)=>execFileSync(bin+'psql.exe',[...args,'-X','-qAt','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true,env,stdio:['pipe','pipe','pipe']}).trim();
mkdirSync('.local/auth-migration',{recursive:true});
try {
 const identities=JSON.parse(sql("select coalesce(json_agg(t),'[]') from (select u.id,lower(trim(u.email)) email,u.created_at,r.role,r.is_active from auth.users u left join public.user_roles r on r.user_id=u.id order by u.id)t;"));
 const schema=sql("select json_build_object('app_users',to_regclass('public.app_users'),'activation',to_regprocedure('public.activate_first_app_admin(uuid,bigint)'),'backup_function',to_regprocedure('public.export_ledger_backup(uuid)'));");
 writeFileSync('.local/auth-migration/test-identities.json',JSON.stringify(identities,null,2));
 writeFileSync('.local/auth-migration/test-schema-preflight.json',schema);
 const admins=identities.filter((u:{email:string})=>u.email==='ricky.yu@outlook.com');if(admins.length!==1)throw new Error('Unique expected admin identity required.');
 if(process.argv.includes('--backup')) {
  execFileSync(bin+'pg_dump.exe',[...args,'--schema=public','--format=custom','--file=.local/auth-migration/pre-auth-public.dump'],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});
  const listing=execFileSync(bin+'pg_restore.exe',['--list','.local/auth-migration/pre-auth-public.dump'],{encoding:'utf8',windowsHide:true});
  writeFileSync('.local/auth-migration/pre-auth-public.contents',listing);console.log('Private public-schema backup created; archive directory verified.');
 }
 console.log(`TEST SQL preflight passed; ${identities.length} identities, unique requested administrator. Mapping stored privately.`);
} catch { console.error('TEST SQL preparation failed; no credentials or private rows printed.');process.exitCode=1;}
