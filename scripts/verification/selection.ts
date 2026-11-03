import type { VerificationCheck } from './registry';
export interface SelectionInput { checks: VerificationCheck[]; paths?: string[]; profile?: string; ids?: string[] }
export interface VerificationPlan { version:1; checks: VerificationCheck[]; reasons: Record<string,string[]>; blockedChecks: string[]; unmappedPaths: string[]; baselineCommands: string[] }
export function selectChecks(input:SelectionInput):VerificationPlan {
  const plan:VerificationPlan={version:1,checks:[],reasons:{},blockedChecks:[],unmappedPaths:[],baselineCommands:[]};
  const add=(check:VerificationCheck,reason:string)=>{if(!plan.reasons[check.id]) {plan.checks.push(check);plan.reasons[check.id]=[];} plan.reasons[check.id].push(reason);};
  if(input.profile) {
    if(input.profile!=='core') throw new Error(`Unknown profile: ${input.profile}`);
    for(const check of input.checks.filter(c=>c.profiles.includes(input.profile!))) add(check,`Fixed ${input.profile} profile`);
  }
  for(const id of input.ids??[]) {const check=input.checks.find(c=>c.id===id);if(!check)throw new Error(`Unknown check: ${id}`);add(check,'Explicit selection');}
  for(const raw of input.paths??[]) {
    const path=raw.replaceAll('\\','/');
    if(/\.md$/.test(path)||path.startsWith('docs/')) {for(const c of input.checks.filter(c=>c.id==='verify:docs')) add(c,`Documentation: ${path}`);continue;}
    plan.baselineCommands=['corepack pnpm lint','corepack pnpm typecheck','corepack pnpm build'];
    let domains:string[]=[];
    if(path.startsWith('packages/shared/')) domains=['all'];
    else if(/auth|[Aa]ccess|[Ss]ession/.test(path)) domains=['auth'];
    else if(/transaction|[Tt]ransaction|holding|[Hh]olding|dividend|[Dd]ashboard|snapshot|[Vv]aluation|monthlySummary/.test(path)) domains=['transactions','valuation'];
    else if(/time|[Dd]ate/.test(path)) domains=['time'];
    else if(path==='eslint.config.mjs'||path.startsWith('scripts/verification/')||/^(package.json|pnpm-lock.yaml|tsconfig.*\.json|\.github\/)/.test(path)) domains=['all'];
    else {
      const owners=input.checks.filter(c=>c.entryPoints.includes(path));
      if(owners.length){for(const c of owners)add(c,`Verification entry point: ${path}`);domains=[...new Set(owners.flatMap(c=>c.domains))];}
      else plan.unmappedPaths.push(path);
    }
    for(const c of input.checks) if(domains.includes('all')&&c.effect==='local-fixture'||domains.some(d=>c.domains.includes(d))||!domains.length&&c.profiles.includes('core')) add(c,`${domains.length?'Affected domain':'Unmapped fallback'}: ${path}`);
  }
  plan.blockedChecks=plan.checks.filter(c=>c.effect!=='local-fixture').map(c=>c.id);
  return plan;
}
