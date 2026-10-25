import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { decodeState, encodeState } from "./deployment-policy";

export const region = process.env.AWS_REGION || "ap-southeast-2";
export const statePrefix = "/family-ledger/test-deployment";
export const stackName = "family-ledger-test";
export const isStableStack = (status: string): boolean => ["CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"].includes(status);
export function command(file: string, args: string[]): string {
  const windows = process.platform === "win32" && ["sam", "corepack"].includes(file);
  try {
    return execFileSync(windows ? "cmd.exe" : file, windows ? ["/d", "/s", "/c", [file, ...args].map(v => /^[A-Za-z0-9_./:=\\-]+$/.test(v) ? v : `"${v.replaceAll('"', '\\"')}"`).join(" ")] : args,
      { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, AWS_PAGER: "" } });
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    const stdout = error && typeof error === "object" && "stdout" in error ? String(error.stdout) : "";
    const code = /An error occurred \(([A-Za-z0-9_.-]+)\)/.exec(stderr)?.[1] ?? "command-failure";
    const builder = /([A-Za-z]+Builder:[A-Za-z]+)/.exec(stderr + stdout)?.[1];
    throw new Error(`${file} ${args.slice(0, file === "aws" ? 2 : 1).join(" ")} failed (${code}${builder ? `, ${builder}` : ""}); inspect the operation with operator credentials.`);
  }
}
export function aws<T = Record<string, unknown>>(args: string[]): T {
  const result = command("aws", [...args, "--region", region, "--output", "json"]);
  return (result.trim() ? JSON.parse(result) : {}) as T;
}
export function jsonFile(name: string, data: unknown): string {
  mkdirSync(".aws-sam/deployment", { recursive: true });
  const path = join(".aws-sam/deployment", name);
  writeFileSync(path, JSON.stringify(data));
  return `file://${path.replaceAll("\\", "/")}`;
}
export function getState<T>(name: string): T {
  const data = aws<{ Parameter: { Value: string } }>(["ssm", "get-parameter", "--name", `${statePrefix}/${name}`]);
  return decodeState<T>(data.Parameter.Value);
}
export function putState(name: string, value: unknown): void {
  aws(["ssm", "put-parameter", "--cli-input-json", jsonFile(`state-${name}.json`, { Name: `${statePrefix}/${name}`, Type: "String", Value: encodeState(value), Overwrite: true })]);
}
export function acquireLock(owner: string): () => void {
  try { aws(["ssm", "put-parameter", "--cli-input-json", jsonFile("lock.json", { Name: `${statePrefix}/lock`, Type: "String", Value: owner, Overwrite: false })]); }
  catch { throw new Error("TEST deployment lock could not be acquired. Check the active run or recover a stale lock before retrying."); }
  return () => {
    const lock = aws<{ Parameter: { Value: string } }>(["ssm", "get-parameter", "--name", `${statePrefix}/lock`]);
    if (lock.Parameter.Value !== owner) throw new Error("Deployment lock ownership changed; refusing to release.");
    aws(["ssm", "delete-parameter", "--name", `${statePrefix}/lock`]);
  };
}
export function summary(message: string): void {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
}
export function headSha(): string { return command("git", ["rev-parse", "HEAD"]).trim(); }
export function readParameters(): Record<string, string> { return JSON.parse(readFileSync("infra/aws/parameters.test.json", "utf8")); }
export interface Stack { StackStatus: string; Parameters: { ParameterKey: string; ParameterValue: string }[]; Outputs: { OutputKey: string; OutputValue: string }[]; Tags?: { Key: string; Value: string }[]; }
export function getStack(): Stack { return aws<{ Stacks: Stack[] }>(["cloudformation", "describe-stacks", "--stack-name", stackName]).Stacks[0]; }
export function output(stack: Stack, key: string): string {
  const value = stack.Outputs.find(o => o.OutputKey === key)?.OutputValue;
  if (!value) throw new Error(`Missing stack output ${key}.`);
  return value;
}
