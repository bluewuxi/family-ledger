import { acquireLock, aws, command, getStack, jsonFile, output, region, stackName, statePrefix, summary } from "./deployment-runtime";

/** Operator-run bootstrap, separate from the application stack and inaccessible to CI. */
function main(): void {
  if (process.env.GITHUB_ACTIONS) throw new Error("Bootstrap is operator-only.");
  const repo = JSON.parse(command("gh", ["repo", "view", "--json", "nameWithOwner"])).nameWithOwner as string;
  const oidc = JSON.parse(command("gh", ["api", `repos/${repo}/actions/oidc/customization/sub`])) as { use_default: boolean; sub_claim_prefix: string };
  if (!oidc.use_default || !oidc.sub_claim_prefix) throw new Error("Custom OIDC subjects need independent trust-policy review.");
  const subject = `${oidc.sub_claim_prefix}:environment:test`;
  const account = aws<{ Account: string }>(["sts", "get-caller-identity"]).Account;
  const arn = (service: string, resource: string, location = region) => `arn:aws:${service}:${location}:${account}:${resource}`;
  const live = getStack();
  if (live.StackStatus !== "UPDATE_COMPLETE") throw new Error("Bootstrap requires a stable existing TEST stack.");
  const resources = aws<{ StackResourceSummaries: { LogicalResourceId: string; ResourceType: string; PhysicalResourceId: string }[] }>(["cloudformation", "list-stack-resources", "--stack-name", stackName]).StackResourceSummaries;
  const functions = resources.filter(r => r.ResourceType === "AWS::Lambda::Function").map(r => arn("lambda", `function:${r.PhysicalResourceId}`));
  const schedules = resources.filter(r => r.ResourceType === "AWS::Scheduler::Schedule").map(r => arn("scheduler", `schedule/default/${r.PhysicalResourceId}`));
  const schedulerRole = resources.find(r => r.LogicalResourceId === "SchedulerExecutionRole")!;
  const webBucket = output(live, "WebBucketName");
  const distribution = output(live, "WebDistributionId");
  const providers = aws<{ OpenIDConnectProviderList: { Arn: string }[] }>(["iam", "list-open-id-connect-providers"]).OpenIDConnectProviderList;
  const existing = providers.find(p => p.Arn.endsWith("oidc-provider/token.actions.githubusercontent.com"));
  if (existing) {
    const provider = aws<{ ClientIDList: string[] }>(["iam", "get-open-id-connect-provider", "--open-id-connect-provider-arn", existing.Arn]);
    if (!provider.ClientIDList.includes("sts.amazonaws.com")) throw new Error("Existing GitHub OIDC provider does not accept the STS audience.");
  }
  const allow = (Action: string[], Resource: unknown, extra: object = {}) => ({ Effect: "Allow", Action, Resource, ...extra });
  const assume = (service: string) => ({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: service }, Action: "sts:AssumeRole" }] });
  const artifactArn = { "Fn::Sub": "arn:${AWS::Partition}:s3:::${Artifacts}" };
  const artifactObjects = { "Fn::Sub": "arn:${AWS::Partition}:s3:::${Artifacts}/*" };
  const template = {
    AWSTemplateFormatVersion: "2010-09-09", Description: "Operator-managed TEST GitHub OIDC deployment bootstrap; never updated by application CI.",
    Resources: {
      ...(!existing ? { GitHubOidc: { Type: "AWS::IAM::OIDCProvider", Properties: { Url: "https://token.actions.githubusercontent.com", ClientIdList: ["sts.amazonaws.com"] } } } : {}),
      Artifacts: { Type: "AWS::S3::Bucket", DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain", Properties: {
        PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
        BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
        VersioningConfiguration: { Status: "Enabled" }
      } },
      ArtifactPolicy: { Type: "AWS::S3::BucketPolicy", Properties: { Bucket: { Ref: "Artifacts" }, PolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Deny", Principal: "*", Action: "s3:*", Resource: [artifactArn, artifactObjects], Condition: { Bool: { "aws:SecureTransport": "false" } } }] } } },
      ExecutionRole: { Type: "AWS::IAM::Role", Properties: { AssumeRolePolicyDocument: assume("cloudformation.amazonaws.com"), Policies: [{ PolicyName: "ExistingTestCodeOnly", PolicyDocument: { Version: "2012-10-17", Statement: [
        allow(["lambda:GetFunction", "lambda:GetFunctionConfiguration", "lambda:UpdateFunctionCode"], functions),
        allow(["s3:GetObject", "s3:GetObjectVersion"], artifactObjects),
        allow(["scheduler:GetSchedule", "scheduler:UpdateSchedule"], schedules),
        allow(["iam:PassRole"], arn("iam", `role/${schedulerRole.PhysicalResourceId}`, ""), { Condition: { StringEquals: { "iam:PassedToService": "scheduler.amazonaws.com" } } })
      ] } }] } },
      DeployRole: { Type: "AWS::IAM::Role", Properties: { MaxSessionDuration: 7200, AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Federated: existing?.Arn ?? { Ref: "GitHubOidc" } }, Action: "sts:AssumeRoleWithWebIdentity", Condition: { StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com", "token.actions.githubusercontent.com:sub": subject } } }] }, Policies: [{ PolicyName: "TestDeployment", PolicyDocument: { Version: "2012-10-17", Statement: [
        allow(["cloudformation:DescribeStacks", "cloudformation:GetTemplate", "cloudformation:ListStackResources", "cloudformation:DescribeStackEvents", "cloudformation:CreateChangeSet", "cloudformation:DescribeChangeSet", "cloudformation:ExecuteChangeSet", "cloudformation:DeleteChangeSet"], [arn("cloudformation", `stack/${stackName}/*`), arn("cloudformation", "changeSet/ci-*/*")]),
        allow(["cloudformation:CreateChangeSet"], `arn:aws:cloudformation:${region}:aws:transform/Serverless-2016-10-31`),
        allow(["cloudformation:ValidateTemplate"], "*"),
        allow(["iam:PassRole"], { "Fn::GetAtt": ["ExecutionRole", "Arn"] }, { Condition: { StringEquals: { "iam:PassedToService": "cloudformation.amazonaws.com" } } }),
        allow(["s3:GetBucketLocation", "s3:ListBucket"], [artifactArn, `arn:aws:s3:::${webBucket}`]),
        allow(["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject"], [artifactObjects, `arn:aws:s3:::${webBucket}/*`]),
        allow(["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"], arn("cloudfront", `distribution/${distribution}`, "")),
        allow(["lambda:GetFunction", "lambda:GetFunctionConfiguration"], functions),
        allow(["ssm:GetParameter"], ["migration-approval", "infrastructure-approval", "last-success", "status", "lock"].map(k => arn("ssm", `parameter${statePrefix}/${k}`))),
        allow(["ssm:PutParameter"], ["last-success", "status", "lock"].map(k => arn("ssm", `parameter${statePrefix}/${k}`))),
        allow(["ssm:DeleteParameter"], arn("ssm", `parameter${statePrefix}/lock`))
      ] } }] } }
    },
    Outputs: { DeployRoleArn: { Value: { "Fn::GetAtt": ["DeployRole", "Arn"] } }, ExecutionRoleArn: { Value: { "Fn::GetAtt": ["ExecutionRole", "Arn"] } }, ArtifactBucket: { Value: { Ref: "Artifacts" } } }
  };
  const file = jsonFile("bootstrap.json", template).slice(7);
  command("aws", ["cloudformation", "deploy", "--template-file", file, "--stack-name", "family-ledger-test-delivery", "--capabilities", "CAPABILITY_IAM", "--no-fail-on-empty-changeset", "--region", region]);
  const deployed = aws<{ Stacks: { Outputs: { OutputKey: string; OutputValue: string }[] }[] }>(["cloudformation", "describe-stacks", "--stack-name", "family-ledger-test-delivery"]).Stacks[0];
  const value = (key: string) => deployed.Outputs.find(o => o.OutputKey === key)!.OutputValue;
  command("gh", ["api", "--method", "PUT", `repos/${repo}/environments/test`, "--input", jsonFile("environment.json", { deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } }).slice(7)]);
  const policies = JSON.parse(command("gh", ["api", `repos/${repo}/environments/test/deployment-branch-policies`])) as { branch_policies: { name: string }[] };
  if (policies.branch_policies.some(p => p.name !== "test")) throw new Error("Unexpected environment branch policies; review before enabling deployment.");
  if (!policies.branch_policies.length) command("gh", ["api", "--method", "POST", `repos/${repo}/environments/test/deployment-branch-policies`, "--input", jsonFile("branch-policy.json", { name: "test", type: "branch" }).slice(7)]);
  for (const [key, val] of Object.entries({ AWS_REGION: region, DEPLOY_ROLE_ARN: value("DeployRoleArn"), DEPLOY_EXECUTION_ROLE_ARN: value("ExecutionRoleArn"), DEPLOY_ARTIFACT_BUCKET: value("ArtifactBucket") })) command("gh", ["variable", "set", key, "--env", "test", "--body", val]);
  summary("TEST bootstrap and restricted GitHub environment configured. Automatic deployment remains controlled by TEST_AUTO_DEPLOY_ENABLED; establish verified baselines before enabling it.");
}
let releaseLock: (() => void) | undefined;
try {
  if (process.env.GITHUB_ACTIONS) throw new Error("Bootstrap is operator-only.");
  releaseLock = acquireLock(`operator:bootstrap:${Date.now()}`);
  main();
} catch (error) {
  console.error(error instanceof Error && !("stderr" in error) ? error.message : "Bootstrap command failed; inspect the private local command result and CloudFormation stack events.");
  process.exitCode = 1;
} finally { releaseLock?.(); }
