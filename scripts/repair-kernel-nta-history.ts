import dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchNzxUsfNta, prepareKernelNtaPlan, kernelNtaRpcArguments } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../apps/api/src/db/supabaseServer";
import { listKernelPriceAnchors } from "../apps/api/src/repositories/marketDataSourceRepository";
import { recalculateSnapshotsFrom } from "../apps/api/src/services/snapshotRecalculationService";
import { testDatabaseSql } from "./education-reserve-test-db";
import { createLedgerBackupObject } from "../apps/jobs/src/services/ledgerBackupBundle";
import { normalizeLedgerBackupRows } from "../apps/jobs/src/repositories/ledgerBackupRepository";

async function main() {
  if (process.argv.some(a => a.includes("prod"))) throw new Error("Kernel NTA repair is test-only.");
  dotenv.config({ path: ".env.test", quiet: true });
  const db = await getSupabaseAdmin();
  const fetchedAt = new Date().toISOString();
  // Dry-run before migration reads the original audit history without new columns.
  const { data: ledger, error: readError } = await db.rpc("export_ledger_backup");
  const raw = ledger?.kernel_price_anchors as Array<Record<string, unknown>> | undefined;
  if (readError || !raw?.length) throw new Error("Cannot read Kernel anchors.");
  const anchors = raw.map(a => ({ id: a.id, instrumentId: a.instrument_id, anchorDate: a.anchor_date,
    kernelUnitPrice: String(a.kernel_unit_price), proxySymbol: a.proxy_symbol, proxyCurrency: a.proxy_currency,
    proxyClose: String(a.proxy_close), proxyPriceDate: a.proxy_price_date, proxyFetchedAt: a.proxy_fetched_at,
    createdByUserId: a.created_by_user_id, createdAt: a.created_at, proxyValueType: a.proxy_value_type ?? "open",
    derivedFromAnchorId: a.derived_from_anchor_id ?? null })) as unknown as Awaited<ReturnType<typeof listKernelPriceAnchors>>;
  const records = await fetchNzxUsfNta({ fromDate: anchors.map(a => a.anchorDate).sort()[0], fetchedAt });
  const plan = prepareKernelNtaPlan(anchors, records, fetchedAt);
  const { data: prices, error: pricesError } = await db.from("instrument_prices").select("*").eq("instrument_id", plan.instrumentId).order("price_date");
  if (pricesError) throw new Error("Cannot read Kernel historical prices.");
  const { data: snapshots, error: snapshotsError } = await db.from("portfolio_snapshot_headers").select("snapshot_date").gte("snapshot_date", plan.fromDate).order("snapshot_date");
  if (snapshotsError) throw new Error("Cannot read snapshot dates.");
  const output = resolve(".local", "kernel-nta-repair", fetchedAt.replaceAll(":", "-"));
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, "plan.json"), JSON.stringify({ environment: "test", plan, ntaRecords: records, beforeAnchors: raw, beforePrices: prices, affectedSnapshots: snapshots }, null, 2));
  console.log(`Kernel NTA ${process.argv.includes("--apply") ? "repair" : "dry-run"}: ${output}`);
  for (const estimate of plan.estimates) {
    const old = prices?.find(p => p.price_date === estimate.priceDate && p.provider.startsWith("Kernel Estimate"));
    console.log(`${estimate.priceDate}: ${old?.close_price ?? "missing"} -> ${estimate.closePrice}`);
  }
  const obsolete = prices?.filter(p => p.is_estimated && p.provider.startsWith("Kernel Estimate") && !plan.estimates.some(e => e.priceDate === p.price_date));
  console.log(`Obsolete estimated rows: ${obsolete?.length ?? 0}; affected snapshots: ${snapshots?.length ?? 0}`);
  if (!process.argv.includes("--apply")) return;
  const { data: backupData, error: backupError } = await db.rpc("export_ledger_backup");
  if (backupError || !backupData) throw new Error("Full pre-repair backup failed.");
  const backup = createLedgerBackupObject({ environment: "test", generatedAt: fetchedAt, rows: normalizeLedgerBackupRows(backupData) });
  writeFileSync(resolve(output, "before-backup.json.gz"), backup.body);
  const sql = await testDatabaseSql();
  if (sql("select exists(select 1 from information_schema.columns where table_name='kernel_price_anchors' and column_name='proxy_value_type')") !== "t") {
    throw new Error("Apply the NTA schema and deploy the new API/jobs before applying the repair.");
  }
  // The migration revokes old anchor RPC access. Disabling this target also isolates scheduled ingestion.
  const { data: target, error: targetError } = await db.from("instruments").select("price_update_enabled").eq("id", plan.instrumentId).single();
  if (targetError || !target) throw new Error("Cannot read Kernel update state.");
  const { error: disableError } = await db.from("instruments").update({ price_update_enabled: false }).eq("id", plan.instrumentId);
  if (disableError) throw new Error("Cannot isolate Kernel repair.");
  try {
    const { data: result, error } = await db.rpc("refresh_kernel_nta", kernelNtaRpcArguments(plan));
    if (error || !result) throw new Error("Atomic Kernel NTA repair failed.");
    if (result.pending_snapshot_from) await recalculateSnapshotsFrom(result.pending_snapshot_from);
    const { error: finishError } = await db.rpc("complete_kernel_nta_snapshots", { p_instrument_id: plan.instrumentId, p_refresh_token: result.refresh_token });
    if (finishError) throw new Error("Kernel snapshot completion failed.");
    writeFileSync(resolve(output, "result.json"), JSON.stringify(result, null, 2));
    console.log("Kernel NTA history repair and snapshot recalculation completed.");
  } finally {
    const { error } = await db.from("instruments").update({ price_update_enabled: target.price_update_enabled }).eq("id", plan.instrumentId);
    if (error) throw new Error("Restore Kernel update state before leaving maintenance.");
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Kernel NTA repair failed."); process.exitCode = 1; });
