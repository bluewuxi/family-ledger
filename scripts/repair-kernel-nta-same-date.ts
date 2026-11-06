import { config } from "dotenv";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { fetchNzxUsfNta, getAppBusinessDate, kernelNtaRpcArguments } from "../packages/shared/src/index";
import { guardedTransaction, snapshotBatchTransaction } from "./kernel-nta-repair-sql";
import { testDatabaseSql } from "./education-reserve-test-db";
import { acquireLock } from "./deployment-runtime";
import { assertRelatedAcquisitionChanges, hasPublishedBaselineMismatch, previewRepair, calculate, compareStored, type Export } from "./kernel-nta-repair-model";
import { createLedgerBackupObject, prepareLedgerRestoreRows, stableStringify, validateLedgerBackupPayload } from "../apps/jobs/src/services/ledgerBackupBundle";
import { normalizeLedgerBackupRows } from "../apps/jobs/src/repositories/ledgerBackupRepository";

const migrationPath="supabase/migrations/20261106090000_kernel_nta_same_date.sql";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
const literal=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const textLiteral=(v:string)=>"'"+v.replaceAll("'","''")+"'";
const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
type Snapshot = {ledger:Export;revision:string;fingerprint:string;mapping:string|null};
function backup(snapshot:Snapshot,path:string){
 const object=createLedgerBackupObject({environment:"test",generatedAt:new Date().toISOString(),rows:normalizeLedgerBackupRows(snapshot.ledger)});
 if(snapshot.mapping!=="same-date-v2"){
  object.payload.manifest.version=14;
  object.payload.manifest.migrationHighWaterMark="20261104110000_kernel_pending_actual_anchors";
  const {payloadChecksumSha256:_p,fileChecksumSha256:_f,...manifest}=object.payload.manifest;
  object.payload.manifest.payloadChecksumSha256=hash(stableStringify({manifest,tables:object.payload.tables}));
  object.payload.manifest.fileChecksumSha256=hash(stableStringify({manifest:{...manifest,payloadChecksumSha256:object.payload.manifest.payloadChecksumSha256},tables:object.payload.tables}));
 }
 validateLedgerBackupPayload(object.payload);prepareLedgerRestoreRows(object.payload);
 writeFileSync(path,gzipSync(Buffer.from(stableStringify(object.payload))),{flag:"wx"});
 const persisted=JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"));
 validateLedgerBackupPayload(persisted);prepareLedgerRestoreRows(persisted);
 if(stableStringify(persisted)!==stableStringify(object.payload))throw new Error("Persisted backup differs from exact export bundle.");
}
async function main(){
 const args=process.argv.slice(2), allowed=new Set(["--apply","--migrate","--output","--manifest","--confirm-sha256","--through"]);
 for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw new Error("Unknown argument.");if(!["--apply","--migrate"].includes(args[i])&&!args[++i])throw new Error("Missing argument value.");}
 config({path:".env.test",override:true,quiet:true});
 if(!process.env.SUPABASE_DB_PASSWORD_SSM_PARAM?.includes("/test_")||process.env.SUPABASE_DB_NAME!=="postgres")throw new Error("Expected configured TEST database.");
 const sql=await testDatabaseSql();
 const read=():Snapshot=>JSON.parse(sql("begin isolation level repeatable read read only; select jsonb_build_object('ledger',e,'revision',get_ledger_write_revision(),'fingerprint',md5(e::text),'mapping',e->>'_kernel_nta_mapping') from export_ledger_backup() e; rollback;"));
 if(!args.includes("--apply")&&!args.includes("--migrate")){
  const path=resolve(arg("--output")??".local/kernel-nta-same-date/manifest.json");
  execFileSync("git",["check-ignore","--quiet",path],{windowsHide:true});
  if(existsSync(path))throw new Error("Refusing to overwrite a manifest.");
  const snapshot=read(),fetchedAt=new Date().toISOString();
  const first=snapshot.ledger.kernel_price_anchors.map(a=>String(a.anchor_date)).sort()[0];
  if(!first)throw new Error("No Kernel anchors.");
  const records=await fetchNzxUsfNta({fromDate:first,fetchedAt});
  const completed=new Date(getAppBusinessDate()+"T00:00:00Z");completed.setUTCDate(completed.getUTCDate()-1);
  const through=arg("--through")??completed.toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(through)||through>completed.toISOString().slice(0,10)||new Date(through+"T00:00Z").toISOString().slice(0,10)!==through)throw new Error("Invalid completed --through date.");
  const preview=previewRepair(snapshot.ledger,records,fetchedAt,through);
  const manifest={version:1,environment:"test",migrationSha256:hash(readFileSync(migrationPath,"utf8")),snapshot,records,sourceSha256:hash(stableStringify(records)),fetchedAt,preview};
  mkdirSync(dirname(path),{recursive:true});const body=JSON.stringify(manifest,null,2);writeFileSync(path,body,{flag:"wx"});
  console.log(JSON.stringify({manifest:path,sha256:hash(body),references:preview.referenceChanges.length,prices:preview.priceChanges,
   window:[preview.from,preview.through],dates:preview.repairDates.length,checkedDates:preview.checkedDates,
   availabilityRegressions:preview.availabilityRegressions,storedBaselineMismatches:preview.snapshots.filter(s=>s.storedMismatches.length).length,
   changedValueDates:preview.snapshots.filter(s=>s.before.marketValueUsd!==s.after.marketValueUsd).map(s=>s.date),latestNta:records.at(-1)?.ntaDate},null,2));return;
 }
 const path=resolve(arg("--manifest")??"");
 execFileSync("git",["check-ignore","--quiet",path],{windowsHide:true});
 const body=readFileSync(path,"utf8");
 if(arg("--confirm-sha256")!==hash(body))throw new Error("Explicit manifest SHA-256 confirmation required.");
 const manifest=JSON.parse(body) as {version:number;environment:string;migrationSha256:string;snapshot:Snapshot;records:Awaited<ReturnType<typeof fetchNzxUsfNta>>;sourceSha256:string;fetchedAt:string;preview:ReturnType<typeof previewRepair>};
 if(manifest.version!==1||manifest.environment!=="test"||manifest.migrationSha256!==hash(readFileSync(migrationPath,"utf8"))||manifest.sourceSha256!==hash(stableStringify(manifest.records)))throw new Error("Invalid manifest.");
 const verified=previewRepair(manifest.snapshot.ledger,manifest.records,manifest.fetchedAt,manifest.preview.through);
 if(stableStringify(verified)!==stableStringify(manifest.preview)||verified.availabilityRegressions.length)throw new Error("Manifest calculation mismatch or availability regression.");
 if(args.includes("--apply")&&args.includes("--migrate"))throw new Error("Choose migration or repair separately.");
 if(hasPublishedBaselineMismatch(manifest.snapshot.ledger.portfolio_snapshot_headers,verified.snapshots))throw new Error("Unexpected available baseline mismatch.");
 const release=acquireLock("operator:kernel-same-date:"+hash(body));
 try{
  const current=read();
  if(current.fingerprint!==manifest.snapshot.fingerprint||current.revision!==manifest.snapshot.revision)throw new Error("Input drift; regenerate and review manifest.");
  const latest=await fetchNzxUsfNta({fromDate:verified.plan.fromDate,fetchedAt:new Date().toISOString()});
  if(hash(stableStringify(latest))!==manifest.sourceSha256)throw new Error("Source changed; regenerate and review manifest.");
  const backupPath=path+".before-"+Date.now()+".json.gz";backup(current,backupPath);
  if(args.includes("--migrate")){
   if(current.mapping==="same-date-v2")throw new Error("Migration already applied; do not replay.");
   const migration=readFileSync(migrationPath,"utf8").trim().replace(/^begin;/i,"").replace(/commit;$/i,"");
   sql(guardedTransaction(current,migration));
   const migrated=read();if(migrated.mapping!=="same-date-v2")throw new Error("Migration marker verification failed.");
   for(const [name,rows] of Object.entries(current.ledger)){
    if(!Array.isArray(rows))continue;
    const actual=migrated.ledger[name];
    const expected=name==='kernel_price_anchors'?rows.map(a=>({...a,nta_mapping_version:1})):rows;
    if(stableStringify(actual)!==stableStringify(expected))throw new Error("Unexpected migration data change: "+name);
   }
   console.log("Same-date schema applied; all allowlisted business rows verified unchanged apart from explicit legacy version metadata. Register the verified committed migration separately. Generate a fresh repair manifest.");return;
  }
  if(current.mapping!=="same-date-v2")throw new Error("Apply and verify same-date migration before making a fresh manifest.");
  const rpc=kernelNtaRpcArguments(verified.plan);
  const result=JSON.parse(sql(guardedTransaction(current,`select refresh_kernel_nta(${textLiteral(rpc.p_instrument_id)}::uuid,${textLiteral(rpc.p_from_date)}::date,${textLiteral(rpc.p_fetched_at)}::timestamptz,${literal(rpc.p_anchors)},${literal(rpc.p_estimates)});`)));
  writeFileSync(path+".price-result.json",JSON.stringify(result,null,2));
  const published=read();
  const changedTables=new Set(["kernel_price_anchors","instrument_prices","instrument_price_revisions","kernel_nta_refresh_state","snapshot_repair_state","portfolio_snapshot_headers","snapshot_pending_dates","dashboard_instrument_quotes","price_acquisition_state","price_acquisition_attempts"]);
  for(const [name,rows] of Object.entries(current.ledger))if(Array.isArray(rows)&&!changedTables.has(name)&&stableStringify(rows)!==stableStringify(published.ledger[name]))throw new Error("Unrelated table changed: "+name);
  assertRelatedAcquisitionChanges(current.ledger,published.ledger,rpc.p_instrument_id,verified.priceChanges.filter(c=>c.after!==null).map(c=>c.date));
  for(const old of current.ledger.kernel_price_anchors)if(!published.ledger.kernel_price_anchors.some(a=>stableStringify(a)===stableStringify(old)))throw new Error("Original anchor audit changed.");
  const protectedPrice=(p:Record<string,unknown>)=>p.instrument_id!==rpc.p_instrument_id||!p.is_estimated||p.source_transaction_id||!["Kernel Estimate (USF NTA)","Kernel Estimate (USF.NZ)"].includes(String(p.provider));
  if(stableStringify(current.ledger.instrument_prices.filter(protectedPrice))!==stableStringify(published.ledger.instrument_prices.filter(protectedPrice)))throw new Error("Protected prices changed.");
  const replay=previewRepair(published.ledger,manifest.records,manifest.fetchedAt,verified.through);
  if(replay.priceChanges.length||replay.referenceChanges.length)throw new Error("Published price/reference state differs from manifest.");
  // Each batch uses one consistent export and the maintained revision/CAS publication RPCs.
  // No watermark is cleared before all authorized dates are verified. Interrupted work remains resumable.
  for(let offset=0;offset<verified.repairDates.length;offset+=30){
   const input=read(),dates=verified.repairDates.slice(offset,offset+30),values=dates.map(d=>calculate(input.ledger,d,input.ledger.instrument_prices));
   sql(snapshotBatchTransaction(input,values,rpc.p_instrument_id,result.refresh_token));
   const after=read();for(const v of values){const h=after.ledger.portfolio_snapshot_headers.find(h=>h.snapshot_date===v.snapshotDate);
    if(v.publicationStatus==='ready'){
     if(!h||compareStored(h,after.ledger.portfolio_account_snapshots.filter(a=>a.snapshot_date===v.snapshotDate),v).length)throw new Error("Published snapshot/account mismatch.");
    }else if(!after.ledger.snapshot_pending_dates.some(p=>p.snapshot_date===v.snapshotDate)||h?.is_available===true)throw new Error("Pending publication mismatch.");
   }
   writeFileSync(path+".progress.json",JSON.stringify({completedThrough:dates.at(-1),kernelToken:result.refresh_token,verifiedAccounts:true},null,2));
  }
  // Source triggers may invalidate later stored dates. Retain both watermarks if any remain unavailable outside the bound.
  const final=read();
  const outside=final.ledger.portfolio_snapshot_headers.some(h=>String(h.snapshot_date)>verified.through&&h.is_available===false);
  const pendingFrom=final.ledger.kernel_nta_refresh_state.find(s=>s.instrument_id===rpc.p_instrument_id)?.pending_snapshot_from;
  if(!outside&&(!pendingFrom||String(pendingFrom)>=verified.from))sql(`select complete_kernel_nta_snapshots(${textLiteral(rpc.p_instrument_id)}::uuid,${textLiteral(result.refresh_token)}::uuid)`);
  backup(read(),path+".after-"+Date.now()+".json.gz");
  console.log("Price repair and bounded account-level snapshot verification finished; global repair watermark retained for normal CAS maintenance.");
 }finally{release();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Kernel repair failed.");process.exitCode=1;});
