import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

type EnvironmentName = "test" | "prod";
type CommandName = "certs" | "infra" | "web" | "all" | "change-set";

interface DeploymentParameters {
  EnvironmentName: EnvironmentName;
  AppRegion: string;
  CertificateRegion: string;
  HostedZoneId: string;
  WebDomainName: string;
  ApiDomainName: string;
  SupabaseUrl: string;
  SupabaseUrlSsmParam: string;
  SupabaseServiceKeySsmParam: string;
  EnableScheduledJobs: "true" | "false";
  ScheduledJobsTimezone?: string;
  UpdateFxRatesScheduleExpression?: string;
  UpdatePricesScheduleExpression?: string;
  GeneratePortfolioSnapshotsScheduleExpression?: string;
  BackupLedgerDataScheduleExpression?: string;
}

interface WebRuntimeConfig {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const [, , commandArg, environmentArg] = process.argv;
const command = parseCommand(commandArg);
const environmentName = parseEnvironment(environmentArg);
const parameters = loadParameters(environmentName);

if (parameters.EnvironmentName !== environmentName) {
  fail(`Parameter file environment ${parameters.EnvironmentName} does not match requested ${environmentName}.`);
}

switch (command) {
  case "certs":
    assertDeployable(parameters);
    deployCertificates(parameters);
    break;
  case "infra":
    assertDeployable(parameters);
    deployInfrastructure(parameters);
    break;
  case "web":
    assertDeployable(parameters);
    deployWeb(parameters);
    break;
  case "all":
    assertDeployable(parameters);
    deployCertificates(parameters);
    deployInfrastructure(parameters);
    deployWeb(parameters);
    break;
  case "change-set":
    assertDeployable(parameters);
    createInfrastructureChangeSet(parameters);
    break;
}

function parseCommand(value: string | undefined): CommandName {
  const commands: CommandName[] = ["certs", "infra", "web", "all", "change-set"];

  if (!value || !commands.includes(value as CommandName)) {
    fail(`Usage: tsx scripts/deploy-aws.ts <${commands.join("|")}> <test|prod>`);
  }

  return value as CommandName;
}

function parseEnvironment(value: string | undefined): EnvironmentName {
  if (value !== "test" && value !== "prod") {
    fail("Environment must be test or prod.");
  }

  return value;
}

function loadParameters(environmentName: EnvironmentName): DeploymentParameters {
  const parameterPath = join("infra", "aws", `parameters.${environmentName}.json`);

  if (!existsSync(parameterPath)) {
    fail(`Missing ${parameterPath}. For prod, copy parameters.prod.example.json to parameters.prod.json first.`);
  }

  return JSON.parse(readFileSync(parameterPath, "utf8")) as DeploymentParameters;
}

function assertDeployable(parameters: DeploymentParameters): void {
  const requiredKeys: Array<keyof DeploymentParameters> = [
    "AppRegion",
    "CertificateRegion",
    "HostedZoneId",
    "WebDomainName",
    "ApiDomainName",
    "SupabaseServiceKeySsmParam"
  ];

  for (const key of requiredKeys) {
    const value = parameters[key];
    if (!value || String(value).includes("REPLACE_WITH")) {
      fail(`Parameter ${key} must be set before deployment.`);
    }
  }

  if (!parameters.SupabaseUrl && !parameters.SupabaseUrlSsmParam) {
    fail("Set either SupabaseUrl or SupabaseUrlSsmParam before deployment.");
  }
}

function deployCertificates(parameters: DeploymentParameters): void {
  run("aws", [
    "cloudformation",
    "deploy",
    "--region",
    parameters.CertificateRegion,
    "--stack-name",
    certificateStackName(parameters.EnvironmentName),
    "--template-file",
    join("infra", "aws", "certificates.yaml"),
    "--parameter-overrides",
    parameterOverride("EnvironmentName", parameters.EnvironmentName),
    parameterOverride("HostedZoneId", parameters.HostedZoneId),
    parameterOverride("WebDomainName", parameters.WebDomainName),
    "--tags",
    "Project=family-ledger",
    `Environment=${parameters.EnvironmentName}`
  ]);
}

function deployInfrastructure(parameters: DeploymentParameters): void {
  const certificateArn = getCertificateArn(parameters);
  buildSamTemplate();

  run("sam", [
    "deploy",
    "--region",
    parameters.AppRegion,
    "--stack-name",
    appStackName(parameters.EnvironmentName),
    "--template-file",
    join(".aws-sam", "build", "template.yaml"),
    "--resolve-s3",
    "--capabilities",
    "CAPABILITY_IAM",
    "CAPABILITY_NAMED_IAM",
    "--parameter-overrides",
    appParameterOverridesFile(parameters, certificateArn),
    "--tags",
    "Project=family-ledger",
    `Environment=${parameters.EnvironmentName}`
  ]);
}

function createInfrastructureChangeSet(parameters: DeploymentParameters): void {
  const certificateArn = getCertificateArn(parameters);
  buildSamTemplate();

  run("sam", [
    "deploy",
    "--region",
    parameters.AppRegion,
    "--stack-name",
    appStackName(parameters.EnvironmentName),
    "--template-file",
    join(".aws-sam", "build", "template.yaml"),
    "--resolve-s3",
    "--capabilities",
    "CAPABILITY_IAM",
    "CAPABILITY_NAMED_IAM",
    "--no-execute-changeset",
    "--parameter-overrides",
    appParameterOverridesFile(parameters, certificateArn),
    "--tags",
    "Project=family-ledger",
    `Environment=${parameters.EnvironmentName}`
  ]);
}

function buildSamTemplate(): void {
  run("sam", ["validate", "--template", join("infra", "aws", "template.yaml")]);
  run("sam", ["build", "--template", join("infra", "aws", "template.yaml")]);
}

function deployWeb(parameters: DeploymentParameters): void {
  const deploymentEnv = loadDeploymentEnv(parameters.EnvironmentName);

  const runtimeConfig: WebRuntimeConfig = {
    apiBaseUrl: `https://${parameters.ApiDomainName}`,
    supabaseUrl: deploymentEnv.VITE_SUPABASE_URL || parameters.SupabaseUrl,
    supabaseAnonKey: deploymentEnv.VITE_SUPABASE_ANON_KEY ?? ""
  };

  if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
    fail(`VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required in .env.${parameters.EnvironmentName} for web deploy.`);
  }

