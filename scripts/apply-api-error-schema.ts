import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { testDatabaseSql } from "./education-reserve-test-db";

dotenv.config({ path: ".env.test", quiet: true });

async function main() {
  const sql = await testDatabaseSql();
  if (sql("select to_regclass('public.api_error_groups') is not null") !== "t") {
    sql(readFileSync("supabase/migrations/202610120001_api_error_tracking.sql", "utf8"));
  }
  const verified = sql(`select
    to_regclass('public.api_error_events') is not null
    and to_regprocedure('public.observe_api_errors(jsonb)') is not null
    and to_regprocedure('public.update_api_error_status(uuid,text,text,uuid)') is not null
    and not has_table_privilege('authenticated', 'public.api_error_groups', 'SELECT')
    and not has_table_privilege('anon', 'public.api_error_events', 'SELECT')
    and has_table_privilege('service_role', 'public.api_error_groups', 'SELECT')`);
  if (verified !== "t") throw new Error("Error tracking schema verification failed.");
  console.log("Test error tracking schema and access restrictions verified.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Schema application failed.");
  process.exitCode = 1;
});
