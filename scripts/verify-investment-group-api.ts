import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { SSMClient } from "@aws-sdk/client-ssm";
import { AuthStateRepository } from "../apps/api/src/repositories/authStateRepository";
import { handler } from "../apps/api/src/handlers/lambda";

const userId="00000000-0000-4000-8000-000000000001";
const targetId="00000000-0000-4000-8000-000000000002";
const token=Buffer.alloc(32).toString("base64url");
const original={fetch:globalThis.fetch,ssm:SSMClient.prototype.send,getSession:AuthStateRepository.prototype.getSession,
 getCredential:AuthStateRepository.prototype.getCredential,consume:AuthStateRepository.prototype.consumeAttempt,
 warn:console.warn,error:console.error,info:console.info};
const envKeys=["SUPABASE_URL","SUPABASE_SECRET_KEY_SSM_PARAM","AWS_REGION","AUTH_TABLE_NAME","FAMILY_LEDGER_LOCAL_AUTH_BYPASS"] as const;
const oldEnv=new Map(envKeys.map(key=>[key,process.env[key]]));
function event(method:string,path:string,input:{token?:string;body?:string}={}):APIGatewayProxyEventV2 {
 return {version:"2.0",routeKey:"$default",rawPath:path,rawQueryString:"",headers:input.token ? {authorization:`Bearer ${input.token}`} : {},body:input.body,isBase64Encoded:false,
 requestContext:{accountId:"fixture",apiId:"fixture",domainName:"fixture.invalid",domainPrefix:"fixture",http:{method,path,protocol:"HTTP/1.1",sourceIp:"192.0.2.1",userAgent:"auth-route-fixture"},requestId:"auth-route-fixture",routeKey:"$default",stage:"$default",time:"",timeEpoch:Date.now()}};
}
async function main() {
 process.env.SUPABASE_URL="https://fixture.supabase.co";process.env.SUPABASE_SECRET_KEY_SSM_PARAM="/fixture/key";
 process.env.AWS_REGION="ap-southeast-2";process.env.AUTH_TABLE_NAME="fixture-auth";process.env.FAMILY_LEDGER_LOCAL_AUTH_BYPASS="false";
 console.warn=()=>{};console.error=()=>{};console.info=()=>{};
 SSMClient.prototype.send=(async()=>({Parameter:{Value:"fixture-service-key"}})) as typeof SSMClient.prototype.send;
 const missing=false,outage=false,rateAllowed=true;
 let restricted=false,role:"viewer"|"admin"="viewer";
 let rpcError:string|null=null;const targetHasRole=true;
 let groupFailure=false;let configured=false;let valuationReads=0;
 let scopeMode: "all" | "selected" = "all"; const scopeRevision=0,scopeMissing=false,scopeOutage=false;
 let assertScoped=false; let investmentFixture=false;
 AuthStateRepository.prototype.getSession=async()=>{
  if(outage) throw new Error("internal-storage-detail-sensitive");
  if(missing) return null;
  return {userId,credentialVersion:1,purpose:restricted ? "password_change" : "full",expiresAt:Math.floor(Date.now()/1000)+600};
 };
 AuthStateRepository.prototype.getCredential=async()=>({credentialVersion:1,mustChangePassword:restricted,temporaryPasswordExpiresAt:restricted ? Math.floor(Date.now()/1000)+3600 : null,
 verifier:{algorithm:"scrypt",version:1,N:131072,r:8,p:1,salt:"00".repeat(16),hash:"00".repeat(64)},updatedAt:new Date().toISOString(),lastSignInAt:null});
 AuthStateRepository.prototype.consumeAttempt=async()=>rateAllowed;
 globalThis.fetch=async (input,init)=>{
  const url=String(input instanceof Request ? input.url : input);
  if(url.includes('/rpc/read_investment_group_configuration'))return new Response(JSON.stringify(groupFailure ? {code:'55000',message:'secret internals'} : {revision:'0',groups:configured?[{id:'00000000-0000-4000-8000-000000000099',name:'Hidden only',instrumentIds:['00000000-0000-4000-8000-000000000098']}]:[]}),{status:groupFailure?400:200,headers:{'content-type':'application/json'}});
  if(url.includes('/rpc/write_investment_group')) {
    const body=JSON.parse(String(init?.body));assert.equal(body.actor_id,userId);assert.equal(body.expected_revision,'0');assert(!('scope_key' in body));
    return new Response(JSON.stringify(rpcError?{code:rpcError,message:'secret internals'}:{revision:'1',group:body.operation==='delete'?null:{id:targetId,name:body.group_name,instrumentIds:body.member_ids}}),{status:rpcError?400:200,headers:{'content-type':'application/json'}});
  }
  if(url.includes('/app_users')) return new Response(JSON.stringify({id:userId,email:"fixture@example.invalid",created_at:"2026-01-01T00:00:00Z"}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes('/user_roles')) return new Response(JSON.stringify(!targetHasRole && new URL(url).searchParams.get('user_id')===`eq.${targetId}` ? null : {role,user_id:userId,is_active:true,access_revision:0}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes('/rpc/update_managed_access')) return new Response(JSON.stringify({code:rpcError,message:'fixture'}),{status:400,headers:{"content-type":"application/json"}});
  if(url.includes('/rpc/read_account_scope')) return new Response(JSON.stringify(scopeMissing ? null : {userId,revision:scopeRevision,scope:scopeMode==='all' ? {mode:'all'} : {mode:'selected',resources:[{kind:'ledger',id:targetId}]}}),{status:scopeOutage ? 503 : 200,headers:{"content-type":"application/json"}});
  if(url.includes('/investment_accounts')) {
   const parsed=new URL(url);
   if(parsed.searchParams.get('purpose')==='eq.education') return new Response('[]',{headers:{"content-type":"application/json"}});
   if(parsed.searchParams.getAll('id').some(value=>value.startsWith('eq.') && value!==`eq.${targetId}`)) return new Response('null',{headers:{"content-type":"application/json"}});
   if(assertScoped) assert.equal(parsed.searchParams.get('id'),`in.(${targetId})`);
   return new Response(JSON.stringify([{id:targetId,name:'Visible',purpose:'investment',account_type:'brokerage',base_currency:'USD',transactions:[]}]),{headers:{"content-type":"application/json"}});
  }
  if(investmentFixture && url.includes('/rpc/latest_valuation_rates_to_usd_for_dates')) {assert.notEqual(new URL(url).searchParams.get('from_currencies'),'null','GET RPC must omit absent array arguments');return new Response('[]',{headers:{"content-type":"application/json"}});}
  if(investmentFixture && url.includes('/instruments')) return new Response(JSON.stringify([{id:targetId,symbol:'CASH_USD',name:'USD',short_name:'USD',currency:'USD',asset_type:'cash',market_region:'US',exchange:'CASH',notes:'private note'}]),{headers:{"content-type":"application/json"}});
  if(investmentFixture && url.includes('/transactions')) {
   valuationReads++;
   assert.equal(new URL(url).searchParams.get('account_id'),`in.(${targetId})`);
   return new Response(JSON.stringify([{id:targetId,account_id:targetId,instrument_id:targetId,transaction_type:'opening_balance',transaction_source:'manual',trade_date:'2026-01-01',gross_amount:'100',fee:'0',tax:'0',currency:'USD',quantity:null,price:null,linked_transaction_id:null}]),{headers:{"content-type":"application/json","content-range":"0-0/1"}});
  }
  if(investmentFixture && url.includes('/portfolio_snapshot_headers')) {
   const parsed=new URL(url);assert.equal(parsed.searchParams.get('portfolio_account_snapshots.account_id'),`in.(${targetId})`);
   return new Response(JSON.stringify([{id:targetId,snapshot_date:'2026-01-01',usd_to_nzd_rate:'1.6',usd_to_cny_rate:'7'}]),{headers:{"content-type":"application/json"}});
  }
  if(investmentFixture && url.includes('/portfolio_account_snapshots')) {
   assert.equal(new URL(url).searchParams.get('account_id'),`in.(${targetId})`);
   return new Response(JSON.stringify([{id:targetId,portfolio_snapshot_id:targetId,snapshot_date:'2026-01-01',account_id:targetId,account_name:'Visible',market_value_usd:'100',cost_usd:'100',unrealized_gain_usd:'0',daily_change_usd:'0',daily_change_pct:'0',warnings:[]}]),{headers:{"content-type":"application/json"}});
  }
  throw new Error("Unexpected private-data fixture request");
 };

 const check=async(method:string,path:string,status:number,body?:unknown)=>{const result=await handler(event(method,path,{token,body:body===undefined?undefined:JSON.stringify(body)}));assert.equal(result.statusCode,status,result.body);assert(!result.body?.includes('secret internals'));return JSON.parse(result.body!);};
 await check('GET','/investment-groups',403);
 role='admin';assert.deepEqual((await check('GET','/investment-groups',200)).data,{revision:'0',groups:[]});
 await check('POST','/investment-groups',400,{name:' ',instrumentIds:[],expectedRevision:'0'});
 await check('POST','/investment-groups',201,{name:'Empty',instrumentIds:[],expectedRevision:'0'});
 await check('PUT','/investment-groups/'+targetId,200,{name:'Changed',instrumentIds:[],expectedRevision:'0'});
 await check('DELETE','/investment-groups/'+targetId,200,{expectedRevision:'0'});
 rpcError='40001';await check('POST','/investment-groups',409,{name:'Test',instrumentIds:[],expectedRevision:'0'});
 rpcError='55000';await check('DELETE','/investment-groups/'+targetId,503,{expectedRevision:'0'});
 groupFailure=true;await check('GET','/investment-groups',503);
 restricted=true;await check('GET','/investment-groups',403);restricted=false;
 role='viewer';investmentFixture=true;scopeMode='selected';assertScoped=true;
 const e=event('GET','/dashboard',{token});e.queryStringParameters={currency:'USD',quoteMode:'cached'};
 const result=await handler(e);assert.equal(result.statusCode,200,result.body);
 const dashboard=JSON.parse(result.body!).data.dashboard;assert.equal(dashboard.totalAssets,'100.00');assert.equal(dashboard.groupDistribution.status,'unavailable');assert.equal(dashboard.holdingAllocations.length,1);
 groupFailure=false;configured=true;const readsBefore=valuationReads;const ready=JSON.parse((await handler(e)).body!).data.dashboard;
 assert.equal(valuationReads-readsBefore,1,'Grouping must not run another valuation pass');assert.equal(ready.groupDistribution.rows.length,1,'Hidden-only group and members must not leak');
 assert.equal(ready.groupDistribution.status,'ready');assert.equal(ready.groupDistribution.rows[0].id,'cash');assert.deepEqual(ready.groupDistribution.rows[0].members,[]);
 const {groupDistribution:_a,...a}=dashboard,{groupDistribution:_b,...b}=ready;delete a.valuationMetadata;delete b.valuationMetadata;assert.deepEqual(a,b);
 original.info('Investment group API: admin authorization, restricted sessions, validation, sanitized 409/503, dashboard failure isolation and scoped cash passed.');
}
main().catch(error=>{original.error(error);process.exitCode=1;}).finally(()=>{
 globalThis.fetch=original.fetch;SSMClient.prototype.send=original.ssm;AuthStateRepository.prototype.getSession=original.getSession;
 AuthStateRepository.prototype.getCredential=original.getCredential;AuthStateRepository.prototype.consumeAttempt=original.consume;
 console.warn=original.warn;console.error=original.error;console.info=original.info;
 for(const key of envKeys){const value=oldEnv.get(key);if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
