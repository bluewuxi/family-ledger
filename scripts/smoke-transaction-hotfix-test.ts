import dotenv from "dotenv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveSecureParameter } from "../apps/api/src/config/ssm";

dotenv.config({ path: ".env.test", quiet: true });

async function main() {
  const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}.`); return value; };
  const parameters = JSON.parse(readFileSync("infra/aws/parameters.test.json", "utf8")) as { ApiDomainName: string };
  const secret = await resolveSecureParameter(required("SUPABASE_SECRET_KEY_SSM_PARAM"));
  const supabase = createClient(required("SUPABASE_URL"), secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: roles, error } = await supabase.from("user_roles").select("user_id,role");
  if (error) throw new Error("Cannot load test roles.");
  const sessions: ReturnType<typeof createClient>[] = [];
  // Generate and consume an admin link locally; this sends no email. Close only the smoke session.
  const tokenFor = async (id: string) => {
    const user = await supabase.auth.admin.getUserById(id);
    if (user.error || !user.data.user.email) throw new Error("Cannot load test identity.");
    const link = await supabase.auth.admin.generateLink({ type: "magiclink", email: user.data.user.email });
    if (link.error || !link.data.properties.hashed_token) throw new Error("Cannot generate smoke authentication.");
    const sessionClient = createClient(required("SUPABASE_URL"), required("VITE_SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await sessionClient.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
    if (login.error || !login.data.session) throw new Error("Cannot verify smoke authentication.");
    sessions.push(sessionClient);
    return login.data.session.access_token;
  };
  const admin = roles?.find(row => row.role === "admin");
  assert.ok(admin, "Test admin is required.");
  const token = await tokenFor(admin.user_id);
  try {
  const request = async (path: string, auth?: string, body?: unknown) => {
    const response = await fetch(`https://${parameters.ApiDomainName}${path}`, { method: body === undefined ? "GET" : "POST",
      headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request("/health")).status, 200);
  assert.equal((await request("/transactions/balances")).status, 401);
  const viewer = roles?.find(row => row.role === "viewer");
  assert.ok(viewer, "Test viewer is required.");
  assert.equal((await request("/transactions/balances", await tokenFor(viewer.user_id))).status, 200);
  const balances = await request("/transactions/balances", token);
  assert.equal(balances.status, 200);
  assert.equal(balances.body.success, true);
  const { data: accounts, error: accountError } = await supabase.from("investment_accounts").select("id,name,purpose").eq("name", "Hong纽币");
  assert.equal(accountError, null);
  assert.equal(accounts?.length, 1);
  const account = accounts![0]!;
  assert.equal(account.purpose, "daily_expense");
  const cash = balances.body.data.cashBalances.find((row: { accountId: string }) => row.accountId === account.id);
  assert.ok(cash, "Daily-expense account must have explicit cash balance.");
  const detail = await request(`/accounts/${account.id}/detail?currency=NZD&quoteMode=cached`, token);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.accountDetail.cashBalances.find((row: { instrumentId: string }) => row.instrumentId === cash.instrumentId)?.balance, cash.quantity);
  const { data: openings, error: openingError } = await supabase.from("transactions").select("id,account_id,instrument_id,trade_date,gross_amount,currency").eq("account_id", account.id).eq("transaction_type", "opening_balance");
  assert.equal(openingError, null);
  assert.equal(openings?.length, 1);
  const opening = openings![0]!;
  // The installed unique index guarantees this probe cannot insert a second opening record.
  const duplicate = await request("/transactions", token, { accountId: opening.account_id, instrumentId: opening.instrument_id, transactionType: "opening_balance", tradeDate: opening.trade_date, grossAmount: String(opening.gross_amount), currency: opening.currency, fee: "0", tax: "0" });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.body.error.code, "VALIDATION_ERROR");
  assert.ok(duplicate.body.error.message.includes("已有期初余额"));
  const { count, error: countError } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("account_id", account.id).eq("transaction_type", "opening_balance");
  assert.equal(countError, null);
  assert.equal(count, 1);
  console.log(`Test hotfix verified: health, auth, viewer/admin balances, Hong NZD ${cash.quantity} parity, duplicate opening rejection; financial records unchanged.`);
  } finally {
    for (const client of sessions) await client.auth.signOut({ scope: "local" });
  }
}

main().catch(error => {
  // Never print token-bearing response objects or server-side credentials.
  console.error(error instanceof Error ? error.message : "Transaction hotfix smoke check failed.");
  process.exitCode = 1;
});
