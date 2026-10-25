import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseTemplate, type JsonObject } from "./deployment-policy";

/** Bundle with the locked workspace dependencies, avoiding SAM's pnpm source-tree copier. */
export async function buildLambdaArtifacts(): Promise<string> {
  const template = parseTemplate(readFileSync("infra/aws/template.yaml", "utf8"));
  for (const [name, resource] of Object.entries(template.Resources as Record<string, JsonObject>)) {
    if (resource.Type !== "AWS::Serverless::Function") continue;
    const metadata = resource.Metadata as JsonObject;
    const config = metadata?.BuildProperties as JsonObject;
    if (metadata?.BuildMethod !== "esbuild" || !config || Object.keys(config).some(k => !["EntryPoints", "Minify", "Sourcemap", "Target"].includes(k))) throw new Error("Unrecognized Lambda build configuration; independent review required.");
    const entries = config.EntryPoints;
    if (!Array.isArray(entries) || entries.length !== 1 || typeof entries[0] !== "string") throw new Error("Only the existing single-entry Lambda builds are supported.");
    const props = resource.Properties as JsonObject;
    const module = basename(entries[0]).replace(/\.ts$/, "");
    const handler = String(props.Handler).split("/").at(-1);
    if (!handler?.startsWith(`${module}.`)) throw new Error("Lambda handler does not match its bundled entry point.");
    const directory = resolve(".aws-sam", "ci-build", name);
    mkdirSync(directory, { recursive: true });
    await build({ entryPoints: [entries[0]], outfile: resolve(directory, `${module}.js`), bundle: true, platform: "node", format: "cjs", target: String(config.Target), minify: config.Minify === true, sourcemap: config.Sourcemap === true, logLevel: "silent" });
    props.CodeUri = directory;
    props.Handler = handler;
  }
  const path = resolve(".aws-sam", "ci-build", "template.json");
  writeFileSync(path, JSON.stringify(template));
  return path;
}
