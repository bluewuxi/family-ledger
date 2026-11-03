import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { delimiter } from 'node:path';
import type { VerificationPlan } from './selection';
import { loadRegistry, validateRegistry, type CheckStep } from './registry';
export interface ProcessResult { exitCode:number|null; output:string; timedOut?:boolean }
export interface ProcessAdapter { preflight?(root:string,steps:CheckStep[]):void; run(root:string,step:CheckStep,timeoutMs:number,signal?:AbortSignal):Promise<ProcessResult> }
export interface CheckResult { id:string; status:'passed'|'failed'|'blocked'|'not-run'; durationMs:number; exitCode:number|null; output:string }
export interface VerificationReport { version:1; results:CheckResult[]; exitCode:0|1|2; diagnostics:string[] }
export function executionEnvironment(env:NodeJS.ProcessEnv):NodeJS.ProcessEnv {
  const allowed=new Set(['path','systemroot','windir','temp','tmp','tmpdir','comspec','pathext','lang','lc_all','systemdrive']);
  return Object.fromEntries(Object.entries(env).filter(([k,v])=>allowed.has(k.toLowerCase())&&v!==undefined));
}
function terminate(pid:number):void {
  if(process.platform==='win32') spawnSync(join(process.env.SystemRoot??'C:/Windows','System32/taskkill.exe'),['/pid',String(pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});
  else {try {process.kill(-pid,'SIGKILL');}catch { /* Process may already have exited. */ }}
}
function toolPath(root:string,tool:CheckStep['tool']):string {const require=createRequire(join(root,'package.json'));return require.resolve(tool==='tsx'?'tsx/cli':'typescript/bin/tsc');}
export const nodeProcessAdapter:ProcessAdapter={preflight(root,steps){for(const step of steps)toolPath(root,step.tool);},run(root,step,timeoutMs,signal){
  return new Promise((resolve,reject)=>{
    const tool=toolPath(root,step.tool);
    // pnpm's generated tool shim normally supplies this workspace resolution path.
    // Derive it locally instead of inheriting arbitrary NODE_PATH or preload options.
    const env={...executionEnvironment(process.env),NODE_PATH:[join(root,'node_modules'),join(root,'node_modules/.pnpm/node_modules')].join(delimiter)};
    const child=spawn(process.execPath,[tool,...step.args],{cwd:root,env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
    let output='',timedOut=false;
    const append=(chunk:Buffer)=>{output=(output+chunk.toString()).slice(-128000);};
    child.stdout.on('data',append);child.stderr.on('data',append);
    const stop=()=>{if(child.pid)terminate(child.pid);};
    const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
    signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
    child.once('error',error=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(error);});
    child.once('close',exitCode=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);resolve({exitCode,output,timedOut:timedOut||signal?.aborted});});
  });
}};
export async function runChecks(root:string,plan:VerificationPlan,adapter:ProcessAdapter=nodeProcessAdapter,signal?:AbortSignal):Promise<VerificationReport> {
  const data=loadRegistry(root), diagnostics=validateRegistry(root,data).map(d=>`${d.rule}: ${d.file}: ${d.message}`);
  if(plan.unmappedPaths.length) diagnostics.push(`Unmapped paths: ${plan.unmappedPaths.join(', ')}`);
  for(const c of plan.checks) {
    const original=data.checks.find(item=>item.id===c.id);
    if(!original||JSON.stringify(original)!==JSON.stringify(c)||c.effect!=='local-fixture') diagnostics.push(`Blocked execution: ${c.id}`);
  }
  if(!diagnostics.length)try {adapter.preflight?.(root,plan.checks.flatMap(c=>c.steps));}catch{diagnostics.push('Missing workspace runtime/tool dependency; install locked dependencies separately.');}
  const results:CheckResult[]=plan.checks.map(c=>({id:c.id,status:diagnostics.length?'blocked':'not-run',durationMs:0,exitCode:null,output:''}));
  if(diagnostics.length)return {version:1,results,exitCode:2,diagnostics};
  for(const [i,check] of plan.checks.entries()) {
    if(signal?.aborted) return {version:1,results,exitCode:1,diagnostics:['Execution cancelled.']};
    const start=Date.now(), result=results[i];
    try {
      for(const step of check.steps) {
        const part=await adapter.run(root,step,check.timeoutMs,signal);result.output+=part.output;result.exitCode=part.exitCode;
        if(part.exitCode!==0||part.timedOut) {result.status='failed';break;}
      }
      if(result.status!=='failed')result.status='passed';
    }catch(error){result.status='blocked';result.output=error instanceof Error?error.message:'Process could not start.';}
    result.durationMs=Date.now()-start;
    if(result.status!=='passed')return {version:1,results,exitCode:result.status==='blocked'?2:1,diagnostics:[]};
  }
  return {version:1,results,exitCode:0,diagnostics:[]};
}
