import assert from "node:assert/strict";
import { maintainPortfolioSnapshots, assertCompletedSnapshotDate, completedSnapshotDate, type SnapshotMaintenanceDependencies } from "../apps/jobs/src/services/snapshotRepairService";

async function main() {
  assert.equal(completedSnapshotDate("2026-11-02T22:30:00Z"),"2026-11-02");
  assertCompletedSnapshotDate("2024-02-29","2024-03-01");
  assert.throws(() => assertCompletedSnapshotDate("2026-02-29","2026-11-02"));
  assert.throws(() => assertCompletedSnapshotDate("2026-11-03","2026-11-02"));
  const written: string[] = [], advanced: Array<string|null> = [];
  let tick=0, changed=false, fail=false;
  const dependencies: SnapshotMaintenanceDependencies = {
    requestCatchup: async () => {},
    listDates: async through => { assert.equal(through,"2026-11-01"); return ["2026-10-31","2026-11-01"].map(snapshot_date=>({snapshot_date,repair_token:"9007199254740993",pending_from:"2026-10-31"})); },
    generate: async date => { if(fail) throw new Error("crash"); written.push(date); },
    advance: async (token,next) => { assert.equal(token,"9007199254740993"); advanced.push(next); return !changed; },
    assertUpstreamReady: async () => {}, now: () => tick++
  };
  assert.equal(await maintainPortfolioSnapshots({eventTime:"2026-11-01T22:30:00Z"},dependencies),2);
  assert.deepEqual(written,["2026-10-31","2026-11-01"]);
  assert.deepEqual(advanced,["2026-11-01","2026-11-02"]);
  written.length=advanced.length=0;changed=true;
  assert.equal(await maintainPortfolioSnapshots({eventTime:"2026-11-01T22:30:00Z"},dependencies),1);
  assert.equal(written.length,1,"new invalidation stops stale progress");
  changed=false;fail=true;advanced.length=0;
  await assert.rejects(maintainPortfolioSnapshots({eventTime:"2026-11-01T22:30:00Z"},dependencies),/crash/);
  assert.equal(advanced.length,0,"failed work remains pending");
  const pendingDates: string[] = [];
  const pendingDependencies: SnapshotMaintenanceDependencies = {
    ...dependencies,
    now: () => 0,
    generate: async date => {
      if (date === "2026-10-31") throw Object.assign(new Error("Inputs absent"), { code: "SNAPSHOT_PENDING" });
      pendingDates.push(date);
    },
    advance: async () => true
  };
  await assert.rejects(maintainPortfolioSnapshots({eventTime:"2026-11-01T22:30:00Z"},pendingDependencies), error => (error as {code?:string}).code === "SNAPSHOT_PENDING");
  assert.deepEqual(pendingDates,["2026-11-01"],"a durable pending date cannot starve later complete dates");
  fail=false;tick=0;written.length=0;
  assert.equal(await maintainPortfolioSnapshots({eventTime:"2026-11-01T22:30:00Z",budgetMs:1},dependencies),0);
  assert.equal(written.length,0);
  // A one-time operator request must survive the 30-date batch limit. Existing
  // recent snapshots mean a later ordinary run cannot rediscover older gaps.
  const day = (offset:number) => new Date(Date.UTC(2026,7,1+offset)).toISOString().slice(0,10);
  let pending: string|null=null, token=0;
  const saved = new Set<string>([day(90)]);
  const persistent: SnapshotMaintenanceDependencies & {requestCatchup(from:string):Promise<void>} = {
    requestCatchup: async from => {pending=pending && pending<from ? pending:from;token++;},
    listDates: async (through,from) => Array.from({length:92},(_,i)=>day(i))
      .filter(date=>date<=through && ((pending && date>=pending) || (from && date>=from && !saved.has(date))))
      .slice(0,30).map(snapshot_date=>({snapshot_date,pending_from:pending,repair_token:String(token)})),
    generate: async date => {saved.add(date);},
    advance: async (expected,next) => {if(expected!==String(token))return false;pending=next;return true;},
    now:()=>0,assertUpstreamReady:async()=>{}
  };
  assert.equal(await maintainPortfolioSnapshots({eventTime:"2026-10-31T22:30:00Z",catchupFrom:day(0)},persistent),30);
  assert.equal(await maintainPortfolioSnapshots({eventTime:"2026-10-31T22:30:00Z"},persistent),30,"ordinary invocation resumes an explicit historical request");
  assert.equal(await maintainPortfolioSnapshots({eventTime:"2026-10-31T22:30:00Z"},persistent),30);
  assert.equal(await maintainPortfolioSnapshots({eventTime:"2026-10-31T22:30:00Z"},persistent),2);
  assert.equal(saved.size,92);
  persistent.assertUpstreamReady=async()=>{throw new Error("upstream failed");};
  await assert.rejects(maintainPortfolioSnapshots({eventTime:"2026-10-31T22:30:00Z",catchupFrom:day(0)},persistent),/upstream failed/);
  assert.equal(pending,day(0),"upstream deferral cannot discard an accepted catchup request");
  persistent.assertUpstreamReady=async()=>{};
  assert.equal(await maintainPortfolioSnapshots({eventTime:"2026-10-31T22:30:00Z"},persistent),30);
  console.log("Snapshot catchup dates, token conflicts, crash recovery, and bounded work: passed");
}
void main();
