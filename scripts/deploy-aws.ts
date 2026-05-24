import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
    ...appParameterOverrides(parameters, certificateArn),
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
    ...appParameterOverrides(parameters, certificateArn),
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
  dotenv.config({ path: `.env.${parameters.EnvironmentName}`, quiet: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    VITE_API_BASE_URL: `https://${parameters.ApiDomainName}`,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || parameters.SupabaseUrl
  };

  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    fail(`VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required in .env.${parameters.EnvironmentName} for web deploy.`);
  }

  process.env.VITE_API_BASE_URL = env.VITE_API_BASE_URL;
  process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

  run("corepack", ["pnpm", "--filter", "@family-ledger/web", "exec", "tsc", "-b"], { env });
  run("corepack", ["pnpm", "--filter", "@family-ledger/web", "exec", "vite", "build", "--mode", parameters.EnvironmentName], { env });
  verifyWebBuild(parameters, {
    apiBaseUrl: env.VITE_API_BASE_URL,
    supabaseUrl: env.VITE_SUPABASE_URL,
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY
  });

  const webBucketName = getStackOutput(parameters.AppRegion, appStackName(parameters.EnvironmentName), "WebBucketName");
  const distributionId = getStackOutput(parameters.AppRegion, appStackName(parameters.EnvironmentName), "WebDistributionId");

  run("aws", ["s3", "sync", join("apps", "web", "dist"), `s3://${webBucketName}`, "--delete", "--region", parameters.AppRegion]);
  run("aws", ["cloudfront", "create-invalidation", "--distribution-id", distributionId, "--paths", "/*"]);
}

function getCertificateArn(parameters: DeploymentParameters): string {
  return getStackOutput(parameters.CertificateRegion, certificateStackName(parameters.EnvironmentName), "WebCertificateArn");
}

function verifyWebBuild(
  parameters: DeploymentParameters,
  expected: { apiBaseUrl: string; supabaseUrl: string; supabaseAnonKey: string }
): void {
  const assetsDirectory = join("apps", "web", "dist", "assets");
  const javascriptFiles = readdirSync(assetsDirectory)
    .filter((fileName) => fileName.endsWith(".js"))
    .map((fileName) => readFileSync(join(assetsDirectory, fileName), "utf8"));
  const bundle = javascriptFiles.join("\n");

  if (bundle.includes("const ez=void 0") || bundle.includes("const tz=void 0")) {
    fail("Web build is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
  }

  if (!bundle.includes(expected.apiBaseUrl)) {
    fail(`Web build is missing VITE_API_BASE_URL for ${expected.apiBaseUrl}.`);
  }

  if (!bundle.includes(expected.supabaseUrl)) {
    fail("Web build is missing the configured Supabase URL.");
  }

  if (!bundle.includes(expected.supabaseAnonKey)) {
    fail("Web build is missing VITE_SUPABASE_ANON_KEY.");
  }
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

function appParameterOverrides(parameters: DeploymentParameters, certificateArn: string): string[] {
  return [
    parameterOverride("EnvironmentName", parameters.EnvironmentName),
    parameterOverride("HostedZoneId", parameters.HostedZoneId),
    parameterOverride("WebDomainName", parameters.WebDomainName),
    parameterOverride("ApiDomainName", parameters.ApiDomainName),
    parameterOverride("CloudFrontCertificateArn", certificateArn),
    parameterOverride("SupabaseUrl", parameters.SupabaseUrl),
    parameterOverride("SupabaseUrlSsmParam", parameters.SupabaseUrlSsmParam),
    parameterOverride("SupabaseServiceKeySsmParam", parameters.SupabaseServiceKeySsmParam),
    parameterOverride("EnableScheduledJobs", parameters.EnableScheduledJobs)
  ].filter((override) => !override.endsWith("="));
}

function parameterOverride(key: string, value: string): string {
  return `${key}=${value}`;
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
