import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";
async function main() {
 const storage = () => { const data: Record<string,string>={}; return new Proxy({getItem:(key:string)=>data[key]??null,setItem:(key:string,value:string)=>{data[key]=value;},removeItem:(key:string)=>{delete data[key];}}, {ownKeys:()=>Object.keys(data),getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})}); };
 const events=new EventTarget(); const sessionStorage=storage(); const localStorage=storage();
 const fakeWindow={sessionStorage,localStorage,dispatchEvent:events.dispatchEvent.bind(events),addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
 let heldPath: string | null = null; let release: (() => void) | null = null;
 let failSession=false; const requests: Array<{url:string;body?:string;headers?:Record<string,string>}>=[];
 const fetcher=async (url:string,options?:{body?:string;headers?:Record<string,string>})=> {
  requests.push({url,...options});
  if (heldPath && url.endsWith(heldPath)) await new Promise<void>(resolve => { release = resolve; });
  if(url.endsWith('config.json')) return {status:404,ok:false,headers:{get:()=>''},json:async()=>({})};
  if(failSession && url.endsWith('/auth/session')) return {status:503,ok:false,json:async()=>({success:false,error:{code:'DEPENDENCY_UNAVAILABLE'}})};
  if(url.endsWith('/auth/login')) return {status:200,ok:true,json:async()=>({success:true,data:{token:'opaque-token',expiresAt:new Date(Date.now()+3600000).toISOString(),mustChangePassword:true}})};
  return {status:200,ok:true,json:async()=>({success:true,data:{user:{id:'one',email:'one@example.com',role:'viewer'},expiresAt:new Date(Date.now()+3600000).toISOString(),mustChangePassword:true}})};
 };
 const result=await build({stdin:{contents:'export * from "./src/lib/authClient"; export {initializeRuntimeConfig} from "./src/lib/runtimeConfig";',resolveDir:resolve('apps/web')},bundle:true,write:false,platform:'browser',format:'cjs',define:{'import.meta.env':JSON.stringify({VITE_API_BASE_URL:"https://api.example.com",BASE_URL:"/"})}});
 const module={exports:{} as any}; new Function('module','exports','window','fetch',result.outputFiles[0].text)(module,module.exports,fakeWindow,fetcher);
 const auth=module.exports; await auth.initializeRuntimeConfig();
 localStorage.setItem('sb-old-auth-token','secret'); sessionStorage.setItem('sb-old-auth-token-user','secret');
 auth.clearLegacyAuthStorage(); assert.equal(localStorage.getItem('sb-old-auth-token'),null); assert.equal(sessionStorage.getItem('sb-old-auth-token-user'),null);
 const session=await auth.login('one@example.com','password123'); assert.equal(session.mustChangePassword,true); assert.equal(auth.getCurrentSession().user.id,'one');
 assert.equal(localStorage.getItem('family-ledger:session'),null); assert.match(sessionStorage.getItem('family-ledger:session')!,/opaque-token/);
 failSession=true; await assert.rejects(auth.loadSession()); assert.notEqual(sessionStorage.getItem('family-ledger:session'),null); failSession=false;
 await auth.changePassword('password123','password456'); assert.equal(auth.getCurrentSession(),null); assert.equal(sessionStorage.getItem('family-ledger:session'),null);
 assert.ok(requests.every(request=>!request.url.includes('opaque-token')&&!request.url.includes('password123')));
 assert.equal(requests.filter(request=>request.url.endsWith('/auth/change-password')).length,1);
 for (const path of ['/auth/logout','/auth/change-password']) {
  await auth.login('one@example.com','password123');
  heldPath=path;
  const operation = path === '/auth/logout' ? auth.logout() : auth.changePassword('password123','password456');
  await Promise.resolve();
  assert.ok(release,'Expected a deferred auth response');
  await auth.login('two@example.com','password789');
  const replacement=auth.getCurrentSession();
  const finish=release as () => void; release=null; heldPath=null; finish();
  assert.equal(await operation,false,'A stale operation must not trigger login navigation');
  assert.equal(auth.getCurrentSession(),replacement,'An older auth mutation must preserve the newer login');
 }
 console.log('Frontend auth storage, restricted state, 503 retention, password-change cleanup, and no mutation replay passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
