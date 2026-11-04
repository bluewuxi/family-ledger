import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { prepareKernelAnchorAdoption, type KernelAnchorAdoptionCandidate, type KernelAnchorAdoptionExport } from "../packages/shared/src/kernelAnchorAdoption";

// Local exact exports only. There is deliberately no apply mode or credential loading.
const args = process.argv.slice(2);
if (args.length !== 3) throw new Error("Usage: tsx scripts/prepare-kernel-actual-anchor-adoption.ts <export.json> <candidates.json> <ignored-output.json>");
const output = resolve(args[2]);
if (existsSync(output)) throw new Error("Refusing to overwrite an existing adoption plan.");
execFileSync("git", ["check-ignore", "--quiet", "--", output], { windowsHide: true, stdio: "ignore" });
const data = JSON.parse(readFileSync(args[0], "utf8")) as KernelAnchorAdoptionExport;
const candidates = JSON.parse(readFileSync(args[1], "utf8")) as KernelAnchorAdoptionCandidate[];
const plan = prepareKernelAnchorAdoption(data, candidates);
writeFileSync(output, JSON.stringify({ mode: "local-preparation-only", entries: plan }, null, 2) + "\n", { flag: "wx" });
console.log(`Prepared ${plan.length} local adoption entries. No database connection or writes performed.`);
