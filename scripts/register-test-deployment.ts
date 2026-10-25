import { infrastructureManifest, migrationManifest, approval } from "./deployment-manifests";
import { acquireLock, command, getStack, headSha, putState, summary } from "./deployment-runtime";

function main(): void {
  if (process.env.GITHUB_ACTIONS) throw new Error("Registration is operator-only, never a deployment workflow operation.");
  const [kind, commit, evidence] = process.argv.slice(2);
  if (!["migrations", "infrastructure", "bootstrap"].includes(kind) || !/^[a-f0-9]{40}$/.test(commit ?? "") || commit !== headSha() || !evidence) throw new Error("Usage: register-test-deployment <migrations|infrastructure|bootstrap> <full HEAD SHA> <verification-evidence-reference>");
  if (command("git", ["branch", "--show-current"]).trim() !== "test" || command("git", ["status", "--porcelain"]).trim()) throw new Error("Registration requires a clean test checkout at the independently verified commit.");
  const release = acquireLock(`operator:${commit}:${Date.now()}`);
  try {
    if (!["CREATE_COMPLETE", "UPDATE_COMPLETE"].includes(getStack().StackStatus)) throw new Error("Stack is not stable; recover before registration.");
    if (kind !== "infrastructure") putState("migration-approval", approval(migrationManifest(), evidence));
    if (kind !== "migrations") putState("infrastructure-approval", approval(infrastructureManifest(), evidence));
    if (kind === "bootstrap") putState("last-success", { commit, confirmedAt: new Date().toISOString(), runUrl: evidence, artifactDigest: "independently-verified-bootstrap" });
    summary(`Registered independently verified ${kind} for ${commit}. No SQL or application deployment was executed.`);
  } finally { release(); }
}
try { main(); } catch (error) { console.error(error instanceof Error && !("stderr" in error) ? error.message : "Operator registration failed. Check AWS permissions and lock state."); process.exitCode = 1; }
