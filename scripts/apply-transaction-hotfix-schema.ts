import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { testDatabaseSql } from "./education-reserve-test-db";

dotenv.config({ path: ".env.test", quiet: true });
async function main() {
  const sql = await testDatabaseSql();
  const duplicates = sql("select count(*) from (select account_id from public.transactions where transaction_type = 'opening_balance' group by account_id having count(*) > 1) duplicates");
  if (duplicates !== "0") throw new Error(`Found ${duplicates} accounts with duplicate opening balances. No financial records were changed; resolve these before applying the index.`);
  sql(readFileSync("supabase/migrations/202610120002_single_account_opening_balance.sql", "utf8"));
  if (sql("select indisunique and indisvalid from pg_index where indexrelid = 'public.transactions_one_opening_balance_per_account'::regclass") !== "t") throw new Error("Opening balance unique index verification failed.");
  console.log("Test opening balance uniqueness verified; existing financial records were unchanged.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Schema application failed."); process.exitCode = 1; });
