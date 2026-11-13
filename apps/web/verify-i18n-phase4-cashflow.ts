import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { formatSpendingAmount } from "./src/lib/spendingFormat";
import { ApiClientError } from "./src/lib/apiClient";
import { i18n } from "./src/i18n/instance";
import { calculateEducationTotals } from "@family-ledger/shared";
import type { CashflowRecord, SpendingQueryResult, StatementRow } from "@family-ledger/shared";
import type { CashflowTable } from "./src/components/cashflow/CashflowTable";
import type { SpendingCharts } from "./src/components/spending/SpendingCharts";
import type { LanguageProvider } from "./src/i18n/LanguageProvider";
import type { setUiLanguage } from "./src/i18n/instance";
import type { UiLanguage } from "./src/i18n/language";

const rows: CashflowRecord[] = [
  { domain: "daily_expense", sourceId: "same-id", date: "2026-01-01", kind: "spending", category: "未分类", currency: "CNY", amount: "-99999999999999.123456", notes: "原始银行说明" },
  { domain: "education", sourceId: "same-id", date: "2026-01-01", kind: "expense", category: "tuition", currency: "NZD", amount: "-20000", notes: null },
];

const bundle = await build({
  stdin: {
    contents: 'export { CashflowTable } from "./src/components/cashflow/CashflowTable"; export { SpendingCharts } from "./src/components/spending/SpendingCharts"; export { LanguageProvider } from "./src/i18n/LanguageProvider"; export { setUiLanguage } from "./src/i18n/instance";',
    resolveDir: fileURLToPath(new URL(".", import.meta.url)),
    loader: "ts",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  define: { "import.meta.env": JSON.stringify({ DEV: true }) },
  external: ["react", "react/jsx-runtime", "react-i18next", "recharts"],
});
const module = { exports: {} as {
  CashflowTable: typeof CashflowTable; SpendingCharts: typeof SpendingCharts;
  LanguageProvider: typeof LanguageProvider; setUiLanguage: typeof setUiLanguage;
} };
const localStorage = new Map<string, string>();
new Function("require", "module", "exports", "window", bundle.outputFiles[0].text)(
  createRequire(import.meta.url), module, module.exports, {
    location: { hostname: "localhost" },
    localStorage: { getItem: (key: string) => localStorage.get(key) ?? null, setItem: (key: string, value: string) => localStorage.set(key, value) },
  },
);
async function render(language: "zh-CN" | "en") {
  await module.exports.setUiLanguage(language);
  return renderToStaticMarkup(createElement(module.exports.LanguageProvider, {
    children: [
      createElement(module.exports.CashflowTable, { key: "table", rows, loading: false }),
      createElement(module.exports.SpendingCharts, { key: "charts", result: chartFixture, onFilter: () => {} }),
    ],
  }));
}

const aggregate = { currency: "CNY", income: "0", gross_spending: "10", refunds: "0", net_spending: "10", count: 2, pending_count: 0 };
const chartFixture: SpendingQueryResult = {
  rows: [],
  pagination: { limit: 50, offset: 0, total: 0, hasMore: false },
  totals: [aggregate],
  monthly: [{ ...aggregate, label: "2026-01" }],
  tags: [{ ...aggregate, label: null }, { ...aggregate, label: "未分类" }],
};
assert.equal(formatSpendingAmount("99999999999999.123456"), "99,999,999,999,999.123456");
assert.equal(formatSpendingAmount(null), "—");
const chinese = await render("zh-CN");
assert.match(chinese, /2026-01-01/);
assert.match(chinese, /收支范围/);
const english = await render("en");
assert.match(english, /01 Jan 2026/);
assert.match(english, /Cashflow scope/);
assert.match(english, /Tuition/);
assert.match(english, /未分类/);
assert.match(english, />Untagged</);
assert.match(english, /原始银行说明/);
assert.match(english, /-99,999,999,999,999.123456/);
const commonEntry = { entryDate: "2026-01-01", currency: "CNY", relatedExpenseId: null, targetCurrency: null, targetAmount: null, notes: null };
const totals = calculateEducationTotals([
  { ...commonEntry, entryType: "opening_balance", amount: "100000", expenseCategory: null },
  { ...commonEntry, entryType: "expense", amount: "20000", expenseCategory: "tuition" },
  { ...commonEntry, entryType: "refund", amount: "1000", expenseCategory: "tuition" },
  { ...commonEntry, entryType: "contribution", currency: "NZD", amount: "5000", expenseCategory: null },
]);
assert.deepEqual(totals.map(row => [row.currency, formatSpendingAmount(row.balance), formatSpendingAmount(row.netSpending)]),
  [["CNY", "81,000", "19,000"], ["NZD", "5,000", "0"]]);

type Element = { type: unknown; props: Record<string, unknown> };
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (value && typeof value === "object" && "props" in value) {
    const element = value as Element;
    return [element, ...elements(element.props.children)];
  }
  return [];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (value && typeof value === "object" && "props" in value) return text((value as Element).props.children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function element(tree: Element, match: (element: Element) => boolean) {
  const result = elements(tree).find(match);
  assert(result, "Expected control was missing");
  return result;
}
function trigger(target: Element, eventName: string, event?: unknown) {
  const callback = target.props[eventName];
  assert(typeof callback === "function");
  callback(event);
}

const pages = await build({
  stdin: {
    contents: 'export { SpendingPage } from "./src/pages/SpendingPage"; export { EducationReservePage } from "./src/pages/EducationReservePage";',
    resolveDir: fileURLToPath(new URL(".", import.meta.url)),
    loader: "ts",
  },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  define: { "import.meta.env": JSON.stringify({ DEV: false }) },
  external: ["react", "react/jsx-runtime", "react-i18next", "react-router-dom", "../i18n/LanguageProvider", "../components/*", "../lib/apiClient", "./apiClient"],
});
const requireLocal = createRequire(import.meta.url);
const user = { id: "synthetic-user", role: "admin" };
const spendingRow = {
  id: "synthetic-row", currency: "CNY", account_id: "synthetic-account", account_name: "原始账户",
  transaction_date: "2026-01-01", description: "原始说明", amount: "-10", classification: "spending", tag: "未分类",
} as StatementRow;

function mount(page: "SpendingPage" | "EducationReservePage", search: string) {
  let language: UiLanguage = "en";
  let query = new URLSearchParams(search);
  let stateIndex = 0, effectIndex = 0;
  const states: unknown[] = [];
  const effects: Array<{ deps: readonly unknown[]; cleanup?: () => void }> = [];
  const pending: Array<() => void> = [];
  const reads: string[] = [];
  const writes: unknown[] = [];
  const react = {
    useState(initial: unknown) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next: unknown) => {
        states[index] = typeof next === "function" ? next(states[index]) : next;
      }];
    },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
      const index = effectIndex++;
      const previous = effects[index];
      if (!previous || deps.some((value, dependency) => !Object.is(value, previous.deps[dependency]))) {
        pending.push(() => {
          previous?.cleanup?.();
          effects[index] = { deps, cleanup: effect() || undefined };
        });
      }
    },
  };
  const api = {
    ApiClientError,
    async apiGet(path: string) {
      reads.push(path);
      if (path === "/spending/accounts") return { user, accounts: [] };
      if (path.startsWith("/spending/filter-options?")) return { tags: ["未分类"], accountNumberLast4: [], counterpartyAccountLast4: [] };
      if (path.startsWith("/spending/rows?")) return { ...chartFixture, rows: [spendingRow] };
      if (path.startsWith("/education-reserve?")) {
        return { user, fund: { cutoverAt: "2026-01-01T00:00:00Z" }, totals, periodTotals: totals, entries: [], expenses: [], pagination: chartFixture.pagination };
      }
      throw Error(`Unexpected synthetic GET ${path}`);
    },
    async apiRequest(path: string, options: unknown) {
      writes.push({ path, options });
      throw new ApiClientError("PRIVATE-VALIDATION-MARKER", "VALIDATION_ERROR", 400);
    },
  };
  const stateModule = { exports: {} as Record<typeof page, () => Element> };
  new Function("require", "module", "exports", pages.outputFiles[0].text)((id: string) => {
    if (id === "react") return react;
    if (id === "react-i18next") return { useTranslation: (namespace: Parameters<typeof i18n.getFixedT>[1]) => ({ t: i18n.getFixedT(language, namespace) }) };
    if (id === "react-router-dom") return {
      useNavigate: () => () => { throw Error("Unexpected navigation"); },
      useSearchParams: () => [query, (next: URLSearchParams | ((old: URLSearchParams) => URLSearchParams)) => {
        query = new URLSearchParams(typeof next === "function" ? next(query) : next);
      }],
    };
    if (id === "../i18n/LanguageProvider") return { useUiLanguage: () => ({ language }) };
    if (id === "../lib/apiClient" || id === "./apiClient") return api;
    if (id.startsWith("../components/")) {
      const name = id.split("/").at(-1)!;
      return { [name]: name };
    }
    return requireLocal(id);
  }, stateModule, stateModule.exports);
  function renderPage() {
    stateIndex = effectIndex = 0;
    return stateModule.exports[page]();
  }
  return {
    reads, writes, query: () => query.toString(),
    switchLanguage(next: UiLanguage) { language = next; },
    async settle() {
      let tree = renderPage();
      for (let pass = 0; pass < 4; pass++) {
        pending.splice(0).forEach(effect => effect());
        await new Promise(resolve => setTimeout(resolve, 0));
        tree = renderPage();
      }
      return tree;
    },
  };
}

