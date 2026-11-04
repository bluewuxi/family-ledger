import assert from "node:assert/strict";
import { build } from "esbuild";

async function main() {
  const bundle = await build({ entryPoints: ["apps/web/src/lib/useValuation.ts"], bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "./apiClient"] });
  const states: unknown[] = [], refs: Array<{ current: unknown }> = [];
  let stateIndex = 0, refIndex = 0;
  const effects: Array<() => (() => void)> = [];
  const requests: Array<{ path: string; resolve(value: unknown): void }> = [];
  const react = {
    useState: (value: unknown) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = value;
      return [states[index], (next: unknown) => { states[index] = next; }];
    },
    useRef: (value: unknown) => refs[refIndex++] ??= { current: value },
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => (() => void)) => effects.push(effect)
  };
  const module = { exports: {} as { useValuation(path: string): { reload(force?: boolean): Promise<void> } } };
  new Function("module", "exports", "require", bundle.outputFiles[0].text)(module, module.exports, (name: string) => {
    if (name === "react") return react;
    if (name === "./apiClient") return { apiGet: (path: string) => new Promise(resolve => requests.push({ path, resolve })) };
    throw new Error(`Unexpected fixture dependency ${name}`);
  });
  function render(path: string) { stateIndex = refIndex = 0; effects.length = 0; return module.exports.useValuation(path); }
  render("/dashboard");
  const cleanup = effects[0]();
  cleanup();
  const current = render("/dashboard");
  effects[0]();
  assert.equal(requests.length, 2, "StrictMode cleanup must not deduplicate the replacement generation");
  const first = { dashboard: { marker: "stale", valuationMetadata: { nextRefreshAt: null } } };
  const second = { dashboard: { marker: "current", valuationMetadata: { nextRefreshAt: null } } };
  requests[0].resolve(first); requests[1].resolve(second);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(states[1], false, "replacement generation must leave loading state");
  assert.deepEqual(states[0], second);
  assert.equal(requests.length, 2, "daily-only valuations must not issue a provider refresh");
  const explicit = current.reload(true);
  const duplicate = current.reload(true);
  assert.equal(requests.length, 3, "same live generation is deduplicated");
  requests[2].resolve(second);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests[3].path, "/dashboard?quoteMode=refresh");
  requests[3].resolve(second);
  await Promise.all([explicit, duplicate]);
  console.log("Valuation StrictMode replay, stale-result rejection, daily-only reads, and refresh deduplication: passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
