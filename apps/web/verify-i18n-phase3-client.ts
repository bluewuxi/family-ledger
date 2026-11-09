import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
// Audit application-owned JSX separately from stored names and source payloads.
for (const file of ['MonthlySummaryPage','TransactionsPage']) {
 const path=`apps/web/src/pages/${file}.tsx`, source=fs.readFileSync(path,'utf8');
 const tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const visible:string[]=[];
 function visit(node:ts.Node):void { if(ts.isJsxText(node)&&/[\u3400-\u9fff]/.test(node.text))visible.push(node.text.trim());ts.forEachChild(node,visit); }
 visit(tree);assert.deepEqual(visible,[],`${file}: untranslated application text`);
 assert(!source.includes('return error.message'),`${file}: raw exception text`);
}
console.log('Monthly/transaction application-copy audit passed.');
