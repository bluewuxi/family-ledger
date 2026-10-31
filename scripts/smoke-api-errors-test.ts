import { loginSmokeUser, logoutSmokeUser } from "./smoke-auth";
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
  const sessions: string[] = [];
  const tokenFor = async (id: string) => {
    const { data: user, error: identityError } = await supabase.from("app_users").select("email").eq("id", id).single();
    if (identityError || !user?.email) throw new Error("Cannot load test identity.");
    const token = await loginSmokeUser(`https://${parameters.ApiDomainName}`, user.email);
    sessions.push(token);
    return token;
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
  assert.equal((await request("/data-maintenance/errors")).status, 401);
  const viewer = roles?.find(row => row.role === "viewer");
  assert.ok(viewer, "Test viewer is required for authorization acceptance.");
  assert.equal((await request("/data-maintenance/errors", await tokenFor(viewer.user_id))).status, 403);
  const sync = await request("/data-maintenance/errors/query", token, {});
  assert.equal(sync.status, 200, "Live CloudWatch query must succeed.");
  assert.equal(sync.body.success, true);
  const list = await request("/data-maintenance/errors?limit=5", token);
  assert.equal(list.status, 200);
  assert.equal(list.body.success, true);
  const group = list.body.data.items[0];
  if (group) {
    const details = await request(`/data-maintenance/errors/${group.id}/events?limit=1`, token);
    assert.equal(details.status, 200);
    assert.equal(details.body.success, true);
  }
  console.log(`Live test API: health, authorization, CloudWatch query, summaries and event details passed; observed ${sync.body.data.observed} new events. Handling states were unchanged.`);
  } finally {
    for (const token of sessions) await logoutSmokeUser(`https://${parameters.ApiDomainName}`, token);
  }
}

main().catch(error => {
  // Never print token-bearing response objects or server-side credentials.
  console.error(error instanceof Error ? error.message : "API error smoke check failed.");
  process.exitCode = 1;
});
