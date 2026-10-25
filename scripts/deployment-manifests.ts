import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import { canonical, infrastructureShape, parseTemplate, sha256, type Manifest } from "./deployment-policy";
import { command, headSha } from "./deployment-runtime";

export interface Approval { commit: string; files: Manifest; confirmedAt: string; evidence: string; }
export function migrationManifest(): Manifest {
  const paths = command("git", ["ls-tree", "-r", "--name-only", "HEAD", "supabase/migrations"]).trim().split(/\r?\n/).filter(Boolean);
  return Object.fromEntries(paths.map(p => [p, sha256(command("git", ["show", `HEAD:${p}`]))]));
}
export function publicRuntimeConfig(): { apiBaseUrl: string; supabaseUrl: string; supabaseAnonKey: string } {
  const p = JSON.parse(readFileSync("infra/aws/parameters.test.json", "utf8"));
  const env = dotenv.parse(readFileSync(".env.test", "utf8"));
  const config = {
    apiBaseUrl: `https://${p.ApiDomainName}`,
    supabaseUrl: process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || p.SupabaseUrl,
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  };
  if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error("Public web configuration is missing.");
  const key = config.supabaseAnonKey;
  if (key.startsWith("sb_secret_")) throw new Error("Server-side key rejected in public web configuration.");
  if (key.split(".").length === 3) {
    const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    if (claims.role !== "anon") throw new Error("Only the anonymous Supabase key is permitted in public configuration.");
  } else if (!key.startsWith("sb_publishable_")) throw new Error("Unknown Supabase public key format.");
  return config;
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
