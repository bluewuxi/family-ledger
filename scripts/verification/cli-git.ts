import { execFileSync } from 'node:child_process';
export function changedPaths(root:string,base?:string):string[] {
  const git=(args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
  const sources=[git(['diff','--name-only','--no-renames','-z']),git(['diff','--cached','--name-only','--no-renames','-z']),git(['ls-files','--others','--exclude-standard','-z'])];
  if(base) {const merge=git(['merge-base','HEAD',base]).trim();sources.push(git(['diff','--name-only','--no-renames','-z',merge,'HEAD']));}
  return [...new Set(sources.flatMap(s=>s.split('\0').filter(Boolean)))];
}
