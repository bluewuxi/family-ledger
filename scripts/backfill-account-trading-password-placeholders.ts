import { GetParameterCommand, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.test", quiet: true });

const placeholderValue = "尚未设置交易密码";
const shouldApply = process.argv.includes("--apply");

interface AccountRow {
  id: string;
  name: string;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const ssm = new SSMClient({ region: requiredEnv("AWS_REGION") });
  const supabase = createClient(requiredEnv("SUPABASE_URL"), await resolveSecureParameter(ssm, requiredEnv("SUPABASE_SECRET_KEY_SSM_PARAM")), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  const prefix = requiredEnv("TRADING_PASSWORD_SSM_PREFIX");

  const { data, error } = await supabase.from("investment_accounts").select("id, name").order("name", { ascending: true });

  if (error) {
    throw new Error("Failed to list investment accounts.");
  }

  const accounts = (data ?? []) as AccountRow[];
  const missing: AccountRow[] = [];

  for (const account of accounts) {
    const parameterName = `${prefix}${account.id}`;

    if (await parameterExists(ssm, parameterName)) {
      continue;
    }

    missing.push(account);

    if (shouldApply) {
      await ssm.send(
        new PutParameterCommand({
          Name: parameterName,
          Type: "SecureString",
          Value: placeholderValue,
          Overwrite: false
        })
      );
    }
  }

  console.log(`Accounts checked: ${accounts.length}`);
  console.log(`Missing trading password placeholders: ${missing.length}`);

  if (missing.length > 0) {
    console.log(`Mode: ${shouldApply ? "applied placeholders" : "dry run; rerun with --apply to create placeholders"}`);
    for (const account of missing) {
      console.log(`- ${account.name} (${account.id})`);
    }
  }
}

async function parameterExists(ssm: SSMClient, parameterName: string): Promise<boolean> {
  try {
    await ssm.send(
      new GetParameterCommand({
        Name: parameterName,
        WithDecryption: false
      })
    );
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "ParameterNotFound") {
      return false;
    }

    throw error;
  }
}

async function resolveSecureParameter(ssm: SSMClient, parameterName: string): Promise<string> {
  const response = await ssm.send(
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

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}
