import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import dotenv from 'dotenv';
import {aws,stackName} from './deployment-runtime';
import {getSupabaseAdmin} from '../apps/api/src/db/supabaseServer';
import {AuthStateRepository} from '../apps/api/src/repositories/authStateRepository';
import {hashPassword} from '../apps/api/src/auth/password';
import {hashSessionToken} from '../apps/api/src/auth/sessionToken';
async function main(){
 if(!process.argv.includes('--apply'))throw new Error('Synthetic TEST writes require --apply.');
 dotenv.config({path:'.env.test',quiet:true});
 const stack=aws<{Stacks:{Outputs:{OutputKey:string;OutputValue:string}[]}[]}>(['cloudformation','describe-stacks','--stack-name',stackName]).Stacks[0];
 const table=stack.Outputs.find(o=>o.OutputKey==='AuthTableName')!.OutputValue;
 const db=await getSupabaseAdmin();const auth=new AuthStateRepository(table);
 const id=randomUUID(), email=`auth-check-${id}@example.invalid`, password=randomUUID()+randomUUID();
 writeFileSync('.local/auth-migration/synthetic-check.json',JSON.stringify({id,email,table}));
 const tokens:string[]=[];
 try {
  const {error:ue}=await db.from('app_users').insert({id,email});if(ue)throw new Error('Synthetic identity create failed.');
  const {error:re}=await db.from('user_roles').insert({user_id:id,role:'viewer',is_active:true});if(re)throw new Error('Synthetic role create failed.');
  const start=performance.now();
  const credential={verifier:await hashPassword(password),credentialVersion:1,mustChangePassword:false,temporaryPasswordExpiresAt:null,lastSignInAt:null,updatedAt:new Date().toISOString()};
  await auth.replaceCredential(id,credential,null);
  const response=await fetch('https://test-fund-api.kidrawer.com/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
  const body=await response.json() as {data?:{token:string};success:boolean};assert.equal(response.status,200);assert.ok(body.data?.token);tokens.push(body.data.token);
  const headers={authorization:`Bearer ${body.data.token}`};
  assert.equal((await fetch('https://test-fund-api.kidrawer.com/auth/session',{headers})).status,200);
  assert.equal((await fetch('https://test-fund-api.kidrawer.com/users',{headers})).status,403);
  const next={...credential,credentialVersion:2};
  const attempts=await Promise.allSettled([auth.replaceCredential(id,next,1),auth.replaceCredential(id,next,1)]);assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await fetch('https://test-fund-api.kidrawer.com/auth/session',{headers})).status,401);
  writeFileSync('.local/auth-migration/live-auth-verification.json',JSON.stringify({passed:true,elapsedMs:Math.round(performance.now()-start),checks:['API runtime IAM login/session','viewer denied admin','real DDB conditional conflict','old session revoked']}));
  console.log('Live TEST synthetic login/session/role/CAS/revocation passed.');
 } finally {
  for(const token of tokens)await auth.deleteSession(hashSessionToken(token));
  aws(['dynamodb','delete-item','--table-name',table,'--key',JSON.stringify({pk:{S:`USER#${id}`}})]);
  const {error}=await db.from('app_users').delete().eq('id',id);if(error)throw new Error('Synthetic SQL cleanup failed; inspect private checkpoint.');
 }
}
main().catch(()=>{console.error('Live TEST verification failed; inspect synthetic checkpoint safely. No passwords or tokens printed.');process.exitCode=1;});
