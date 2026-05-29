import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";
import { backupLedgerData } from "../apps/jobs/src/services/ledgerBackupService";

type EnvironmentName = "test" | "prod";

interface DeploymentParameters {
  EnvironmentName: EnvironmentName;
  AppRegion: string;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Ledger backup failed.");
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const environmentName = parseEnvironment(process.argv.slice(2));
  const parameters = loadParameters(environmentName);

  dotenv.config({ path: `.env.${environmentName}`, override: false });
  process.env.ENVIRONMENT_NAME = environmentName;
  process.env.AWS_REGION = process.env.AWS_REGION || parameters.AppRegion;
  process.env.BACKUP_BUCKET_NAME = process.env.BACKUP_BUCKET_NAME || getStackOutput(parameters.AppRegion, appStackName(environmentName), "BackupBucketName");

  const result = await backupLedgerData({
    environmentName,
    bucketName: process.env.BACKUP_BUCKET_NAME
  });

  console.log("Ledger backup completed");
  console.log(`Environment: ${environmentName}`);
  console.log(`Bucket: ${result.bucketName}`);
  console.log(`Object key: ${result.objectKey}`);
  console.log(`Rows exported: ${result.totalRows}`);
  console.log(`Content SHA-256: ${result.contentSha256}`);
}

function parseEnvironment(args: string[]): EnvironmentName {
  const envFlagIndex = args.indexOf("--env");
  const value = envFlagIndex >= 0 ? args[envFlagIndex + 1] : args[0];

  if (value !== "test" && value !== "prod") {
    throw new Error("Usage: tsx scripts/backup-ledger-data.ts --env <test|prod>");
  }

  return value;
}

function loadParameters(environmentName: EnvironmentName): DeploymentParameters {
  const parameterPath = join("infra", "aws", `parameters.${environmentName}.json`);

  if (!existsSync(parameterPath)) {
    throw new Error(`Missing ${parameterPath}. For prod, copy parameters.prod.example.json to parameters.prod.json first.`);
  }

  const parameters = JSON.parse(readFileSync(parameterPath, "utf8")) as DeploymentParameters;

  if (parameters.EnvironmentName !== environmentName) {
    throw new Error(`Parameter file environment ${parameters.EnvironmentName} does not match requested ${environmentName}.`);
  }

  return parameters;
}

function getStackOutput(region: string, stackName: string, outputKey: string): string {
  const output = execFileSync(
    "aws",
    [
      "cloudformation",
      "describe-stacks",
      "--region",
      region,
      "--stack-name",
      stackName,
      "--query",
      `Stacks[0].Outputs[?OutputKey=='${outputKey}'].OutputValue | [0]`,
      "--output",
      "text"
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  ).trim();

  if (!output || output === "None") {
    throw new Error(`CloudFormation output ${outputKey} was not found on stack ${stackName}.`);
  }

  return output;
}

function appStackName(environmentName: EnvironmentName): string {
  return `family-ledger-${environmentName}`;
}