{
  const view = mount("SpendingPage", "tab=spending&from=2026-01-01&offset=50");
  let tree = await view.settle();
  const selection = element(tree, node => node.props["aria-label"] === "Select 原始说明");
  trigger(selection, "onChange", { target: { checked: true } });
  const requestCount = view.reads.length, query = view.query();
  view.switchLanguage("zh-CN");
  tree = await view.settle();
  assert.equal(element(tree, node => node.props["aria-label"] === "选择 原始说明").props.checked, true);
  assert.equal(view.query(), query);
  assert.equal(view.reads.length, requestCount);
  assert.equal(view.writes.length, 0);
}

{
  const view = mount("EducationReservePage", "tab=education&currency=CNY");
  let tree = await view.settle();
  trigger(element(tree, node => node.type === "button" && text(node) === "Add manually"), "onClick");
  tree = await view.settle();
  trigger(element(tree, node => node.type === "input" && node.props.inputMode === "decimal"), "onChange", { target: { value: "-10" } });
  tree = await view.settle();
  const form = element(tree, node => node.type === "form" && elements(node).some(child => child.type === "fieldset"));
  trigger(form, "onSubmit", { preventDefault() {} });
  tree = await view.settle();
  const alert = (tree: Element) => text(element(tree, node => node.props.role === "alert"));
  const englishError = alert(tree), requestCount = view.reads.length, query = view.query();
  assert(!englishError.includes("PRIVATE-VALIDATION-MARKER"));
  view.switchLanguage("zh-CN");
  tree = await view.settle();
  assert.notEqual(alert(tree), englishError);
  assert.match(alert(tree), /[\p{Script=Han}]/u);
  assert.equal(element(tree, node => node.type === "input" && node.props.inputMode === "decimal").props.value, "-10");
  assert.equal(view.query(), query);
  assert.equal(view.reads.length, requestCount);
  assert.equal(view.writes.length, 1);
}
console.log("Bilingual cashflow preserves exact totals, calendar dates, source content, selections, invalid drafts and request counts.");
