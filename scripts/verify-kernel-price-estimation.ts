import assert from "node:assert/strict";
import { assertRelatedAcquisitionChanges, hasPublishedBaselineMismatch } from "./kernel-nta-repair-model";
import { previewRepair } from "./kernel-nta-repair-model";
import { parseNzxNtaAnnouncements, fetchNzxUsfNta, prepareKernelNtaPlan, getKernelValuationDateForNzxSession, type KernelPriceAnchor } from "@family-ledger/shared";
import { KernelEstimatedInstrumentPriceProvider } from "../apps/jobs/src/providers/KernelEstimatedInstrumentPriceProvider";
import { getUnconfirmedMarketCloseReason } from "../apps/jobs/src/services/marketClosePolicy";
import { applyKernelNtaPlan } from "../apps/jobs/src/services/kernelNtaRefreshService";
import { createKernelPriceAnchor } from "../apps/api/src/services/marketDataSourceService";
import type { AuthenticatedUser } from "@family-ledger/shared";
import { prepareKernelAnchorAdoption } from "../packages/shared/src/kernelAnchorAdoption";
const fetchedAt = "2026-10-07T01:00:00Z";
const anchor: KernelPriceAnchor = { id: "root", instrumentId: "kernel", anchorDate: "2026-09-30", kernelUnitPrice: "6.67", proxySymbol: "USF.NZ", proxyCurrency: "NZD", proxyClose: "23.6", proxyPriceDate: "2026-10-01", proxyFetchedAt: fetchedAt, createdByUserId: "actor", createdAt: "2026-10-02T08:25:57Z" };
const row = (date:string,price:string,id:number,published=1791230000) => ({ id,companyCode:"USF",securityCode:"USF",title:"USF NTA " + date + " $" + price,publicationDate:published });
async function main() {
 const pendingGap={source:"kernel_estimate",instrument_id:"kernel",query_kind:"daily_history",target_date:"2026-11-05",status:"pending",last_outcome:"empty",reason:"not yet published",next_attempt_at:null,lease_token:null,lease_expires_at:null,transient_attempts:1,daily_attempts:0,updated_at:"2026-11-05T00:00:00Z"};
 const resolvedGap={...pendingGap,status:"resolved",last_outcome:"success",reason:null,transient_attempts:0,updated_at:"2026-11-06T00:00:00Z"};
 assert.doesNotThrow(()=>assertRelatedAcquisitionChanges({price_acquisition_state:[pendingGap],price_acquisition_attempts:[]},{price_acquisition_state:[resolvedGap],price_acquisition_attempts:[]},"kernel",["2026-11-05"]));
 assert.throws(()=>assertRelatedAcquisitionChanges({price_acquisition_state:[pendingGap],price_acquisition_attempts:[]},{price_acquisition_state:[resolvedGap],price_acquisition_attempts:[]},"other",["2026-11-05"]),/Unrelated/);
 assert.throws(()=>assertRelatedAcquisitionChanges({price_acquisition_state:[pendingGap],price_acquisition_attempts:[]},{price_acquisition_state:[{...resolvedGap,status:"failed"}],price_acquisition_attempts:[]},"kernel",["2026-11-05"]),/Unexpected/);
 const unfinishedAttempt={...pendingGap,lease_token:"attempt-token",started_at:"2026-11-05T01:00:00Z",finished_at:null,outcome:"started"};
 const completedAttempt={...unfinishedAttempt,finished_at:"2026-11-06T00:00:00Z",outcome:"data_arrived"};
 assert.doesNotThrow(()=>assertRelatedAcquisitionChanges({price_acquisition_state:[pendingGap],price_acquisition_attempts:[unfinishedAttempt]},{price_acquisition_state:[resolvedGap],price_acquisition_attempts:[completedAttempt]},"kernel",["2026-11-05"]),"Backup-normalized state lease must not reject a matching dated attempt");
 assert.throws(()=>assertRelatedAcquisitionChanges({price_acquisition_state:[pendingGap],price_acquisition_attempts:[{...unfinishedAttempt,instrument_id:"other"}]},{price_acquisition_state:[resolvedGap],price_acquisition_attempts:[{...completedAttempt,instrument_id:"other"}]},"kernel",["2026-11-05"]),/Unrelated/);
 const baseline=[{date:"2026-11-04",storedMismatches:["portfolio.availability"]}];
 assert.equal(hasPublishedBaselineMismatch([{snapshot_date:"2026-11-04",is_available:false}],baseline),false,"Invalidated snapshots remain resumable");
 assert.equal(hasPublishedBaselineMismatch([{snapshot_date:"2026-11-04",is_available:true}],baseline),true,"Published mismatches still fail closed");
 const adoptionInput={instruments:[{id:"configured-target",exchange:"KERNEL",currency:"NZD",price_source:"kernel_estimate",price_source_symbol:"USF.NZ",price_source_exchange:"NZX",symbol:"KN_SP500"}],
   instrument_prices:[{id:"existing-price",instrument_id:"configured-target",price_date:"2026-11-03",close_price:"6.6100000000",provider:"Kernel Anchor",is_estimated:false}],kernel_price_anchors:[]};
 const candidates=[{instrumentId:"configured-target",priceId:"existing-price",anchorDate:"2026-11-03",kernelUnitPrice:"6.61",actualSource:"Kernel chart",actualPricePrecision:2}];
 assert.equal(prepareKernelAnchorAdoption(adoptionInput,candidates)[0].existingPriceId,"existing-price");
 assert.throws(()=>prepareKernelAnchorAdoption({...adoptionInput,instrument_prices:[{...adoptionInput.instrument_prices[0],provider:"manual"}]},candidates),/protected/);
 assert.throws(()=>prepareKernelAnchorAdoption({...adoptionInput,instrument_prices:[{...adoptionInput.instrument_prices[0],close_price:"6.612345"}]},candidates),/conflict/);
 assert.throws(()=>prepareKernelAnchorAdoption({...adoptionInput,instrument_prices:[...adoptionInput.instrument_prices,
   {...adoptionInput.instrument_prices[0],id:"manual-price",provider:"manual",close_price:"6.70"}]},candidates),/manual/);
 const sameDateRoot = {...anchor, anchorDate:"2026-11-03", kernelUnitPrice:"6.61", proxyValueType:"pending" as const,
   proxyClose:null,proxyPriceDate:null,proxyFetchedAt:null};
 const sameDateRecords = [
   {ntaDate:"2026-11-03",unitNta:"23.32715",announcementId:700001,publishedAt:"2026-11-04T00:00:00Z"},
   {ntaDate:"2026-11-04",unitNta:"23.44267",announcementId:700002,publishedAt:"2026-11-05T00:00:00Z"}
 ];
 const sameDate = prepareKernelNtaPlan([sameDateRoot],sameDateRecords,"2026-11-06T00:00:00Z");
 assert.equal(sameDate.anchors[0].proxyPriceDate,"2026-11-03","NTA title date pairs to the same actual date");
 assert.equal(sameDate.estimates[0]?.priceDate,"2026-11-04");
 assert.equal(sameDate.estimates[0]?.closePrice,"6.6427338402");
 const legacy = {...sameDateRoot, id:"legacy-ref",derivedFromAnchorId:sameDateRoot.id,proxyValueType:"nta" as const,
   proxyClose:"99",proxyPriceDate:"2026-11-04",proxyAnnouncementId:900001,proxyPublishedAt:"2026-11-06T00:00:00Z",ntaMappingVersion:1};
 assert.equal(prepareKernelNtaPlan([sameDateRoot,legacy],sameDateRecords,"2026-11-06T00:00:00Z").anchors[0].proxyPriceDate,"2026-11-03");
 assert.equal(prepareKernelNtaPlan([sameDateRoot,legacy],[],"2026-11-06T00:00:00Z").anchors[0].pairingStatus,"pending");
 assert.equal(prepareKernelNtaPlan([sameDateRoot],sameDateRecords,"2026-11-03T00:00:00Z").estimates.length,0);
 const repairFixture={instruments:[{id:"kernel",price_source:"kernel_estimate",price_source_symbol:"USF.NZ",price_source_exchange:"NZX",exchange:"KERNEL",currency:"NZD"}],
   kernel_price_anchors:[{id:"actual",instrument_id:"kernel",anchor_date:"2026-11-03",kernel_unit_price:"6.61",proxy_value_type:"pending",created_by_user_id:"actor",created_at:"2026-11-04T00:00:00Z"}],
   instrument_prices:[{id:"manual",instrument_id:"kernel",price_date:"2026-11-04",close_price:"7",provider:"manual",is_estimated:false},
    {id:"obsolete",instrument_id:"kernel",price_date:"2026-11-04",close_price:"8",provider:"Kernel Estimate (USF NTA)",is_estimated:true}],
   kernel_nta_refresh_state:[],investment_accounts:[],transactions:[],exchange_rates:[],portfolio_snapshot_headers:[],portfolio_account_snapshots:[],snapshot_pending_dates:[]};
 const protectedPreview=previewRepair(repairFixture,sameDateRecords,"2026-11-06T00:00:00Z","2026-11-04");
 assert.deepEqual(protectedPreview.priceChanges,[{date:"2026-11-04",before:"8",after:null}],"Retire source estimates on protected manual dates");
 assert.equal(repairFixture.instrument_prices[0].close_price,"7");
 const duplicateRoots={...repairFixture,kernel_price_anchors:[...repairFixture.kernel_price_anchors,{...repairFixture.kernel_price_anchors[0],id:"actual2",created_at:"2026-11-04T01:00:00Z"}]};
 assert.equal(previewRepair(duplicateRoots,sameDateRecords,"2026-11-06T00:00:00Z","2026-11-04").referenceChanges.length,2,"Both immutable same-date roots retain identities");
 const rows = [row("30-09-2026","23.70040",10),row("01-10-2026","23.60990",1),row("02-10-2026","23.81728",2),row("05-10-2026","23.93025",3),row("06-10-2026","24.19392",4)];
 const records = parseNzxNtaAnnouncements(rows,fetchedAt);
 const plan = prepareKernelNtaPlan([anchor],records,fetchedAt);
 assert.deepEqual(plan.estimates.map(p=>[p.priceDate,p.closePrice]),[["2026-10-01","6.6445305986"],["2026-10-02","6.7028935208"],["2026-10-05","6.7346866509"],["2026-10-06","6.8088912592"]]);
 assert.equal(getKernelValuationDateForNzxSession("2026-10-05"),"2026-10-02");
 assert.deepEqual(prepareKernelNtaPlan([anchor],records.slice(1),fetchedAt).estimates,[]);
 const pending = {...anchor,id:"pending",anchorDate:"2026-10-02",kernelUnitPrice:"6.8",proxyValueType:"pending" as const,
   proxyClose:null,proxyPriceDate:null,proxyFetchedAt:null,proxyAnnouncementId:null,proxyPublishedAt:null};
 const blocked = prepareKernelNtaPlan([anchor,pending],records.filter(r=>r.ntaDate!=="2026-10-02"),fetchedAt);
 assert.deepEqual(blocked.estimates.map(e=>e.priceDate),["2026-10-01"]);
 assert.equal(blocked.anchors.find(a=>a.id==="pending")?.proxyClose,null);
 const paired = prepareKernelNtaPlan([anchor,pending],records,fetchedAt);
 assert.equal(paired.estimates.find(e=>e.priceDate==="2026-10-05")?.closePrice,"6.8322537250");
 const saveDependencies = {
   findInstrument: async()=>({id:"kernel",price_update_enabled:true}),
   save: async (_id:string,input:import("@family-ledger/shared").CreateKernelPriceAnchorInput)=> {
     assert.equal(input.actualPricePrecision,2);
     assert.equal(input.actualSource,"User observed Kernel unit price");
     return {anchor:pending,pending_snapshot_from:null,refresh_token:"saved"};
   }, recalculate:async()=>{throw new Error("Unexpected repair");},complete:async()=>{}
 };
 assert.equal((await createKernelPriceAnchor({anchorDate:"2026-11-03",kernelUnitPrice:"6.61"},
   {id:"actor"} as AuthenticatedUser,()=>new Date(fetchedAt),saveDependencies)).id,"pending");
 await assert.rejects(createKernelPriceAnchor({anchorDate:"2026-11-03",kernelUnitPrice:"6.61",actualPricePrecision:1},
   {id:"actor"} as AuthenticatedUser,()=>new Date(fetchedAt),saveDependencies),/precision/);
 const revised = {...row("06-10-2026","24.20000",5),title:"AMENDED: USF NTA 06-10-2026 $24.20000"};
 assert.equal(parseNzxNtaAnnouncements([...rows,revised],fetchedAt).at(-1)?.unitNta,"24.20000");
 assert.equal(parseNzxNtaAnnouncements([...rows,row("07-10-2026","25",6,Date.parse(fetchedAt)/1000+1)],fetchedAt).length,5);
 for (const invalid of [row("32-10-2026","1",8),row("06-10-2026","0",8),{...rows[0],companyCode:"BAD"},{...rows[0],publicationDate:"invalid"},{...rows[0],title:"USF NTA bad"}]) assert.throws(()=>parseNzxNtaAnnouncements([invalid],fetchedAt));
 const corrected = {...anchor,id:"new-root",kernelUnitPrice:"7",createdAt:"2026-10-03T00:00:00Z"};
 const derived = {...anchor,id:"derived",derivedFromAnchorId:anchor.id,createdAt:"2026-10-07T00:00:00Z"};
 assert.equal(prepareKernelNtaPlan([anchor,corrected,derived],records,fetchedAt).anchors[0].id,"new-root");
 const sparse = prepareKernelNtaPlan([anchor],records.filter(r=>r.ntaDate!=="2026-10-05"),fetchedAt);
 assert(!sparse.estimates.some(e=>e.priceDate==="2026-10-05"));
 const requests:string[]=[];
 await fetchNzxUsfNta({fromDate:"2025-12-31",fetchedAt},async url=>{requests.push(url);return new Response("[]");});
 assert.equal(requests.length,2);
 await assert.rejects(fetchNzxUsfNta({fromDate:"2026-09-30",fetchedAt},async()=>new Response("",{status:503})),/request failed/);
 const provider = new KernelEstimatedInstrumentPriceProvider({listAnchors:async()=>[anchor],fetchFn:async()=>new Response(JSON.stringify(rows))});
 const result = await provider.fetchLatestPrices({fetchedAt,instruments:[{instrumentId:"kernel",sourceSymbol:"USF.NZ",currency:"NZD",providerInstrumentName:"Kernel",sourceExchange:"NZX"}]});
 assert.deepEqual(result.kernelNtaPlans?.[0].estimates,plan.estimates);
 let completed = false;
 const dependencies = {
   refresh: async () => ({ pending_snapshot_from: "2026-10-01", refresh_token: "retry", changed_count: 0 }),
   listDates: async () => ["2026-10-01", "2026-10-02"],
   recalculate: async (_date: string) => { throw new Error("Snapshot write failed"); },
   complete: async () => { completed = true; }
 };
 await assert.rejects(applyKernelNtaPlan(plan, dependencies), /Snapshot write failed/);
 assert.equal(completed, false);
 const recalculated: string[] = [];
 await applyKernelNtaPlan(plan, { ...dependencies, recalculate: async date => { recalculated.push(date); } });
 assert.deepEqual(recalculated, ["2026-10-01", "2026-10-02"]);
 assert.equal(completed, true);
 recalculated.length = 0;
 await applyKernelNtaPlan(plan, { ...dependencies,
   refresh: async () => ({ pending_snapshot_from: null, refresh_token: "unchanged", changed_count: 0 }),
   recalculate: async date => { recalculated.push(date); } });
 assert.equal(recalculated.length, 0);
 assert.equal(getUnconfirmedMarketCloseReason({priceDate:"2026-10-06",fetchedAt:"2026-10-06T00:00:00Z",priceSource:"kernel_estimate",sourceExchange:"NZX"}),null);
 console.log("Kernel NTA estimation verification: success");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
