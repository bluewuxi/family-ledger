import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { logCaughtError, logDependencyError, logError, redactLogText, registerLogSecret, serializeLogError, withRequestLogging } from "../apps/api/src/utils/errorLogging";
import { parseCloudWatchError, resolveErrorQuery } from "../apps/api/src/services/apiErrorTrackingService";
import { parseJsonBody } from "../apps/api/src/utils/requestBody";
import { ApiRequestError } from "../apps/api/src/utils/apiError";
import { handler } from "../apps/api/src/handlers/lambda";
import { SSMClient } from "@aws-sdk/client-ssm";
import { cloudWatchErrorTransport, readCloudWatchErrorEvent } from "../apps/api/src/repositories/cloudWatchErrorRepository";
import { InstrumentDuplicateError } from "../apps/api/src/repositories/instrumentRepository";

const output: Array<{ level: string; entry: Record<string, unknown> }> = [];
const original = { error: console.error, warn: console.warn, info: console.info, fetch: globalThis.fetch, ssm: SSMClient.prototype.send, cloudWatch: cloudWatchErrorTransport.send };
const event = (method: string, path: string): APIGatewayProxyEventV2 => ({ version: "2.0", routeKey: "$default", rawPath: path, rawQueryString: "", headers: {}, isBase64Encoded: false,
  requestContext: { accountId: "fixture", apiId: "fixture", domainName: "localhost", domainPrefix: "fixture", http: { method, path, protocol: "HTTP/1.1", sourceIp: "127.0.0.1", userAgent: "fixture" }, requestId: "fixture-request", routeKey: "$default", stage: "$default", time: "", timeEpoch: Date.now() } });
