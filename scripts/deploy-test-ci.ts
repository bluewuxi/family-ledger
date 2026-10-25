import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assertCodeOnlyChanges, assertManifest, canonical, docsOnly, infrastructureShape, parseTemplate, sha256, type JsonObject } from "./deployment-policy";
import { infrastructureManifest, migrationManifest, publicRuntimeConfig, type Approval } from "./deployment-manifests";
import { acquireLock, aws, command, getStack, getState, headSha, jsonFile, output, putState, readParameters, region, stackName, summary } from "./deployment-runtime";
import { commitVerifiedRelease, type Release } from "./deployment-release";
import { assertLiveSchedule, resolveSchedule } from "./deployment-schedules";
import { buildLambdaArtifacts } from "./deployment-build";

interface ChangeSet { Status: string; StatusReason?: string; ExecutionStatus?: string; Changes?: Parameters<typeof assertCodeOnlyChanges>[0]; NextToken?: string; }
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function deployTestCi(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REF !== "refs/heads/test" || !["push", "workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME ?? "")) throw new Error("Automatic TEST deployment requires a trusted test-branch GitHub Actions run.");
  const commit = headSha();
  if (commit !== process.env.GITHUB_SHA) throw new Error("Checkout does not match the triggering commit.");
  const runUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const owner = `${runUrl}/attempts/${process.env.GITHUB_RUN_ATTEMPT}`;
  const release = acquireLock(owner);
  let stage = "preflight";
  try {
    const latest = command("git", ["ls-remote", "origin", "refs/heads/test"]).split(/\s/)[0];
    if (latest !== commit) { summary("Superseded by a newer test commit; no deployment performed."); return; }
    const previous = getState<Release>("last-success");
    const changed = command("git", ["diff", "--name-only", previous.commit, commit]).trim().split(/\r?\n/).filter(Boolean);
    assertManifest(migrationManifest(), getState<Approval>("migration-approval").files, "Migration manifest");
    assertManifest(infrastructureManifest(), getState<Approval>("infrastructure-approval").files, "Infrastructure baseline");
    if (docsOnly(changed)) { summary("Documentation-only change; no deployment performed."); return; }
    putState("status", { commit, stage, runUrl, updatedAt: new Date().toISOString() });
    const stack = getStack();
    if (!["UPDATE_COMPLETE", "CREATE_COMPLETE"].includes(stack.StackStatus)) throw new Error("TEST stack is not ready for a new deployment; independent recovery required.");
    const p = readParameters();
    for (const [key, value] of Object.entries(p)) {
      if (["AppRegion", "CertificateRegion"].includes(key) || value === "") continue;
      if (stack.Parameters.find(v => v.ParameterKey === key)?.ParameterValue !== value) throw new Error(`Live stack parameter ${key} differs from the confirmed configuration.`);
    }
    const liveBody = aws<{ TemplateBody: string | JsonObject }>(["cloudformation", "get-template", "--stack-name", stackName, "--template-stage", "Original"]).TemplateBody;
    const live = typeof liveBody === "string" ? parseTemplate(liveBody) : liveBody;
    const local = parseTemplate(readFileSync("infra/aws/template.yaml", "utf8"));
    if (canonical(infrastructureShape(live)) !== canonical(infrastructureShape(local))) throw new Error("Live infrastructure does not match the confirmed source template.");
    const bucket = required("DEPLOY_ARTIFACT_BUCKET");
    const role = required("DEPLOY_EXECUTION_ROLE_ARN");
    stage = "packaging";
    putState("status", { commit, stage, runUrl, updatedAt: new Date().toISOString() });
    summary(`TEST release ${commit}: checks and baseline gates passed; packaging Lambda artifacts.`);
    // The validation job has a separate filesystem; compile workspace exports on this runner too.
    command("corepack", ["pnpm", "--filter", "@family-ledger/shared", "build"]);
    command("sam", ["validate", "--template", "infra/aws/template.yaml", "--region", region]);
    const buildTemplate = await buildLambdaArtifacts();
    command("sam", ["package", "--template-file", buildTemplate, "--s3-bucket", bucket, "--s3-prefix", "lambda", "--output-template-file", ".aws-sam/deployment/packaged.json", "--use-json", "--region", region]);
    const candidate = JSON.parse(readFileSync(".aws-sam/deployment/packaged.json", "utf8"));
    if (canonical(infrastructureShape(live)) !== canonical(infrastructureShape(candidate))) throw new Error("SAM packaging introduced a non-code infrastructure change.");
    const templateKey = `templates/${commit}-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}.json`;
    aws(["s3api", "put-object", "--bucket", bucket, "--key", templateKey, "--body", ".aws-sam/deployment/packaged.json"]);
    const name = `ci-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
    stage = "change-set-review";
    putState("status", { commit, stage, runUrl, updatedAt: new Date().toISOString() });
    const created = aws<{ Id: string }>(["cloudformation", "create-change-set", "--cli-input-json", jsonFile("create-change-set.json", {
      StackName: stackName, ChangeSetName: name, ChangeSetType: "UPDATE", RoleARN: role,
      TemplateURL: `https://${bucket}.s3.${region}.amazonaws.com/${templateKey}`,
      Parameters: stack.Parameters.map(v => ({ ParameterKey: v.ParameterKey, UsePreviousValue: true })),
      Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"], Tags: stack.Tags,
      Description: `TEST code release ${commit}`
    })]);
    let detail: ChangeSet;
    const deadline = Date.now() + 10 * 60_000;
    do {
      detail = aws<ChangeSet>(["cloudformation", "describe-change-set", "--change-set-name", created.Id, "--include-property-values"]);
      if (!["CREATE_PENDING", "CREATE_IN_PROGRESS"].includes(detail.Status)) break;
      if (Date.now() > deadline) throw new Error("Change set creation timed out.");
      await pause(5000);
    } while (true);
    const noChanges = detail.Status === "FAILED" && /didn.t contain changes|No updates are to be performed/i.test(detail.StatusReason ?? "");
    if (!noChanges) {
      if (detail.Status !== "CREATE_COMPLETE" || detail.ExecutionStatus !== "AVAILABLE") {
        const denied = /not authorized to perform: ([A-Za-z0-9:*]+)/.exec(detail.StatusReason ?? "")?.[1];
        throw new Error(`CloudFormation change set ${name} is not executable (${detail.Status}${denied ? `; denied action ${denied}` : ""}); inspect the change set using operator credentials.`);
      }
      const changes = [...(detail.Changes ?? [])];
      while (detail.NextToken) {
        detail = aws<ChangeSet>(["cloudformation", "describe-change-set", "--change-set-name", created.Id, "--include-property-values", "--next-token", detail.NextToken]);
        changes.push(...(detail.Changes ?? []));
      }
      assertCodeOnlyChanges(changes, live, candidate);
      const affectedSchedules = changes.map(c => c.ResourceChange).filter(r => r?.ResourceType === "AWS::Scheduler::Schedule");
      if (affectedSchedules.length) {
        const listed = aws<{ StackResourceSummaries: { LogicalResourceId: string; ResourceType: string; PhysicalResourceId: string }[] }>(["cloudformation", "list-stack-resources", "--stack-name", stackName]).StackResourceSummaries;
        const arns: Record<string, string> = {};
        for (const r of listed) {
          if (r.ResourceType === "AWS::Lambda::Function") arns[r.LogicalResourceId] = aws<{ FunctionArn: string }>(["lambda", "get-function-configuration", "--function-name", r.PhysicalResourceId]).FunctionArn;
          if (r.ResourceType === "AWS::IAM::Role") arns[r.LogicalResourceId] = `arn:aws:iam::${role.split(":")[4]}:role/${r.PhysicalResourceId}`;
        }
        const params = Object.fromEntries(stack.Parameters.map(p => [p.ParameterKey, p.ParameterValue]));
        for (const schedule of affectedSchedules) {
          const resource = (live.Resources as Record<string, JsonObject>)[schedule!.LogicalResourceId!];
          const expected = resolveSchedule(resource.Properties, params, arns) as JsonObject;
          const actual = aws<JsonObject>(["scheduler", "get-schedule", "--name", String(expected.Name)]);
          assertLiveSchedule(expected, actual);
        }
      }
      stage = "backend-updating";
      putState("status", { commit, stage, runUrl, updatedAt: new Date().toISOString() });
      aws(["cloudformation", "execute-change-set", "--change-set-name", created.Id]);
      command("aws", ["cloudformation", "wait", "stack-update-complete", "--stack-name", stackName, "--region", region]);
    } else {
      aws(["cloudformation", "delete-change-set", "--change-set-name", created.Id]);
      summary("Backend artifacts unchanged; continuing with web publication and verification.");
    }
    const resources = aws<{ StackResourceSummaries: { ResourceType: string; PhysicalResourceId: string }[] }>(["cloudformation", "list-stack-resources", "--stack-name", stackName]);
    for (const r of resources.StackResourceSummaries.filter(r => r.ResourceType === "AWS::Lambda::Function")) {
      command("aws", ["lambda", "wait", "function-updated-v2", "--function-name", r.PhysicalResourceId, "--region", region]);
      const state = aws<{ State: string; LastUpdateStatus: string }>(["lambda", "get-function-configuration", "--function-name", r.PhysicalResourceId]);
      if (state.State !== "Active" || state.LastUpdateStatus !== "Successful") throw new Error("A TEST Lambda is not ready after backend update.");
    }
    stage = "web-publishing";
    putState("status", { commit, stage, runUrl, updatedAt: new Date().toISOString() });
    command("corepack", ["pnpm", "deploy:web:test"]);
    stage = "verifying";
    putState("status", { commit, stage, runUrl, updatedAt: new Date().toISOString() });
    const record = await commitVerifiedRelease({ commit, runUrl, backendDigest: sha256(readFileSync(".aws-sam/deployment/packaged.json")), verify: () => verifyLiveWeb(), save: putState });
    stage = "verified";
    summary(`TEST deployment verified. Commit: ${commit}. Artifact SHA-256: ${record.artifactDigest}. [Run](${runUrl}). Authenticated visual acceptance is separate.`);
  } catch (error) {
    // Do not copy AWS responses or environment values into this public repository's logs.
    const reason = error instanceof Error && !("stderr" in error) ? error.message : "External deployment command failed; inspect AWS operation status using operator credentials.";
    try { putState("status", { commit, stage, failed: true, reason, runUrl, updatedAt: new Date().toISOString() }); } catch { /* Preserve the original failure. */ }
    summary(`TEST release failed at ${stage}: ${reason}. Last successful release was not advanced. Backend/web changes may already be present; recover or rerun before another independent deployment.`);
    throw new Error("TEST deployment did not pass all release gates.");
  } finally { release(); }
}
function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`Missing deployment setting ${name}.`); return value; }
export async function verifyLiveWeb(options: { webUrl?: string; config?: ReturnType<typeof publicRuntimeConfig>; fetcher?: typeof fetch } = {}): Promise<string> {
  const config = options.config ?? publicRuntimeConfig();
  const webUrl = options.webUrl ?? output(getStack(), "WebUrl");
  const fetcher = options.fetcher ?? fetch;
  const fetchBytes = async (url: string): Promise<Buffer> => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (!response.ok) throw new Error(`Deployment HTTP check failed with ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  };
  const health = JSON.parse((await fetchBytes(`${config.apiBaseUrl}/health`)).toString());
  if (health.success !== true || health.data?.status !== "ok") throw new Error("API health response is invalid.");
  const unauthorized = await fetcher(`${config.apiBaseUrl}/dashboard`, { signal: AbortSignal.timeout(30_000) });
  if (unauthorized.status !== 401) throw new Error("Unauthenticated API authorization boundary failed.");
  const remoteConfig = JSON.parse((await fetchBytes(`${webUrl}/config.json`)).toString());
  if (canonical(remoteConfig) !== canonical(config)) throw new Error("Live public runtime configuration differs from this release.");
  const localHtml = readFileSync("apps/web/dist/index.html");
  const html = await fetchBytes(`${webUrl}/index.html`);
  if (sha256(html) !== sha256(localHtml)) throw new Error("Live index.html does not match this release.");
  const assets = [...localHtml.toString().matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(m => m[1]);
  if (!assets.length) throw new Error("No JS/CSS entry assets found in the built HTML.");
  for (const asset of assets) if (sha256(await fetchBytes(`${webUrl}${asset}`)) !== sha256(readFileSync(join("apps/web/dist", asset)))) throw new Error("Live entry asset differs from this release.");
  const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(directory, e.name)) : [join(directory, e.name)]);
  return sha256(canonical(Object.fromEntries(files("apps/web/dist").sort().map(p => [p.replaceAll("\\", "/"), sha256(readFileSync(p))]))));
}
