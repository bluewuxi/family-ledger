import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { parse } from "yaml";

export type JsonObject = { [key: string]: unknown };
export type Manifest = Record<string, string>;
export const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function encodeState(value: unknown): string {
  const result = gzipSync(Buffer.from(JSON.stringify(value))).toString("base64");
  if (Buffer.byteLength(result) > 4096) throw new Error("Deployment record exceeds SSM standard size; split the record before registration.");
  return result;
}
export function decodeState<T>(value: string): T { return JSON.parse(gunzipSync(Buffer.from(value, "base64")).toString()) as T; }
export function assertManifest(actual: Manifest, approved: Manifest, name: string): void {
  const changed = [...new Set([...Object.keys(actual), ...Object.keys(approved)])].filter(p => actual[p] !== approved[p]);
  if (changed.length) throw new Error(`${name} requires independent verification and registration: ${changed.join(", ")}`);
}
export function docsOnly(paths: string[]): boolean {
  return paths.length > 0 && paths.every(p => p.startsWith("docs/") || ["AGENTS.md", "README.md"].includes(p));
}
export function parseTemplate(text: string): JsonObject {
  const names: Record<string, string> = { Ref: "Ref", GetAtt: "Fn::GetAtt", Sub: "Fn::Sub", Join: "Fn::Join", If: "Fn::If", Equals: "Fn::Equals", Not: "Fn::Not", And: "Fn::And", Or: "Fn::Or", Select: "Fn::Select", FindInMap: "Fn::FindInMap", GetAZs: "Fn::GetAZs", ImportValue: "Fn::ImportValue", Split: "Fn::Split", Base64: "Fn::Base64", Condition: "Condition" };
  const customTags = Object.entries(names).flatMap(([name, key]) => [
    { tag: `!${name}`, resolve: (v: string) => ({ [key]: name === "GetAtt" ? v.split(".") : v }) },
    { tag: `!${name}`, collection: "seq" as const, resolve: (v: unknown) => ({ [key]: (v as { toJSON(): unknown }).toJSON() }) }
  ]);
  return parse(text, { customTags }) as JsonObject;
}

/** Ignore SAM packaging metadata and code locations only, never runtime configuration. */
export function infrastructureShape(template: JsonObject): JsonObject {
  const result = structuredClone(template);
  const resources = result.Resources as Record<string, JsonObject>;
  for (const resource of Object.values(resources)) {
    const metadata = resource.Metadata as JsonObject | undefined;
    const esbuild = metadata?.BuildMethod === "esbuild";
    if (metadata) {
      delete metadata.SamResourceId;
      delete metadata.BuildMethod;
      delete metadata.BuildProperties;
      if (!Object.keys(metadata).length) delete resource.Metadata;
    }
    const props = resource.Properties as JsonObject | undefined;
    if (props && resource.Type === "AWS::Serverless::Function" && props.CodeUri) {
      props.CodeUri = "<packaged-code>";
      // SAM esbuild rewrites source paths to the emitted entry-file basename.
      if (typeof props.Handler === "string" && esbuild) props.Handler = props.Handler.split("/").at(-1);
    }
  }
  return result;
}

interface Change { ResourceChange?: { LogicalResourceId?: string; ResourceType?: string; Action?: string; Replacement?: string; Scope?: string[]; Details?: { ChangeSource?: string; Evaluation?: string; Target?: { Attribute?: string; Name?: string; RequiresRecreation?: string }; CausingEntity?: string }[] } }
export function assertCodeOnlyChanges(changes: Change[], current: JsonObject, candidate: JsonObject): void {
  if (canonical(infrastructureShape(current)) !== canonical(infrastructureShape(candidate))) throw new Error("Packaged infrastructure differs from the live stack outside Lambda code. Independent deployment required.");
  const existing = current.Resources as Record<string, JsonObject>;
  for (const entry of changes) {
    const r = entry.ResourceChange;
    if (!r?.LogicalResourceId || !existing[r.LogicalResourceId] || r.Action !== "Modify" || r.Replacement !== "False" || !r.Details?.length || r.Scope?.some(s => s !== "Properties")) throw new Error("Unclassified, replacing, or non-modification change requires independent deployment.");
    for (const detail of r.Details) {
      const target = detail.Target;
      if (target?.Attribute !== "Properties" || target.RequiresRecreation !== "Never") throw new Error(`Unsafe change on ${r.LogicalResourceId}.`);
      if (r.ResourceType === "AWS::Lambda::Function" && target.Name === "Code" && detail.ChangeSource === "DirectModification" && detail.Evaluation === "Static") continue;
      // A schedule may be reevaluated when its unchanged target function ARN is referenced.
      const causing = detail.CausingEntity?.split(".")[0];
      const source = causing ? existing[causing] : undefined;
      const props = existing[r.LogicalResourceId].Properties as JsonObject;
      const scheduleTarget = props?.Target as JsonObject | undefined;
      const targetArn = scheduleTarget?.Arn as JsonObject | undefined;
      const getAtt = targetArn?.["Fn::GetAtt"];
      if (r.ResourceType === "AWS::Scheduler::Schedule" && target.Name === "Target" && ["ResourceReference", "ResourceAttribute"].includes(detail.ChangeSource ?? "") && causing && source?.Type === "AWS::Serverless::Function" && Array.isArray(getAtt) && getAtt[0] === causing && getAtt[1] === "Arn") continue;
      throw new Error(`Non-code change on ${r.LogicalResourceId}.${target.Name ?? "unknown"} requires independent deployment.`);
    }
  }
}
