import dotenv from "dotenv";
import { getSupabaseAdmin } from "../apps/api/src/db/supabaseServer";

dotenv.config({ path: ".env.test", quiet: true });
async function main() {
  const db = await getSupabaseAdmin();
  for (const table of ["spending_accounts", "account_statements", "statement_rows"]) {
    const { count, error } = await db.from(table).select("id", { count: "exact", head: true });
    if (error) throw new Error(`Cannot inspect ${table}.`);
    console.log(`${table}: ${count}`);
  }
  const { data: accounts, error } = await db.from("investment_accounts").select("id,name,purpose,base_currency").in("purpose", ["daily_expense", "education"]);
  if (error || !accounts) throw new Error("Cannot inspect purpose accounts.");
  console.log("Purpose accounts:", JSON.stringify(accounts));
  for (const account of accounts) {
    const { data, error: rowsError } = await db.from("transactions").select("id,trade_date,transaction_type,currency,gross_amount,quantity,fee,tax,transaction_source,linked_transaction_id,notes").eq("account_id", account.id).order("trade_date");
    if (rowsError) throw new Error("Cannot inspect purpose transactions.");
    console.log(`${account.purpose} records:`, JSON.stringify(data));
  }
}
main().catch(() => { console.error("Education inspection failed; no data was changed."); process.exitCode = 1; });
