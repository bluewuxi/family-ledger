import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

async function main() {
  const template = readFileSync("infra/aws/template.yaml", "utf8");
  const code = template.match(/        ZipFile: \|\r?\n([\s\S]*?)\r?\n  ProjectLogRetention:/)?.[1].replace(/^          /gm, "");
  assert.ok(code);
  assert.match(template, /RetentionInDays: 30/);
  const calls: Array<{ command: string; input: Record<string, unknown> }> = [];
  const responses: Array<{ Status: string; PhysicalResourceId: string }> = [];
  let fail = false;
  class CreateLogGroupCommand { constructor(public input: Record<string, unknown>) {} }
  class PutRetentionPolicyCommand { constructor(public input: Record<string, unknown>) {} }
  class CloudWatchLogsClient {
    async send(command: CreateLogGroupCommand | PutRetentionPolicyCommand) {
      calls.push({ command: command.constructor.name, input: command.input });
      if (fail) throw Object.assign(new Error("Read-only test failure"), { name: "AccessDeniedException" });
      if (command instanceof CreateLogGroupCommand) throw Object.assign(new Error("Existing group"), { name: "ResourceAlreadyExistsException" });
      return {};
    }
  }
  const exported: { handler?: (event: Record<string, unknown>) => Promise<void> } = {};
  runInNewContext(code, {
    exports: exported, Buffer, console: { error: () => {} },
    require: (name: string) => {
      if (name === "@aws-sdk/client-cloudwatch-logs") return { CloudWatchLogsClient, CreateLogGroupCommand, PutRetentionPolicyCommand };
      if (name === "node:https") return { request: (_url: string, _options: unknown, callback: (response: EventEmitter & { statusCode: number; resume(): void }) => void) => {
        const request = new EventEmitter() as EventEmitter & { end(body: string): void };
        request.end = body => { responses.push(JSON.parse(body)); const response = Object.assign(new EventEmitter(), { statusCode: 200, resume() {} }); callback(response); response.emit("end"); };
        return request;
      } };
      throw new Error("Unexpected dependency");
    }
  });
  const event = { RequestType: "Create", ResourceProperties: { RetentionInDays: 30, LogGroupNames: ["fixture-api", "fixture-job"] }, StackId: "fixture", RequestId: "fixture", LogicalResourceId: "fixture", ResponseURL: "https://example.invalid/fixture" };
  await exported.handler!(event);
  assert.equal(responses.at(-1)?.Status, "SUCCESS");
  assert.equal(calls.filter(call => call.command === "PutRetentionPolicyCommand").length, 2);
  assert.ok(calls.filter(call => call.command === "PutRetentionPolicyCommand").every(call => call.input.retentionInDays === 30));
  await exported.handler!({ ...event, RequestType: "Update", PhysicalResourceId: "existing-resource" });
  assert.equal(responses.at(-1)?.PhysicalResourceId, "existing-resource");
  const beforeDelete = calls.length;
  await exported.handler!({ ...event, RequestType: "Delete" });
  assert.equal(calls.length, beforeDelete);
  fail = true;
  await exported.handler!(event);
  assert.equal(responses.at(-1)?.Status, "FAILED");
  console.log("Log retention: existing groups, 30-day updates, stable resource identity, non-destructive deletion and CloudFormation failure reporting passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