  if (deploymentEnv.VITE_API_BASE_URL && normalizeUrl(deploymentEnv.VITE_API_BASE_URL) !== runtimeConfig.apiBaseUrl) {
    fail(`VITE_API_BASE_URL in .env.${parameters.EnvironmentName} must match https://${parameters.ApiDomainName}.`);
  }

  run("corepack", ["pnpm", "--filter", "@family-ledger/web", "exec", "tsc", "-b"]);
  run("corepack", [
    "pnpm",
    "--filter",
    "@family-ledger/web",
    "exec",
    "vite",
    "build",
    "--mode",
    parameters.EnvironmentName
  ]);
  writeWebRuntimeConfig(runtimeConfig);
  verifyWebRuntimeConfig(runtimeConfig);

  const webBucketName = getStackOutput(parameters.AppRegion, appStackName(parameters.EnvironmentName), "WebBucketName");
  const distributionId = getStackOutput(parameters.AppRegion, appStackName(parameters.EnvironmentName), "WebDistributionId");

  run("aws", ["s3", "sync", join("apps", "web", "dist"), `s3://${webBucketName}`, "--delete", "--region", parameters.AppRegion]);
  run("aws", ["cloudfront", "create-invalidation", "--distribution-id", distributionId, "--paths", "/*"]);
}

function loadDeploymentEnv(environmentName: EnvironmentName): Record<string, string> {
  const envPath = `.env.${environmentName}`;

  if (!existsSync(envPath)) {
    fail(`Missing ${envPath}.`);
  }

  return dotenv.parse(readFileSync(envPath, "utf8"));
}

