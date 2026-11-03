import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDocumentation, headingAnchors, type DocsPolicy } from './verification/docs';
const root=mkdtempSync(join(tmpdir(),'ledger docs fixtures '));
try {
  mkdirSync(join(root,'docs/plans'),{recursive:true});
  writeFileSync(join(root,'package.json'),JSON.stringify({scripts:{'verify:one':'tsx fixture.ts'}}));
  writeFileSync(join(root,'docs/My File.md'),'# Same\n# Same\n# **Bold** [Link](x)\n<a id="explicit"></a>\n```md\n# Not a heading\n```');
  const anchors=headingAnchors('# Same\n# Same\n# **Bold** [Link](x)');assert(anchors.has('same-1'));assert(anchors.has('bold-link'));
  const policy:DocsPolicy={maintained:['README.md'],legacyPlans:[],exceptions:[]};
  writeFileSync(join(root,'README.md'),'# Guide\n[good](docs/My%20File.md#same-1)\n[explicit](docs/My%20File.md#explicit)\n[ref][target]\n[target]: docs/My%20File.md#bold-link\n`pnpm exec tsx anything.ts`\n`pnpm verify:one`');
  assert.deepEqual(checkDocumentation(root,policy),[]);
  writeFileSync(join(root,'docs/plans/future.md'),'**Status:** Draft\n[contract](../../README.md)\n`pnpm verify:future`');
  assert.deepEqual(checkDocumentation(root,policy),[],'Draft plan future commands are not active commands');
  writeFileSync(join(root,'docs/history.md'),'`pnpm verify:historical`\n[old](gone.md)');
  assert.deepEqual(checkDocumentation(root,policy),[],'Historical documents outside maintained scope are not active requirements');
  writeFileSync(join(root,'docs/plans/future.md'),'No status or contract');assert(checkDocumentation(root,policy).some(d=>d.rule==='plan-status'));
  writeFileSync(join(root,'docs/plans/future.md'),'**Status:** Superseded\n[contract](../../README.md)');assert(checkDocumentation(root,policy).some(d=>d.rule==='plan-replacement'));
  writeFileSync(join(root,'docs/plans/future.md'),'**Status:** Draft\n[contract](../../README.md)');
  writeFileSync(join(root,'README.md'),'[bad](missing.md)\n[anchor](docs/My%20File.md#absent)\n[undefined][missing]\n`pnpm verify:removed`');
  assert.deepEqual(checkDocumentation(root,policy).map(d=>d.rule).sort(),['anchor','command','link','reference']);
  writeFileSync(join(root,'README.md'),'[shortcut]\n[shortcut]: missing.md\n`pnpm run verify:removed`');
  assert.deepEqual(checkDocumentation(root,policy).map(d=>d.rule).sort(),['command','link']);
  assert(checkDocumentation(root,{...policy,exceptions:[{file:'README.md',rule:'link',target:'never.md',reason:'fixture',removalCondition:'now'}]}).some(d=>d.rule==='unused-exception'));
  console.log('Documentation checker fixtures passed.');
}finally{rmSync(root,{recursive:true,force:true});}
