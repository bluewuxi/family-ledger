import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { filesBelow, readScripts, safePath, type Diagnostic } from './registry';
export interface DocsPolicy { maintained:string[]; legacyPlans:string[]; exceptions:{file:string;rule:string;target:string;reason:string;removalCondition:string}[] }
export function stripFences(text:string):string {
  let fence='';return text.split('\n').map(line=>{const match=line.match(/^\s*(`{3,}|~{3,})/);if(match){if(!fence)fence=match[1][0];else if(match[1][0]===fence)fence='';return '';}return fence?'':line;}).join('\n');
}
export function headingAnchors(text:string):Set<string>{
  const anchors=new Set<string>(),counts=new Map<string,number>();
  for(const match of stripFences(text).matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)){
    const slug=match[1].replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,'').replace(/[`*_~]/g,'').trim().toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu,'').replace(/\s/g,'-');
    let n=counts.get(slug)??0;while(anchors.has(n?`${slug}-${n}`:slug))n++;counts.set(slug,n+1);anchors.add(n?`${slug}-${n}`:slug);
  }
  for(const m of stripFences(text).matchAll(/<(?:a|[a-z][a-z0-9]*)\b[^>]*\b(?:id|name)=["']([^"']+)["'][^>]*>/gi))anchors.add(m[1]);
  return anchors;
}
export function checkDocumentation(root:string,policy:DocsPolicy):Diagnostic[]{
  const diagnostics:Diagnostic[]=[];const add=(rule:string,file:string,line:number,target:string,message:string)=>diagnostics.push({rule,file,line,target,message});
  const scripts=readScripts(root), maintained=new Set(policy.maintained);
  for(const file of policy.maintained){
    if(!safePath(root,file)||!existsSync(join(root,file))){add('scope',file,1,file,'Maintained document does not exist.');continue;}
    const original=readFileSync(join(root,file),'utf8'),text=stripFences(original),refs=new Map<string,string>();
    for(const m of text.matchAll(/^\s{0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?/gm))refs.set(m[1].trim().toLowerCase(),m[2]);
    const links:{target:string;index:number}[]=[];
    for(const m of text.matchAll(/!?\[[^\]\n]*\]\(<?([^\s)>]+)>?(?:\s+["'][^\n]*["'])?\)/g))links.push({target:m[1],index:m.index!});
    for(const m of text.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)){
      const label=(m[2]||m[1]).trim().toLowerCase(),target=refs.get(label);
      if(target)links.push({target,index:m.index!});else add('reference',file,text.slice(0,m.index).split('\n').length,label,'Undefined reference link.');
    }
    for(const m of text.matchAll(/!?\[([^\]\n]+)\](?![[(:])/g)){
      const before=text.slice(Math.max(0,m.index!-1),m.index);
      if(before===']')continue;
      const target=refs.get(m[1].trim().toLowerCase());if(target)links.push({target,index:m.index!});
    }
    for(const link of links){
      if(/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link.target))continue;
      const line=text.slice(0,link.index).split('\n').length;
      try {
        const [encodedPath,encodedFragment]=link.target.split('#'),path=decodeURIComponent(encodedPath).replaceAll('\\','/');
        const target=path?relative(root,resolve(root,dirname(file),path)).replaceAll('\\','/'):file;
        if(!safePath(root,target)||!existsSync(join(root,target))){add('link',file,line,link.target,'Missing or unsafe relative link.');continue;}
        if(encodedFragment&&/\.md$/i.test(target)&&!headingAnchors(readFileSync(join(root,target),'utf8')).has(decodeURIComponent(encodedFragment)))add('anchor',file,line,link.target,'Missing heading or HTML anchor.');
      }catch{add('link',file,line,link.target,'Invalid encoded link.');}
    }
    // Only explicit root script invocations are checked; exec/built-ins/filter calls are not root aliases.
    const builtins=new Set(['exec','install','add','remove','update','run','dlx','config','list','why','--filter','-r']);
    let commandFence='';
    const commandText=original.split('\n').map(line=>{
      const marker=line.match(/^\s*(`{3,}|~{3,})/);
      if(marker){commandFence=commandFence?'':marker[1][0];return '';}
      if(commandFence)return line;
      return [...line.matchAll(/`([^`]+)`/g)].map(match=>match[1]).join(' ');
    }).join('\n');
    for(const m of commandText.matchAll(/\b(?:corepack\s+)?pnpm\s+(?:run\s+)?([a-z][a-z\d:_-]*|--filter|-r)\b/g)){
      const name=m[1];if(builtins.has(name)||name in scripts)continue;
      add('command',file,commandText.slice(0,m.index).split('\n').length,name,'Unknown root package script.');
    }
  }
  for(const file of filesBelow(root,'docs/plans').filter(p=>p.endsWith('.md')&&!policy.legacyPlans.includes(p))){
    const text=readFileSync(join(root,file),'utf8');
    if(!/\*\*Status:\*\*\s*(?:Draft|Approved|Implemented|Superseded)\b/.test(text))add('plan-status',file,1,'Status','New plan needs an explicit status.');
    const links=[...text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)].map(m=>relative(root,resolve(root,dirname(file),m[1])).replaceAll('\\','/'));
    if(!links.some(p=>maintained.has(p)))add('plan-contract',file,1,'contracts','New plan must link a maintained governing contract.');
    if(/\*\*Status:\*\*\s*Superseded\b/.test(text)&&!/\*\*Replacement:\*\*\s*\[[^\]]+\]\([^)]+\)/.test(text))add('plan-replacement',file,1,'Replacement','Superseded plan needs an explicit replacement link.');
  }
  const used=new Set<number>();
  const output=diagnostics.filter(d=>{const i=policy.exceptions.findIndex(e=>e.file===d.file&&e.rule===d.rule&&e.target===d.target&&e.reason&&e.removalCondition);if(i<0)return true;used.add(i);return false;});
  policy.exceptions.forEach((e,i)=>{if(!used.has(i))output.push({rule:'unused-exception',file:e.file,target:e.target,message:'Remove an unused or invalid documentation exception.'});});
  return output;
}
