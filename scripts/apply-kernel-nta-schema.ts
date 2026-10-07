import dotenv from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { testDatabaseSql } from "./education-reserve-test-db";

async function main() {
  if (process.argv.some(arg => arg.includes("prod"))) throw new Error("Kernel NTA schema cutover is test-only.");
  dotenv.config({ path: ".env.test", quiet: true });
  const sql = await testDatabaseSql();
  if (sql("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='kernel_price_anchors' and column_name='proxy_value_type')") === "t") {
    sql(readFileSync("supabase/migrations/20261007130000_kernel_nta_target_configuration.sql", "utf8"));
    console.log("Kernel NTA schema verified and target compatibility applied."); return;
  }
  const directory = resolve(".local", "kernel-nta-repair");
  mkdirSync(directory, { recursive: true });
  const file = resolve(directory, `before-schema-${new Date().toISOString().replaceAll(":", "-")}.json.gz`);
  // Preserve raw PostgreSQL JSON bytes so unrelated numeric values retain full precision.
  writeFileSync(file, gzipSync(sql("select export_ledger_backup()")));
  sql(readFileSync("supabase/migrations/20261007120000_kernel_nta_estimation.sql", "utf8"));
  sql(readFileSync("supabase/migrations/20261007130000_kernel_nta_target_configuration.sql", "utf8"));
  if (sql("select has_function_privilege('service_role','refresh_kernel_nta(uuid,date,timestamptz,jsonb,jsonb)','EXECUTE')") !== "t") throw new Error("Kernel NTA schema verification failed.");
  console.log(`Kernel NTA schema applied to test; exact pre-schema ledger export: ${file}`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Kernel NTA schema application failed."); process.exitCode = 1; });
