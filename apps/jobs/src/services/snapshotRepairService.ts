import { getAppBusinessDate, SnapshotPendingError } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";
import { createJobRun, finishJobRun } from "../repositories/jobRunRepository";
import { generatePortfolioSnapshot } from "./portfolioSnapshotGenerationService";
import { recoverHistoricalPrices } from "./priceRecoveryService";

export interface SnapshotMaintenanceDate { snapshot_date: string; repair_token: string; pending_from: string | null }
export interface SnapshotMaintenanceDependencies {
  requestCatchup(fromDate: string): Promise<void>;
  listDates(throughDate: string, catchupFrom?: string): Promise<SnapshotMaintenanceDate[]>;
  generate(snapshotDate: string, remainingMs?: number): Promise<unknown>;
  advance(token: string, nextDate: string | null): Promise<boolean>;
  assertUpstreamReady(throughDate?: string, budgetMs?: number): Promise<void>;
  now(): number;
  begin?(): Promise<string>;
  finish?(id: string, count: number, error?: unknown): Promise<void>;
}

const defaults: SnapshotMaintenanceDependencies = {
  async requestCatchup(fromDate) {
    const db = await getSupabaseAdmin();
    const {error} = await db.rpc("request_snapshot_catchup", {from_date: fromDate});
    if(error) throw new Error("Could not persist snapshot catchup request.");
  },
  async listDates(throughDate, catchupFrom) {
    const db = await getSupabaseAdmin();
    const {data,error} = await db.rpc("snapshot_maintenance_dates", {through_date: throughDate, batch_limit: 30, catchup_from: catchupFrom ?? null});
    if(error) throw new Error("Could not list snapshot maintenance dates.");
    return data ?? [];
  },
  generate: (snapshotDate, remainingMs) => generatePortfolioSnapshot({snapshotDate,deadline: Date.now()+(remainingMs ?? 240000)}),
  async advance(token,nextDate) {
    const db = await getSupabaseAdmin();
    const {data,error} = await db.rpc("advance_snapshot_repair", {expected_token: token,next_date: nextDate});
    if(error) throw new Error("Could not advance snapshot repair.");
    return data === true;
  },
  begin: async () => (await createJobRun({jobName: "generate-portfolio-snapshots",jobStartedAt:new Date().toISOString()})).id,
  finish: async (id,count,error) => { await finishJobRun(id,{status:error ? "failed":"succeeded",finishedAt:new Date().toISOString(),recordsInserted:count,errorMessage:error ? "Snapshot maintenance remains pending; inspect job diagnostics." : null}); },
  async assertUpstreamReady(throughDate, budgetMs) {
    const db = await getSupabaseAdmin();
    for(const name of ["ingest-frankfurter-fx-rates","update-prices"]) {
      const {data,error} = await db.from("job_runs").select("status,job_started_at").eq("job_name",name).order("job_started_at",{ascending:false}).limit(1);
      if(error) throw new Error("Could not inspect upstream job readiness.");
      if(data?.[0]?.status === "started" && Date.now() - new Date(data[0].job_started_at).getTime() < 3_600_000) throw new Error("Snapshot maintenance pending: market inputs are still being updated.");
    }
    if (throughDate && (budgetMs ?? 0) > 0) await recoverHistoricalPrices({ throughDate, budgetMs: Math.min(30_000, budgetMs ?? 0) });
  },
  now: () => Date.now()
};

export function completedSnapshotDate(eventTime: string): string {
  const instant = new Date(eventTime);
  if(Number.isNaN(instant.getTime())) throw new Error("Scheduled event time must be a valid ISO timestamp.");
  return getAppBusinessDate(new Date(instant.getTime()-86400000));
}
export function assertCompletedSnapshotDate(date: string, upperDate: string): void {
  const instant = new Date(`${date}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(instant.getTime()) || instant.toISOString().slice(0,10)!==date || date>upperDate)
    throw new Error("Snapshot date must be a valid completed calendar date.");
}

/** A bounded batch; source-write invalidation remains pending until every date succeeds. */
export async function maintainPortfolioSnapshots(input: {eventTime: string; catchupFrom?: string; budgetMs?: number}, dependencies = defaults): Promise<number> {
  const deadline = dependencies.now() + (input.budgetMs ?? 240000);
  const jobId = await dependencies.begin?.();
  let count = 0;
  let pendingCount = 0;
  try {
  const through = completedSnapshotDate(input.eventTime);
  if(input.catchupFrom) {
    assertCompletedSnapshotDate(input.catchupFrom,through);
    await dependencies.requestCatchup(input.catchupFrom);
  }
  await dependencies.assertUpstreamReady(through, Math.max(0, deadline - dependencies.now()));
  const dates = await dependencies.listDates(through,input.catchupFrom);
  for(const date of dates) {
    if(dependencies.now()>=deadline) break;
    assertCompletedSnapshotDate(date.snapshot_date,through);
    try {
      await dependencies.generate(date.snapshot_date, deadline-dependencies.now());
      count++;
    } catch (error) {
      if ((error as { code?: string }).code !== "SNAPSHOT_PENDING") throw error;
      pendingCount++;
      // Publication durably recorded this date separately; do not starve later dates.
    }
    if(date.pending_from && date.snapshot_date>=date.pending_from) {
      const next = new Date(new Date(`${date.snapshot_date}T00:00:00Z`).getTime()+86400000).toISOString().slice(0,10);
      if(!await dependencies.advance(date.repair_token,next)) break;
    }
  }
  if (pendingCount > 0) throw new SnapshotPendingError(through);
  if(jobId) await dependencies.finish?.(jobId,count);
  return count;
  } catch(error) {
    if(jobId) await dependencies.finish?.(jobId,count,error);
    throw error;
  }
}
