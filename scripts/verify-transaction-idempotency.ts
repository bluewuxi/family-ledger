import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transactionCreateIntent } from "../apps/api/src/services/transactionIdempotency";
const key = "a2bcf994-abcd-4123-8123-123456789abc";
assert.throws(() => transactionCreateIntent(undefined, {}));
assert.equal(transactionCreateIntent(key, { price: "1.00" }).fingerprint,
  transactionCreateIntent(key, { price: "1", fee: "0", tax: "0", notes: null }).fingerprint);
assert.equal(transactionCreateIntent(key, { fee: "  " }).fingerprint, transactionCreateIntent(key, {}).fingerprint);
assert.notEqual(transactionCreateIntent(key, { price: "1" }).fingerprint, transactionCreateIntent(key, { price: "2" }).fingerprint);
for (const file of ["scripts/local-api.ts", "apps/api/src/utils/response.ts", "infra/aws/template.yaml"]) assert.match(readFileSync(file,"utf8"),/idempotency-key/);
console.log("Transaction idempotency canonicalization verification: success");

async function verifyPreparationRace() {
  const folder = mkdtempSync(join(tmpdir(), "ledger-idempotency-"));
  try {
    const repository = readFileSync("apps/api/src/repositories/transactionRepository.ts", "utf8");
    const names = [...repository.matchAll(/export (?:async )?(?:function|class) (\w+)/g)].map(match=>match[1]);
    const output = await build({entryPoints:["apps/api/src/services/transactionService.ts"],bundle:true,platform:"node",format:"cjs",write:false,plugins:[{
      name:"replay-race",setup(builder){builder.onLoad({filter:/[\\/]repositories[\\/]transactionRepository\.ts$/},()=>({loader:"ts",contents:names.map(name=>name==="findTransactionCreateReplay"
        ? `let reads=0; export async function ${name}(){return ++reads===1?null:{id:'already-committed'};}`
        : name.endsWith("Error")?`export class ${name} extends Error {}`:`export async function ${name}(){return '0';}`).join("\n")}));}
    }]});
    const file=join(folder,"service.cjs"); writeFileSync(file,output.outputFiles[0].contents);
    const service=createRequire(import.meta.url)(file);
    // The first lookup sees no committed intent; another request commits before
    // parsing/validation fails. The catch lookup must recover the original result.
    const result=await service.createInvestmentTransaction({}, {id:"actor"},key);
    assert.equal(result.id,"already-committed");
    console.log("Concurrent create preparation replay recovery: success");
  } finally {rmSync(folder,{recursive:true,force:true});}
}
void verifyPreparationRace().catch(error=>{console.error(error);process.exitCode=1;});
