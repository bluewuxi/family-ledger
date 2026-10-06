import assert from "node:assert/strict";
import { build } from "esbuild";
import { cashflowDatePreset, monthDateRange } from "../apps/web/src/lib/cashflowDates";
import { legacyAccountDates, familyCashflowFilters, familyCashflowTabs, getFamilyCashflowTab } from "../apps/web/src/lib/familyCashflowNavigation";

async function main() {
  assert.deepEqual(familyCashflowTabs.map(tab => tab.value), ["spending", "education", "report"]);
  for (const value of ["", "tab=accounts", "tab=unknown"]) assert.equal(getFamilyCashflowTab(new URLSearchParams(value)), "spending");
  assert.deepEqual(monthDateRange("2024-02"), { from:"2024-02-01", to:"2024-02-29" });
  assert.equal(monthDateRange("2026-13"), null);
  assert.deepEqual(cashflowDatePreset("previous", "2026-01-04"), { from:"2025-12-01", to:"2025-12-31" });
  assert.deepEqual(cashflowDatePreset("year", "2026-10-06"), { from:"2026-01-01", to:"2026-10-06" });
  assert.equal(legacyAccountDates(new URLSearchParams("tab=accounts&accountId=investment-account&offset=50&from=2026-02-30&to=2026-10-06")).toString(), "to=2026-10-06");
  const legacy = familyCashflowFilters("spending", new URLSearchParams("month=2024-02&tab=spending&domain=education"));
  assert.equal(legacy.get("to"), "2024-02-29");
  assert.equal(legacy.has("month"), false);
  assert.equal(legacy.has("domain"), false);
  assert.equal(legacy.has("tab"), false);

  // Exercise the real query hook with deterministic state and router adapters.
  const bundle = await build({ entryPoints:["apps/web/src/lib/useCashflowQuery.ts"], bundle:true, platform:"node", format:"cjs", write:false, external:["react", "react-router-dom"] });
  let url = new URLSearchParams("tab=education&from=2026-01-01&offset=50");
  const state: unknown[] = [], deps: unknown[][] = [];
  let cursor = 0, effectCursor = 0;
  let effects: Array<() => void> = [];
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (next: unknown) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
    },
    useEffect(effect: () => void, next: unknown[]) {
      const index = effectCursor++;
      if (!deps[index] || next.some((value, i) => value !== deps[index][i])) effects.push(effect);
      deps[index] = next;
    }
  };
  const router = { useSearchParams: () => [url, (next: URLSearchParams) => { url = new URLSearchParams(next); }] };
  const module = { exports: {} as { useCashflowQuery: (tab: "education" | "report") => { draft: URLSearchParams; change: (values:Record<string,string>) => void; apply:(reset?:boolean)=>void } } };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)((id:string) => id === "react" ? react : router, module, module.exports);
  function render(tab: "education" | "report" = "education") {
    cursor = 0; effectCursor = 0; effects = [];
    const result = module.exports.useCashflowQuery(tab);
    effects.forEach(effect => effect());
    return result;
  }
  let hook = render();
  hook.change({from:"2026-02-01"}); hook = render();
  assert.equal(url.get("from"), "2026-01-01", "Draft must not query immediately");
  hook.apply(); hook = render();
  assert.equal(url.get("from"), "2026-02-01"); assert.equal(url.has("offset"), false);
  hook.change({currency:"CNY"}); hook = render(); hook.apply(true); render(); hook = render();
  assert.equal(hook.draft.has("currency"), false); assert.equal(url.get("tab"), "education");
  url = new URLSearchParams("tab=education&from=2025-01-01&offset=50"); render(); hook = render();
  assert.equal(hook.draft.get("from"), "2025-01-01", "History navigation must restore filters");
  url = new URLSearchParams("tab=report&domain=education&category=tuition&from=2026-01-01"); render("report"); hook=render("report");
  hook.change({from:"2026-02-01"}); render("report");
  url = new URLSearchParams("tab=report&domain=all&from=2026-01-01"); render("report"); hook=render("report");
  assert.equal(hook.draft.has("category"), false); assert.equal(hook.draft.get("from"), "2026-01-01");
  console.log("Family cashflow dates, query isolation, apply/reset and history restoration passed.");
}
void main();