async function main() {
  for (const level of ["error", "warn", "info"] as const) console[level] = (...args: unknown[]) => { output.push({ level: level.toUpperCase(), entry: JSON.parse(String(args[0])) as Record<string, unknown> }); };
  const raw = { code: "08006", message: "fetch failed", details: "connection reset", hint: "retry later", cause: new Error("socket hang up"), status: 503 };
  await Promise.all(["one", "two"].map(requestId => withRequestLogging({ requestId, method: "GET", path: "/portfolio-snapshots" }, async () => {
    await Promise.resolve(); logDependencyError("getUserRole", raw); logCaughtError("outer", raw);
  })));
  assert.equal(output.length, 2);
  assert.deepEqual(output.map(row => row.entry.requestId).sort(), ["one", "two"]);
  assert.equal((output[0].entry.error as Record<string, unknown>).details, "connection reset");
  assert.match(JSON.stringify(output[0]), /socket hang up/);
  logDependencyError("constraint", { code: "23503", details: "Key (account_id)=(private-value) is not present" }, ["23503"]);
  assert.equal(output.at(-1)?.level, "WARN");
  withRequestLogging({ requestId: "upgrade", method: "GET", path: "/fixture" }, () => {
    const missing = Object.assign(new Error("Missing parameter"), { name: "ParameterNotFound" });
    logCaughtError("expected.lookup", missing); assert.equal(output.at(-1)?.level, "INFO");
    logError("request.failed", missing, "ERROR"); assert.equal(output.at(-1)?.level, "ERROR");
  });
  logCaughtError("validation", new ApiRequestError("VALIDATION_ERROR", "Invalid input", 400));
  assert.equal(output.at(-1)?.level, "WARN");
  const className = InstrumentDuplicateError.name;
  Object.defineProperty(InstrumentDuplicateError, "name", { value: "minified" });
  logCaughtError("duplicate", new InstrumentDuplicateError());
  assert.equal(output.at(-1)?.level, "WARN");
  Object.defineProperty(InstrumentDuplicateError, "name", { value: className });
  assert.throws(() => parseJsonBody({ ...event("POST", "/accounts"), body: '{"token":"secret-input" broken}' }), /valid JSON/);
  assert.equal(output.at(-1)?.level, "WARN");
  registerLogSecret("known-private-secret");
  const safe = JSON.stringify(serializeLogError({ message: 'password=abc token=xyz Bearer aaa.bbb.ccc postgres://user:pass@host/db known-private-secret "token":"json-private"', details: "Failing row contains (private-row)", body: "private-body", $metadata: { requestId: "sdk-request", credentials: "private-sdk" } }));
  for (const secret of ["abc", "xyz", "aaa.bbb.ccc", "user:pass", "known-private-secret", "json-private", "private-row", "private-body", "private-sdk"]) assert.ok(!safe.includes(secret), secret);
  assert.match(safe, /sdk-request/);
  const circular: { message: string; cause?: unknown } = { message: "root" }; circular.cause = circular;
  assert.match(JSON.stringify(serializeLogError(circular)), /circular/);
  assert.equal(serializeLogError("primitive").message, "primitive");
  const hostile = { get message(): string { throw new Error("Getter failed"); }, get code(): string { throw new Error("Getter failed"); } };
  assert.doesNotThrow(() => serializeLogError(hostile)); assert.doesNotThrow(() => logDependencyError("hostile", hostile));
  console.error = () => { throw new Error("Broken logger"); }; assert.doesNotThrow(() => logError("safe", new Error("unexpected")));
  console.error = (...args: unknown[]) => { output.push({ level: "ERROR", entry: JSON.parse(String(args[0])) as Record<string, unknown> }); };

  const base = { eventId: "event", timestamp: Date.parse("2026-10-12T00:00:00Z"), logStreamName: "stream" };
  const text = (level: string, body: string) => ({ ...base, message: `2026-10-12T00:00:00.000Z\trequest\t${level}\t${body}\n` });
  const diagnostic = (path: string) => JSON.stringify({ event: "api-diagnostic", level: "ERROR", method: "GET", path, operation: "role.load", error: { code: "08006", message: "fetch failed" } });
  assert.equal(parseCloudWatchError(text("WARN", "ERROR in a warning"), "group"), null);
  assert.equal(parseCloudWatchError({ ...base, message: "REPORT RequestId: fixture ERROR in body" }, "group"), null);
  const parsed = parseCloudWatchError(text("ERROR", diagnostic("/accounts/00000000-0000-4000-8000-000000000001")), "group");
  assert.ok(parsed); assert.equal(parsed.path, "/accounts/:id"); assert.equal(parsed.legacy, false);
  assert.equal(parsed.fingerprint, parseCloudWatchError(text("ERROR", diagnostic("/accounts/00000000-0000-4000-8000-000000000002")), "group")?.fingerprint);
  assert.notEqual(parsed.fingerprint, parseCloudWatchError(text("ERROR", diagnostic("/instruments")), "group")?.fingerprint);
  const legacy = "Unhandled API error {\n method: 'GET',\n path: '/portfolio-snapshots',\n error: Error: Failed to load user role.\n at handler (file.ts:2)\n}";
  assert.equal(parseCloudWatchError(text("ERROR", legacy), "group")?.summary, "Failed to load user role.");
  assert.equal(parseCloudWatchError({ ...base, message: JSON.stringify({ level: "ERROR", requestId: "native", message: legacy }) }, "group")?.request_id, "native");
  assert.equal(parseCloudWatchError(text("ERROR", JSON.stringify({ level: "WARN", message: "inner warning" })), "group"), null);
  assert.ok(!redactLogText("Key (name)=(sensitive-name)").includes("sensitive-name"));
  const now = Date.parse("2026-10-12T00:00:00Z"), query = resolveErrorQuery({}, now);
  assert.equal(query.to - query.from, 7 * 86400000);
  assert.throws(() => resolveErrorQuery({ from: "2026-09-01T00:00:00Z" }, now));
  assert.throws(() => resolveErrorQuery({ cursor: "invalid" }, now));
  const cursor = Buffer.from(JSON.stringify({ ...query, token: "next" })).toString("base64url");
  assert.equal(resolveErrorQuery({ cursor }, now).nextToken, "next");
  assert.throws(() => resolveErrorQuery({ cursor, from: "2026-10-11T00:00:00Z" }, now));

  // Real middleware/router with synthetic SDK responses: no external service or user account.
  process.env.SUPABASE_URL = "https://fixture.supabase.co"; process.env.SUPABASE_SECRET_KEY_SSM_PARAM = "/fixture/key";
  process.env.AWS_REGION = "ap-southeast-2";
  SSMClient.prototype.send = (async () => ({ Parameter: { Value: "fixture-service-key" } })) as typeof SSMClient.prototype.send;
  let role: "viewer" | "admin" | "failure" = "viewer";
  let observations: unknown[] = [];
  globalThis.fetch = async (input, options) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", email: "fixture@example.invalid" }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("user_roles")) return new Response(JSON.stringify(role === "failure" ? raw : { role }), { status: role === "failure" ? 503 : 200, headers: { "content-type": "application/json" } });
    if (url.includes("api_error_groups")) return new Response("[]", { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/0" } });
    if (url.includes("observe_api_errors")) {
      observations = (JSON.parse(String(options?.body)) as { events: unknown[] }).events;
      return new Response(String(observations.length), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("Unexpected fixture request");
  };
  for (const [method, path] of [["GET", "/data-maintenance/errors"], ["POST", "/data-maintenance/errors/query"], ["GET", "/data-maintenance/errors/00000000-0000-4000-8000-000000000001/events"], ["PATCH", "/data-maintenance/errors/00000000-0000-4000-8000-000000000001"]]) {
    const unauth = await handler(event(method, path)); assert.equal(unauth.statusCode, 401);
    const viewer = await handler({ ...event(method, path), headers: { authorization: "Bearer fixture-user-token" } }); assert.equal(viewer.statusCode, 403);
  }
  role = "failure";
  const failed = await handler({ ...event("GET", "/portfolio-snapshots"), headers: { authorization: "Bearer fixture-user-token" } });
  assert.equal(failed.statusCode, 500);
  assert.deepEqual(JSON.parse(failed.body!), { success: false, error: { code: "INTERNAL_ERROR", message: "Unexpected server error." } });
  assert.ok(output.some(row => row.entry.operation === "userRoleRepository.getUserRole" && (row.entry.error as { code?: string }).code === "08006"));
  role = "admin";
  assert.equal((await handler({ ...event("GET", "/data-maintenance/errors"), headers: { authorization: "Bearer fixture-user-token" } })).statusCode, 200);
  process.env.API_ERROR_LOG_GROUP = "fixture-log-group";
  let cloudPage = 0;
  cloudWatchErrorTransport.send = async command => {
    assert.equal(command.input.logGroupName, "fixture-log-group");
    assert.equal(command.input.filterPattern, '"ERROR"');
    cloudPage++;
    return { $metadata: {}, events: cloudPage === 1 ? [
      { ...text("ERROR", diagnostic("/portfolio-snapshots")), timestamp: Date.now() - 1000 },
      { ...text("WARN", "ERROR in warning"), eventId: "warning", timestamp: Date.now() - 1000 },
      { ...text("ERROR", diagnostic("/expired")), eventId: "expired", timestamp: Date.now() - 31 * 86400000 }
    ] : [], nextToken: cloudPage === 1 ? "page-two" : undefined };
  };
  const queryEvent = { ...event("POST", "/data-maintenance/errors/query"), headers: { authorization: "Bearer fixture-user-token" }, body: "{}" };
  const firstPage = await handler(queryEvent); assert.equal(firstPage.statusCode, 200);
  const firstData = JSON.parse(firstPage.body!).data as { observed: number; nextCursor: string; from: string; to: string };
  assert.equal(firstData.observed, 1); assert.equal(observations.length, 1); assert.ok(firstData.nextCursor);
  const secondPage = await handler({ ...queryEvent, body: JSON.stringify({ from: firstData.from, to: firstData.to, cursor: firstData.nextCursor }) });
  assert.equal(secondPage.statusCode, 200); assert.equal(JSON.parse(secondPage.body!).data.nextCursor, null);
  cloudWatchErrorTransport.send = async () => { throw Object.assign(new Error("Deleted group"), { name: "ResourceNotFoundException" }); };
  assert.equal(await readCloudWatchErrorEvent({ stream: "stream", timestamp: Date.now(), eventId: "event" }), null);
  cloudWatchErrorTransport.send = async () => { throw Object.assign(new Error("CloudWatch read denied"), { name: "AccessDeniedException" }); };
  const deniedRead = await handler(queryEvent); assert.equal(deniedRead.statusCode, 500);
  assert.equal(JSON.parse(deniedRead.body!).success, false);

  // Check every catch and direct dependency-error branch has a diagnostic or explicitly passes it upward.
  function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(dir, item.name)) : [join(dir, item.name)]); }
  for (const file of files("apps/api/src").filter(file => file.endsWith(".ts") && !/errorLogging|apiErrorTrackingService|readAllRows/.test(file))) {
    const source = readFileSync(file, "utf8"), tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isCatchClause(node)) assert.match(node.block.getText(tree), /log(?:CaughtError|Error|DependencyError|AuthenticationError)\(/, `Unlogged catch: ${file}`);
      ts.forEachChild(node, visit);
    } visit(tree);
  }
}
main().then(() => original.info("API errors: raw diagnostics, severity, redaction, request isolation, legacy parsing, cursor validation, real authorization and unchanged 500 responses passed."))
  .catch(error => { original.error(error); process.exitCode = 1; })
  .finally(() => { Object.assign(console, { error: original.error, warn: original.warn, info: original.info }); globalThis.fetch = original.fetch; SSMClient.prototype.send = original.ssm; cloudWatchErrorTransport.send = original.cloudWatch; });
