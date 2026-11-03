import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export type CheckEffect = 'local-fixture' | 'disposable-db' | 'live-read' | 'live-write' | 'operator' | 'unreviewed';
export interface Diagnostic { rule: string; file: string; message: string; line?: number; target?: string }
export interface CheckStep { tool: 'tsx' | 'tsc'; args: string[] }
export interface VerificationCheck {
  id: string; packageScript?: string; command?: string; entryPoints: string[]; steps: CheckStep[];
  domains: string[]; contracts: string[]; effect: CheckEffect; auditFiles: string[];
  requirements: string[]; timeoutMs: number; profiles: string[];
}
export interface Registry { version: 1; checks: VerificationCheck[]; auditFiles: Record<string,string>; auditScopes: string[] }
export const coreCheckIds = ['verify:api-health','verify:holdings','verify:dashboard','verify:portfolio-trend','verify:time-policy','verify:deployment','verify:auth','verify:account-access','verify:account-access-client','verify:transaction-idempotency','verify:transaction-timeline','verify:dividend-cash-leg','verify:portfolio-snapshots','verify:backup','verify:session-reads'];
export function readScripts(root: string): Record<string,string> { return JSON.parse(readFileSync(join(root,'package.json'),'utf8')).scripts; }
export function filesBelow(root: string, directory: string): string[] {
  if (!existsSync(join(root,directory))) return [];
  return readdirSync(join(root,directory),{withFileTypes:true}).flatMap(item=> {
    if(['node_modules','dist','build','.git'].includes(item.name))return [];
    const path = `${directory}/${item.name}`;
    return item.isDirectory() ? filesBelow(root,path) : [path];
  });
}
export function discoverChecks(root: string): {id:string; entryPoints:string[]}[] {
  const scripts = readScripts(root);
  const aliases = Object.entries(scripts).filter(([id])=> /^(verify|smoke):/.test(id)).map(([id,command])=>({id,entryPoints:[...command.matchAll(/(?:^|\s)([^\s]+\.(?:ts|sql))(?=\s|$)/g)].map(m=>m[1])}));
  const covered = new Set(aliases.flatMap(c=>c.entryPoints));
  const standalone = [...filesBelow(root,'scripts'),...filesBelow(root,'apps/web')].filter(p=> !p.includes('/node_modules/') && !p.includes('/dist/') && /\/(?:verify|smoke)-[^/]+\.(?:ts|sql)$/.test(p) && !covered.has(p));
  return [...aliases,...standalone.map(path=>({id:`file:${path}`,entryPoints:[path]}))].sort((a,b)=>a.id.localeCompare(b.id));
}
export function fingerprint(root:string,path:string):string { return createHash('sha256').update(readFileSync(join(root,path),'utf8').replaceAll('\r\n','\n')).digest('hex'); }
export function loadRegistry(root:string):Registry { return JSON.parse(readFileSync(join(root,'scripts/verification/registry-data.json'),'utf8')); }
export function safePath(root:string,path:string):boolean {
  const rel = relative(resolve(root),resolve(root,path));
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !resolve(root,path).startsWith('\\\\') && !/^[A-Za-z]:/.test(rel);
}
export function validateRegistry(root:string,data:Registry = loadRegistry(root)):Diagnostic[] {
  const errors:Diagnostic[]=[];
  const error=(rule:string,file:string,message:string)=>errors.push({rule,file,message});
  if(data.version!==1) error('version','registry','Unsupported registry version.');
  const scripts=readScripts(root), discovered=discoverChecks(root), ids=new Set<string>();
  for(const [path,digest] of Object.entries(data.auditFiles)) {
    if(!safePath(root,path)||!existsSync(join(root,path)))error('audit',path,'Missing or unsafe shared audit dependency.');
    else if(fingerprint(root,path)!==digest)error('audit',path,'Stale shared effect review.');
  }
  for(const item of discovered) if(!data.checks.some(c=>c.id===item.id)) error('inventory',item.id,'Entry point has no classification.');
  for(const check of data.checks) {
    if(ids.has(check.id)) error('duplicate',check.id,'Duplicate check ID.'); ids.add(check.id);
    if(!discovered.some(c=>c.id===check.id)) error('inventory',check.id,'Registered entry point no longer exists.');
    if(check.packageScript && scripts[check.packageScript]!==check.command) error('command',check.id,'Package command changed; review every step.');
    const found=discovered.find(c=>c.id===check.id);
    if(found && JSON.stringify(found.entryPoints)!==JSON.stringify(check.entryPoints)) error('entrypoints',check.id,'Composite entry points differ from inventory.');
    for(const path of [...check.contracts,...check.entryPoints,...check.auditFiles]) if(!safePath(root,path)||!existsSync(join(root,path))) error('path',path,'Missing or unsafe registry path.');
    if(!check.contracts.length) error('contract',check.id,'A governing contract is required.');
    if(check.effect==='local-fixture') {
      if(!check.steps.length||!check.auditFiles.length) error('audit',check.id,'Local execution needs audited steps and files.');
      const rendered=check.steps.map(s=>`${s.tool} ${s.args.join(' ')}`).join(' && ');
      if(check.packageScript && rendered!==check.command) error('steps',check.id,'Executable steps do not exactly match the reviewed package alias.');
      for(const step of check.steps) if(!['tsx','tsc'].includes(step.tool)||step.args.some(arg=>/[\r\n\0]/.test(arg))) error('steps',check.id,'Invalid executable step.');
      for(const path of check.auditFiles) if(existsSync(join(root,path))&&data.auditFiles[path]!==fingerprint(root,path)) error('audit',path,`Stale effect review for ${check.id}.`);
    } else if(check.steps.length) error('effect',check.id,'Non-local records must not contain executable steps.');
  }
  for(const scope of data.auditScopes) for(const path of filesBelow(root,scope).filter(p=>/\.(ts|tsx|json)$/.test(p))) if(!(path in data.auditFiles)) error('audit-scope',path,'New executable dependency requires effect review.');
  return errors;
}
