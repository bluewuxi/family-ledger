import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.test", quiet: true });

const requiredTables = [
  "profiles",
  "user_roles",
  "currencies",
  "investment_accounts",
  "instruments",
  "transactions",
  "instrument_prices",
  "exchange_rates",
  "job_runs",
  "data_provider_runs",
  "portfolio_snapshots"
];

const businessTables = [
  "currencies",
  "investment_accounts",
  "instruments",
  "transactions",
  "instrument_prices",
  "exchange_rates",
  "job_runs",
  "data_provider_runs",
  "portfolio_snapshots"
];

const tableIdentitySelects: Record<string, string> = {
  currencies: "code"
};

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

async function resolveSecureParameter(client: SSMClient, parameterName: string): Promise<string> {
  const response = await client.send(
    new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true
    })
  );

  const value = response.Parameter?.Value;

  if (!value) {
    throw new Error("Required SSM parameter could not be resolved.");
  }

  return value;
}

async function main(): Promise<void> {
  const awsRegion = requiredEnv("AWS_REGION");
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceKeyParam = requiredEnv("SUPABASE_SECRET_KEY_SSM_PARAM");
  const jwtSecretParam = requiredEnv("SUPABASE_JWT_SECRET_SSM_PARAM");
  const dbPasswordParam = requiredEnv("SUPABASE_DB_PASSWORD_SSM_PARAM");

  console.log("SSM parameter paths found: yes");

  const ssm = new SSMClient({ region: awsRegion });
  const serviceKey = await resolveSecureParameter(ssm, serviceKeyParam);
  await resolveSecureParameter(ssm, jwtSecretParam);
  await resolveSecureParameter(ssm, dbPasswordParam);

  console.log("SSM values resolved: yes");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const missingTables: string[] = [];

  for (const table of requiredTables) {
    const identitySelect = tableIdentitySelects[table] ?? "id";
    const { error } = await supabase.from(table).select(identitySelect, { count: "exact", head: true }).limit(1);

    if (error) {
      missingTables.push(table);
    }
  }

  if (missingTables.length > 0) {
    console.error("Supabase connection: success");
    console.error("Table readiness: failure");
    console.error(`Migration appears unapplied or incomplete. Missing/unreadable tables: ${missingTables.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const tablesWithUserOwnership: string[] = [];

  for (const table of businessTables) {
    const { error } = await supabase.from(table).select("user_id", { head: true }).limit(1);

    if (!error) {
      tablesWithUserOwnership.push(table);
    }
  }

  if (tablesWithUserOwnership.length > 0) {
    console.error("Schema ownership check: failure");
    console.error(`Business tables still contain user_id ownership columns: ${tablesWithUserOwnership.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const requiredColumnSelects: Record<string, string> = {
    investment_accounts: "created_by_user_id,updated_by_user_id",
    instruments:
      "short_name,description,market_region,exchange,price_source,price_source_symbol,price_source_exchange,price_update_enabled,price_update_priority,source_url,source_checked_at",
    transactions: "created_by_user_id,updated_by_user_id",
    currencies: "name,minor_unit,is_active",
    instrument_prices: "provider,source_symbol,is_adjusted,fetched_at",
    exchange_rates: "rate_type,provider,provider_rate_date,fetched_at",
    job_runs: "job_name,status,job_started_at,job_finished_at,records_inserted,records_skipped,error_message",
    data_provider_runs:
      "job_run_id,provider,data_kind,status,provider_started_at,provider_finished_at,records_inserted,records_skipped,error_message"
  };

  const tablesWithMissingColumns: string[] = [];

  for (const [table, columns] of Object.entries(requiredColumnSelects)) {
    const { error } = await supabase.from(table).select(columns, { head: true }).limit(1);

    if (error) {
      tablesWithMissingColumns.push(table);
    }
  }

  if (tablesWithMissingColumns.length > 0) {
    console.error("Schema column check: failure");
    console.error(`Missing required shared-ledger columns on: ${tablesWithMissingColumns.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log("Supabase connection: success");
  console.log("Table readiness: success");
  console.log("Shared-ledger schema readiness: success");
}

main().catch((error: unknown) => {
  console.error("Stage 1 smoke test failed.");
  console.error(error instanceof Error ? error.message : "Unknown error.");
  process.exitCode = 1;
});
