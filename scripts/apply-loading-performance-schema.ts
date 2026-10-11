import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { testDatabaseSql } from "./education-reserve-test-db";

async function main() {
  if (process.argv.some(value => value.includes("prod"))) throw new Error("This migration runner is test-only.");
  dotenv.config({ path: ".env.test", quiet: true });
  const sql = await testDatabaseSql();
  sql(readFileSync("supabase/migrations/202610120002_loading_performance.sql", "utf8"));
  if (sql("select has_function_privilege('service_role','latest_price_candidates(jsonb)','EXECUTE') and not has_function_privilege('anon','latest_price_candidates(jsonb)','EXECUTE') and not has_function_privilege('authenticated','latest_price_candidates(jsonb)','EXECUTE')") !== "t") throw new Error("Price function permissions failed verification.");
  sql("select count(*) from latest_price_candidates('[]'::jsonb)");
  sql("notify pgrst, 'reload schema'");
  console.log("Test price batch function installed and access restrictions verified; financial rows were not modified.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Test migration failed."); process.exitCode = 1; });
