import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolveSecureParameter } from "../apps/api/src/config/ssm";

/** Test environment only; credentials stay in the child process environment. */
export async function testDatabaseSql() {
  const psql = "C:/Program Files/PostgreSQL/17/bin/psql.exe";
  if (!existsSync(psql)) throw new Error("PostgreSQL 17 psql was not found.");
  const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}.`); return value; };
  const password = await resolveSecureParameter(required("SUPABASE_DB_PASSWORD_SSM_PARAM"));
  const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", required("SUPABASE_DB_HOST"), "-p", required("SUPABASE_DB_SESSION_PORT"), "-U", required("SUPABASE_DB_USER"), "-d", required("SUPABASE_DB_NAME")];
  return (sql: string) => {
    try { return execFileSync(psql, args, { input: sql, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, PGPASSWORD: password, PGSSLMODE: "require" }, stdio: ["pipe", "pipe", "pipe"] }).trim(); }
    catch (error: unknown) {
      const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "Unknown database error.";
      const safe = [password, process.env.SUPABASE_DB_HOST, process.env.SUPABASE_DB_USER].filter((v): v is string => Boolean(v))
        .reduce((message, value) => message.replaceAll(value, "[redacted]"), stderr);
      const detail = error && typeof error === "object" ? error as { code?: string; status?: number; signal?: string } : {};
      throw new Error(`Test database SQL failed (${detail.code ?? detail.status ?? detail.signal ?? "unknown"}): ${safe.slice(0, 1500)}`);
    }
  };
}
