import { changedPaths } from './cli-git';
import { loadRegistry, validateRegistry } from './registry';
import { selectChecks } from './selection';
import { runChecks } from './runner';
async function main():Promise<void>{
  const args=process.argv.slice(2);if(args[0]==='--')args.shift();
  const mode=args.shift();let profile:string|undefined,base:string|undefined,changed=false,json=false;const ids:string[]=[];
  while(args.length){const arg=args.shift();if(arg==='--json'){json=true;continue;}if(arg==='--changed'){changed=true;continue;}if(['--profile','--base','--check'].includes(arg??'')){const value=args.shift();if(!value||value.startsWith('-'))throw new Error(`Missing value: ${arg}`);if(arg==='--profile'){if(profile)throw new Error('Repeated profile');profile=value;}if(arg==='--base'){if(base)throw new Error('Repeated base');base=value;}if(arg==='--check')ids.push(value);continue;}throw new Error(`Unknown option: ${arg}`);}
  if(!['list','plan','run'].includes(mode??''))throw new Error('Use list, plan, or run.');
  if(mode==='list'&&(profile||base||changed||ids.length)||mode==='run'&&(base||changed)||mode!=='list'&&!profile&&!ids.length&&!base&&!changed)throw new Error('Invalid selection for mode.');
  const root=process.cwd(),data=loadRegistry(root),errors=validateRegistry(root,data);
  if(mode==='list'){console.log(JSON.stringify({version:1,checks:data.checks,diagnostics:errors},null,2));process.exitCode=errors.length?2:0;return;}
  const plan=selectChecks({checks:data.checks,profile,ids,paths:changed||base?changedPaths(root,base):undefined});
  if(mode==='plan'){console.log(JSON.stringify({...plan,diagnostics:errors},null,2));process.exitCode=errors.length||plan.unmappedPaths.length?2:0;return;}
  const controller=new AbortController();const abort=()=>controller.abort();process.once('SIGINT',abort);process.once('SIGTERM',abort);
  try {
    const result=await runChecks(root,plan,undefined,controller.signal);
    if(json)console.log(JSON.stringify(result));else {for(const check of result.results)console.log(`${check.status}: ${check.id} (${check.durationMs}ms)\n${check.output}`);for(const diagnostic of result.diagnostics)console.error(diagnostic);}
    process.exitCode=result.exitCode;
  }finally{process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);}
}
main().catch(error=>{const message=error instanceof Error?error.message:'Verification failed.';if(process.argv.includes('--json'))console.log(JSON.stringify({version:1,exitCode:2,diagnostics:[message],results:[]}));else console.error(message);process.exitCode=2;});
