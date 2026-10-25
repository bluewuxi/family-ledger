import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { assertCodeOnlyChanges, assertManifest, canonical, decodeState, docsOnly, encodeState, infrastructureShape, parseTemplate } from "./deployment-policy";
import { migrationManifest, infrastructureManifest } from "./deployment-manifests";
import { publicRuntimeConfig } from "./deployment-manifests";
import { verifyLiveWeb } from "./deploy-test-ci";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { commitVerifiedRelease } from "./deployment-release";
import { assertLiveSchedule, resolveSchedule } from "./deployment-schedules";
import { buildLambdaArtifacts } from "./deployment-build";
import { isStableStack } from "./deployment-runtime";

const current = { Resources: {
  Api: { Type: "AWS::Serverless::Function", Properties: { CodeUri: "s3://old/code", FunctionName: "test-api", Role: "existing-role" } },
  Schedule: { Type: "AWS::Scheduler::Schedule", Properties: { Target: { Arn: { "Fn::GetAtt": ["Api", "Arn"] } }, ScheduleExpression: "existing" } }
} };
for (const status of ["CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"]) assert(isStableStack(status));
for (const status of ["UPDATE_IN_PROGRESS", "UPDATE_ROLLBACK_FAILED", "ROLLBACK_COMPLETE", "DELETE_COMPLETE"]) assert(!isStableStack(status));
const candidate = structuredClone(current);
candidate.Resources.Api.Properties.CodeUri = "s3://new/code";
const code = { ResourceChange: { LogicalResourceId: "Api", ResourceType: "AWS::Lambda::Function", Action: "Modify", Replacement: "False", Scope: ["Properties"], Details: [{ ChangeSource: "DirectModification", Evaluation: "Static", Target: { Attribute: "Properties", Name: "Code", RequiresRecreation: "Never" } }] } };
assert.doesNotThrow(() => assertCodeOnlyChanges([code], current, candidate));
assert.doesNotThrow(() => assertCodeOnlyChanges([], current, candidate));
for (const action of ["Add", "Remove", "Import", "Dynamic"]) assert.throws(() => assertCodeOnlyChanges([{ ResourceChange: { ...code.ResourceChange, Action: action } }], current, candidate));
for (const replacement of ["True", "Conditional", undefined]) assert.throws(() => assertCodeOnlyChanges([{ ResourceChange: { ...code.ResourceChange, Replacement: replacement } }], current, candidate));
for (const name of ["Role", "Environment", "Timeout", "Runtime", "FunctionName", undefined]) {
  const unsafe = structuredClone(code);
  unsafe.ResourceChange.Details[0].Target.Name = name as string;
  assert.throws(() => assertCodeOnlyChanges([unsafe], current, candidate));
}
const roleChange = structuredClone(candidate); roleChange.Resources.Api.Properties.Role = "other-role";
assert.throws(() => assertCodeOnlyChanges([code], current, roleChange));
const scheduleChange = { ResourceChange: { LogicalResourceId: "Schedule", ResourceType: "AWS::Scheduler::Schedule", Action: "Modify", Replacement: "False", Scope: ["Properties"], Details: [{ ChangeSource: "ResourceReference", Evaluation: "Dynamic", CausingEntity: "Api.Arn", Target: { Attribute: "Properties", Name: "Target", RequiresRecreation: "Never" } }] } };
assert.doesNotThrow(() => assertCodeOnlyChanges([code, scheduleChange], current, candidate));
const attributeReference = structuredClone(scheduleChange); attributeReference.ResourceChange.Details[0].ChangeSource = "ResourceAttribute";
assert.doesNotThrow(() => assertCodeOnlyChanges([code, attributeReference], current, candidate));
const incidentalIam = structuredClone(code); incidentalIam.ResourceChange.ResourceType = "AWS::IAM::Policy";
incidentalIam.ResourceChange.Details[0].Target.Name = "PolicyDocument";
assert.throws(() => assertCodeOnlyChanges([incidentalIam], current, candidate));
const incidentalApi = structuredClone(code); incidentalApi.ResourceChange.ResourceType = "AWS::ApiGatewayV2::Api";
incidentalApi.ResourceChange.Details[0].Target.Name = "Body";
assert.throws(() => assertCodeOnlyChanges([incidentalApi], current, candidate));
const changedSchedule = structuredClone(candidate); changedSchedule.Resources.Schedule.Properties.ScheduleExpression = "new";
assert.throws(() => assertCodeOnlyChanges([scheduleChange], current, changedSchedule));
const unknownReference = structuredClone(scheduleChange); unknownReference.ResourceChange.Details[0].CausingEntity = "Other.Arn";
assert.throws(() => assertCodeOnlyChanges([unknownReference], current, candidate));
const directSchedule = structuredClone(scheduleChange); directSchedule.ResourceChange.Details[0].ChangeSource = "DirectModification";
assert.throws(() => assertCodeOnlyChanges([directSchedule], current, candidate));
const desired = resolveSchedule({ Target: { Arn: { "Fn::GetAtt": ["Api", "Arn"] } }, State: { "Fn::If": ["ScheduledJobsEnabled", "ENABLED", "DISABLED"] } }, { EnableScheduledJobs: "true" }, { Api: "existing-api-arn" }) as Record<string, unknown>;
assert.deepEqual(desired, { Target: { Arn: "existing-api-arn" }, State: "ENABLED" });
assert.doesNotThrow(() => assertLiveSchedule(desired, { ...desired, GroupName: "default", ActionAfterCompletion: "NONE" }));
assert.throws(() => assertLiveSchedule(desired, { ...desired, State: "DISABLED" }));
assert.throws(() => assertLiveSchedule(desired, { ...desired, EndDate: "unexpected" }));
assert.throws(() => resolveSchedule({ "Fn::GetAtt": ["Unknown", "Arn"] }, {}, {}));
assert.throws(() => assertCodeOnlyChanges([{}], current, candidate));
assert.throws(() => assertCodeOnlyChanges([{ ResourceChange: { ...code.ResourceChange, Details: [] } }], current, candidate));
for (const files of [{ a: "new" }, { a: "old", b: "new" }, {}] as Record<string, string>[]) assert.throws(() => assertManifest(files, { a: "old" }, "Migration manifest"));
assert.doesNotThrow(() => assertManifest({ a: "same" }, { a: "same" }, "Migration manifest"));
const fullManifest = migrationManifest();
assert.deepEqual(decodeState(encodeState({ commit: "a".repeat(40), files: fullManifest })), { commit: "a".repeat(40), files: fullManifest });
assert(infrastructureManifest()["public-runtime-config"]);
assert(docsOnly(["docs/deployment.md", "AGENTS.md"]));
assert(docsOnly(["infra/aws/README.md", "packages/shared/README.md"]));
for (const paths of [[], ["docs/deployment.md", "supabase/migrations/new.sql"], ["packages/shared/src/index.ts"], ["pnpm-lock.yaml"], [".github/workflows/ci.yml"]]) assert(!docsOnly(paths));
assert.equal(canonical(parseTemplate("Value: !GetAtt Api.Arn\n")), canonical({ Value: { "Fn::GetAtt": ["Api", "Arn"] } }));
assert.equal(canonical(parseTemplate("Value: !Sub '${Name}'\n")), canonical({ Value: { "Fn::Sub": "${Name}" } }));
assert.equal(canonical(parseTemplate("Value: !Join [',', [a, b]]\n")), canonical({ Value: { "Fn::Join": [",", ["a", "b"]] } }));
const template = parseTemplate(readFileSync("infra/aws/template.yaml", "utf8"));
assert.doesNotThrow(() => canonical(infrastructureShape(template)));
for (const path of [".github/workflows/ci.yml", ".github/workflows/deploy-test.yml", ".github/actions/validate/action.yml"]) {
  const text = readFileSync(path, "utf8");
  assert.doesNotThrow(() => parse(text));
  for (const match of text.matchAll(/uses:\s+([^\s#]+)/g)) if (!match[1].startsWith("./")) assert.match(match[1], /@[a-f0-9]{40}$/);
}
console.log("Deployment verification passed: complete migration manifests, conservative change-set classification, packaging equivalence, documentation filtering, state encoding and pinned workflows.");

async function verifyPublicationChecks(): Promise<void> {
  const built = JSON.parse(readFileSync(await buildLambdaArtifacts(), "utf8"));
  assert.equal(canonical(infrastructureShape(built)), canonical(infrastructureShape(template)));
  for (const resource of Object.values(built.Resources) as { Type: string; Properties: { CodeUri: string; Handler: string } }[]) {
    if (resource.Type === "AWS::Serverless::Function") {
      assert(readFileSync(join(resource.Properties.CodeUri, resource.Properties.Handler.split(".")[0] + ".js")).length > 0);
    }
  }
  const compiledApi = createRequire(resolve("package.json"))(join(built.Resources.ApiFunction.Properties.CodeUri, "lambda.js")) as { handler: (event: unknown) => Promise<{ statusCode: number; body: string }> };
  const bundledHealth = await compiledApi.handler({ version: "2.0", rawPath: "/health", headers: {}, requestContext: { requestId: "deployment-bundle-health", http: { method: "GET", path: "/health" } } });
  assert.equal(bundledHealth.statusCode, 200);
  assert.equal(JSON.parse(bundledHealth.body).data.status, "ok");
  const config = publicRuntimeConfig();
  const webUrl = "https://release.invalid";
  const fetcher = (broken: string): typeof fetch => async input => {
    const url = new URL(String(input));
    if (broken === "timeout") throw new DOMException("Simulated network timeout", "TimeoutError");
    if (url.pathname === "/health") return Response.json({ success: true, data: { status: broken === "health" ? "bad" : "ok" } });
    if (url.pathname === "/dashboard") return new Response(null, { status: broken === "auth" ? 200 : 401 });
    if (url.pathname === "/config.json") return Response.json(broken === "config" ? {} : config);
    if (broken === "missing-asset" && url.pathname.startsWith("/assets/")) return new Response(null, { status: 404 });
    const body = broken === "html" && url.pathname === "/index.html" || broken === "asset" && url.pathname.startsWith("/assets/") ? Buffer.from("older release") : readFileSync(join("apps/web/dist", url.pathname));
    return new Response(new Uint8Array(body));
  };
  const first = await verifyLiveWeb({ webUrl, config, fetcher: fetcher("") });
  assert.match(first, /^[a-f0-9]{64}$/);
  for (const broken of ["timeout", "health", "auth", "config", "html", "asset", "missing-asset"]) await assert.rejects(verifyLiveWeb({ webUrl, config, fetcher: fetcher(broken) }));
  assert.equal(await verifyLiveWeb({ webUrl, config, fetcher: fetcher("") }), first);
  const writes: string[] = [];
  const input = { commit: "a".repeat(40), runUrl: "https://run.invalid", backendDigest: "backend", verify: async () => first, save: (key: string) => { writes.push(key); } };
  await assert.rejects(commitVerifiedRelease({ ...input, verify: async () => { throw new Error("CloudFront timeout or failed smoke check"); } }));
  assert.deepEqual(writes, []);
  await assert.rejects(commitVerifiedRelease({ ...input, save: () => { throw new Error("Status persistence failed"); } }));
  assert.deepEqual(writes, []);
  const release = await commitVerifiedRelease(input);
  assert.deepEqual(writes, ["status", "last-success"]);
  assert.equal((await commitVerifiedRelease(input)).artifactDigest, release.artifactDigest);
  console.log("Publication verification passed: health/auth/config/HTML/assets, timeout failure and identical-release retry.");
}
void verifyPublicationChecks().catch(error => { console.error(error); process.exitCode = 1; });
