import assert from "node:assert/strict";
import { parseNzxNtaAnnouncements, fetchNzxUsfNta, prepareKernelNtaPlan, getKernelValuationDateForNzxSession, type KernelPriceAnchor } from "@family-ledger/shared";
import { KernelEstimatedInstrumentPriceProvider } from "../apps/jobs/src/providers/KernelEstimatedInstrumentPriceProvider";
import { getUnconfirmedMarketCloseReason } from "../apps/jobs/src/services/marketClosePolicy";
import { applyKernelNtaPlan } from "../apps/jobs/src/services/kernelNtaRefreshService";
const fetchedAt = "2026-10-07T01:00:00Z";
const anchor: KernelPriceAnchor = { id: "root", instrumentId: "kernel", anchorDate: "2026-09-30", kernelUnitPrice: "6.67", proxySymbol: "USF.NZ", proxyCurrency: "NZD", proxyClose: "23.6", proxyPriceDate: "2026-10-01", proxyFetchedAt: fetchedAt, createdByUserId: "actor", createdAt: "2026-10-02T08:25:57Z" };
const row = (date:string,price:string,id:number,published=1791230000) => ({ id,companyCode:"USF",securityCode:"USF",title:"USF NTA " + date + " $" + price,publicationDate:published });
async function main() {
 const rows = [row("01-10-2026","23.60990",1),row("02-10-2026","23.81728",2),row("05-10-2026","23.93025",3),row("06-10-2026","24.19392",4)];
 const records = parseNzxNtaAnnouncements(rows,fetchedAt);
 const plan = prepareKernelNtaPlan([anchor],records,fetchedAt);
 assert.deepEqual(plan.estimates.map(p=>[p.priceDate,p.closePrice]),[["2026-10-01","6.7285866353"],["2026-10-02","6.7605016328"],["2026-10-05","6.8349906776"]]);
 assert.equal(getKernelValuationDateForNzxSession("2026-10-05"),"2026-10-02");
 assert.throws(()=>prepareKernelNtaPlan([anchor],records.slice(1),fetchedAt),/No corresponding/);
 const revised = {...row("06-10-2026","24.20000",5),title:"AMENDED: USF NTA 06-10-2026 $24.20000"};
 assert.equal(parseNzxNtaAnnouncements([...rows,revised],fetchedAt).at(-1)?.unitNta,"24.20000");
 assert.equal(parseNzxNtaAnnouncements([...rows,row("07-10-2026","25",6,Date.parse(fetchedAt)/1000+1)],fetchedAt).length,4);
 for (const invalid of [row("32-10-2026","1",8),row("06-10-2026","0",8),{...rows[0],companyCode:"BAD"},{...rows[0],publicationDate:"invalid"},{...rows[0],title:"USF NTA bad"}]) assert.throws(()=>parseNzxNtaAnnouncements([invalid],fetchedAt));
 const corrected = {...anchor,id:"new-root",kernelUnitPrice:"7",createdAt:"2026-10-03T00:00:00Z"};
 const derived = {...anchor,id:"derived",derivedFromAnchorId:anchor.id,createdAt:"2026-10-07T00:00:00Z"};
 assert.equal(prepareKernelNtaPlan([anchor,corrected,derived],records,fetchedAt).anchors[0].id,"new-root");
 const sparse = prepareKernelNtaPlan([anchor],records.filter(r=>r.ntaDate!=="2026-10-05"),fetchedAt);
 assert(!sparse.estimates.some(e=>e.priceDate==="2026-10-02"));
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