function getCertificateArn(parameters: DeploymentParameters): string {
  return getStackOutput(parameters.CertificateRegion, certificateStackName(parameters.EnvironmentName), "WebCertificateArn");
}

function writeWebRuntimeConfig(config: WebRuntimeConfig): void {
  writeFileSync(join("apps", "web", "dist", "config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

function verifyWebRuntimeConfig(expected: WebRuntimeConfig): void {
  const config = JSON.parse(readFileSync(join("apps", "web", "dist", "config.json"), "utf8")) as WebRuntimeConfig;

  if (
    config.apiBaseUrl !== expected.apiBaseUrl ||
    config.supabaseUrl !== expected.supabaseUrl ||
    config.supabaseAnonKey !== expected.supabaseAnonKey
  ) {
    fail("Web runtime config does not match the expected deployment configuration.");
  }
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function getStackOutput(region: string, stackName: string, outputKey: string): string {
  return run("aws", [
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
  ]).trim();
}

function appParameterOverrides(parameters: DeploymentParameters, certificateArn: string): Array<{ ParameterKey: string; ParameterValue: string }> {
  return [
    parameterOverride("EnvironmentName", parameters.EnvironmentName),
    parameterOverride("HostedZoneId", parameters.HostedZoneId),
    parameterOverride("WebDomainName", parameters.WebDomainName),
    parameterOverride("ApiDomainName", parameters.ApiDomainName),
    parameterOverride("CloudFrontCertificateArn", certificateArn),
    parameterOverride("SupabaseUrl", parameters.SupabaseUrl),
    parameterOverride("SupabaseUrlSsmParam", parameters.SupabaseUrlSsmParam),
    parameterOverride("SupabaseServiceKeySsmParam", parameters.SupabaseServiceKeySsmParam),
    parameterOverride("EnableScheduledJobs", parameters.EnableScheduledJobs),
    parameterOverride("ScheduledJobsTimezone", parameters.ScheduledJobsTimezone ?? ""),
    parameterOverride("UpdateFxRatesScheduleExpression", parameters.UpdateFxRatesScheduleExpression ?? ""),
    parameterOverride("UpdatePricesScheduleExpression", parameters.UpdatePricesScheduleExpression ?? ""),
    parameterOverride("GeneratePortfolioSnapshotsScheduleExpression", parameters.GeneratePortfolioSnapshotsScheduleExpression ?? ""),
    parameterOverride("BackupLedgerDataScheduleExpression", parameters.BackupLedgerDataScheduleExpression ?? "")
  ].filter((override) => override.ParameterValue !== "");
}

function appParameterOverridesFile(parameters: DeploymentParameters, certificateArn: string): string {
  const directory = ".aws-sam";
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `parameter-overrides-${parameters.EnvironmentName}.yaml`);
  writeFileSync(path, toYamlParameterOverrides(appParameterOverrides(parameters, certificateArn)));
  return `file://${path.replace(/\\/gu, "/")}`;
}

function parameterOverride(key: string, value: string): { ParameterKey: string; ParameterValue: string } {
  return { ParameterKey: key, ParameterValue: value };
}

function toYamlParameterOverrides(overrides: Array<{ ParameterKey: string; ParameterValue: string }>): string {
  return `${overrides
    .map((override) => `${yamlString(override.ParameterKey)}: ${yamlString(override.ParameterValue)}`)
    .join("\n")}\n`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function certificateStackName(environmentName: EnvironmentName): string {
  return `family-ledger-${environmentName}-certificates`;
}

function appStackName(environmentName: EnvironmentName): string {
  return `family-ledger-${environmentName}`;
}

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}): string {
  console.log(`> ${command} ${args.join(" ")}`);
  const invocation = resolveInvocation(command, args);

  return execFileSync(invocation.command, invocation.args, {
    env: options.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });
}

function resolveInvocation(command: string, args: string[]): { command: string; args: string[] } {
  if (process.platform === "win32" && (command === "sam" || command === "corepack")) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", [command, ...args].map(quoteWindowsShellArg).join(" ")]
    };
  }

  return { command, args };
}

function quoteWindowsShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:=\\-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
