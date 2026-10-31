import { readFileSync } from "node:fs";
import { canonical, infrastructureShape, parseTemplate, sha256, type Manifest } from "./deployment-policy";
import { command, headSha } from "./deployment-runtime";

export interface Approval { commit: string; files: Manifest; confirmedAt: string; evidence: string; }
export function migrationManifest(): Manifest {
  const paths = command("git", ["ls-tree", "-r", "--name-only", "HEAD", "supabase/migrations"]).trim().split(/\r?\n/).filter(Boolean);
  return Object.fromEntries(paths.map(p => [p, sha256(command("git", ["show", `HEAD:${p}`]))]));
}
export function publicRuntimeConfig(): { apiBaseUrl: string } {
  const p = JSON.parse(readFileSync("infra/aws/parameters.test.json", "utf8"));
  return { apiBaseUrl: `https://${p.ApiDomainName}` };
}
export function infrastructureManifest(): Manifest {
  return {
    "infra/aws/template.yaml": sha256(canonical(infrastructureShape(parseTemplate(readFileSync("infra/aws/template.yaml", "utf8"))))),
    "infra/aws/certificates.yaml": sha256(canonical(parseTemplate(readFileSync("infra/aws/certificates.yaml", "utf8")))),
    "infra/aws/parameters.test.json": sha256(canonical(JSON.parse(readFileSync("infra/aws/parameters.test.json", "utf8")))),
    "public-runtime-config": sha256(canonical(publicRuntimeConfig()))
  };
}
export function approval(files: Manifest, evidence: string): Approval {
  return { commit: headSha(), files, confirmedAt: new Date().toISOString(), evidence };
}
