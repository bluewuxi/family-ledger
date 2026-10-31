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
 let restricted=false,missing=false,outage=false,rateAllowed=true,role:"viewer"|"admin"="viewer";
 let privateReads=0;
 AuthStateRepository.prototype.getSession=async()=>{
  if(outage) throw new Error("internal-storage-detail-sensitive");
  if(missing) return null;
  return {userId,credentialVersion:1,purpose:restricted ? "password_change" : "full",expiresAt:Math.floor(Date.now()/1000)+600};
 };
 AuthStateRepository.prototype.getCredential=async()=>({credentialVersion:1,mustChangePassword:restricted,temporaryPasswordExpiresAt:restricted ? Math.floor(Date.now()/1000)+3600 : null,
 verifier:{algorithm:"scrypt",version:1,N:131072,r:8,p:1,salt:"00".repeat(16),hash:"00".repeat(64)},updatedAt:new Date().toISOString(),lastSignInAt:null});
 AuthStateRepository.prototype.consumeAttempt=async()=>rateAllowed;
 globalThis.fetch=async input=>{
  const url=String(input instanceof Request ? input.url : input);
  if(url.includes('/app_users')) return new Response(JSON.stringify({id:userId,email:"fixture@example.invalid",created_at:"2026-01-01T00:00:00Z"}),{status:200,headers:{"content-type":"application/json"}});
  if(url.includes('/user_roles')) return new Response(JSON.stringify({role}),{status:200,headers:{"content-type":"application/json"}});
  privateReads++;throw new Error("Unexpected private-data fixture request");
 };
 const check=async(method:string,path:string,status:number,code?:string,input:{token?:string;body?:string}={})=>{
  const result=await handler(event(method,path,input));
  assert.equal(result.statusCode,status,`${method} ${path}: ${result.body}`);
  if(code) assert.equal(JSON.parse(result.body!).error.code,code,`${method} ${path}`);
  assert.equal(result.headers?.['cache-control'],'no-store');
  return result;
 };
 await check('GET','/me',401,'UNAUTHORIZED');
 await check('GET','/auth/session',401,'UNAUTHORIZED');
 missing=true;await check('GET','/auth/session',401,'UNAUTHORIZED',{token});missing=false;
 await check('GET','/me',401,'UNAUTHORIZED',{token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvbGQifQ.legacy-signature'});
 for(const [method,path] of [['GET','/auth/login'],['PUT','/auth/logout'],['POST','/auth/session'],['GET','/auth/change-password']]) {
  await check(method,path,404,'NOT_FOUND',{token});
 }
 await check('POST','/auth/login',413,'VALIDATION_ERROR',{body:JSON.stringify({email:'fixture@example.invalid',password:'x'.repeat(8192)})});
 await check('POST','/auth/login',400,'VALIDATION_ERROR',{body:'{"broken"'});
 await check('POST','/auth/login',400,'VALIDATION_ERROR',{body:'[]'});
 restricted=true;
 const restrictedResult=await check('GET','/auth/session',200,undefined,{token});
 assert.equal(JSON.parse(restrictedResult.body!).data.mustChangePassword,true);
 for(const [method,path,body] of [['GET','/me',undefined],['GET','/settings/preferences',undefined],['POST',`/accounts/${targetId}/trading-password/reveal`,JSON.stringify({extraPassword:'fixture-password'})],['GET','/users',undefined]]) {
  await check(method,path,403,'PASSWORD_CHANGE_REQUIRED',{token,body});
 }
 assert.equal(privateReads,0,'Restricted sessions must fail before private-data queries');
 restricted=false;
 await check('POST',`/settings/users/${targetId}/reset-password`,403,'FORBIDDEN',{token,body:JSON.stringify({adminPassword:'fixture-password',temporaryPassword:'temporary-password'})});
 const full=await check('GET','/auth/session',200,undefined,{token});assert.equal(JSON.parse(full.body!).data.user.role,'viewer');
 rateAllowed=false;
 const rate=await check('POST','/auth/login',429,'RATE_LIMITED',{body:JSON.stringify({email:'fixture@example.invalid',password:'fixture-password'})});
 const retry=Number(rate.headers?.['retry-after']);assert.ok(retry>0 && retry<=900);
 rateAllowed=true;outage=true;
 const unavailable=await check('GET','/auth/session',503,'DEPENDENCY_UNAVAILABLE',{token});
 assert.ok(!unavailable.body?.includes('internal-storage-detail-sensitive'));
 assert.ok(!unavailable.body?.includes('stack'));
 assert.equal(privateReads,0);
 role='admin';outage=false;
 await check('GET','/auth/session',200,undefined,{token});
 original.info('Auth handler fixtures passed: endpoint methods, body bounds, restricted sessions, roles, missing/legacy sessions, throttling and sanitized outages. No live services used.');
}
main().catch(error=>{original.error(error);process.exitCode=1;}).finally(()=>{
 globalThis.fetch=original.fetch;SSMClient.prototype.send=original.ssm;AuthStateRepository.prototype.getSession=original.getSession;
 AuthStateRepository.prototype.getCredential=original.getCredential;AuthStateRepository.prototype.consumeAttempt=original.consume;
 console.warn=original.warn;console.error=original.error;console.info=original.info;
 for(const key of envKeys){const value=oldEnv.get(key);if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
