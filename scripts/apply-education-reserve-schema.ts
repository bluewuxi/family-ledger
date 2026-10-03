import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { testDatabaseSql } from "./education-reserve-test-db";
dotenv.config({ path: ".env.test", quiet: true });
async function main() {
  const sql = await testDatabaseSql();
  if (sql("select to_regclass('public.education_reserve_funds') is not null") === "t") {
    console.log("Education schema already exists; no schema changes applied."); return;
  }
  sql(readFileSync("supabase/migrations/20261004090000_add_education_reserve.sql", "utf8"));
  if (sql("select count(*) from education_reserve_funds") !== "1") throw new Error("Education fund initialization failed.");
  if (sql("select count(*) from education_reserve_entries") !== "0") throw new Error("Unexpected education rows after additive migration.");
  console.log("Education additive schema applied: one inactive fund, no migrated entries. Existing ledger rows are unchanged.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Schema application failed."); process.exitCode = 1; });
