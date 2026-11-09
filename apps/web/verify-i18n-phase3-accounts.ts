import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Application labels must move to resources; stored opening-note defaults are source data.
const files = ["pages/AccountsPage.tsx", "pages/AccountDetailPage.tsx", "pages/InstrumentsPage.tsx", "components/AccountCreateWorkspace.tsx"];
for (const file of files) {
  const text = readFileSync(`apps/web/src/${file}`, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const untranslated: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isJsxText(node) && /[\u3400-\u9fff]/.test(node.text)) untranslated.push(node.text.trim());
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && /[\u3400-\u9fff]/.test(node.initializer.text)) untranslated.push(node.initializer.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.deepEqual(untranslated, [], `${file} still has application-owned JSX text`);
  assert(!/failure instanceof Error \? failure\.message|return error\.message/.test(text), `${file} exposes raw errors`);
}
console.log("Account and instrument copy extraction and raw-error boundaries passed.");

import { build } from "esbuild";
import { createRequire } from "node:module";
import { ApiClientError } from "./src/lib/apiClient";
import { AuthClientError } from "./src/lib/authClient";
import { getDisplayLocale, type UiLanguage } from "./src/i18n/language";
import { i18n } from "./src/i18n/instance";
const require = createRequire(new URL("./package.json", import.meta.url));
type Node = { type: unknown; props: Record<string, unknown> };
const nodes = (node: unknown): Node[] => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === "object" && "props" in node ? [node as Node, ...nodes((node as Node).props.children), ...nodes((node as Node).props.footer)] : [];
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
type Call = { method: string; path: string; body?: unknown };
const account = { id: "fixture-account", name: "家人 Source", broker: "Source platform", accountType: "brokerage", purpose: "investment", baseCurrency: "NZD", marketRegion: "NZ", notes: null, tradingInfo: null };
async function harness(file: string, exported: string, api: Record<string, unknown>) {
  let language: UiLanguage = "en", stateIndex = 0, refIndex = 0, effectIndex = 0;
  const states: unknown[] = [], refs: Array<{ current: unknown }> = [], effects: Array<() => unknown> = [], previousDependencies: Array<readonly unknown[] | undefined> = [];
  const preferences = { preferredCurrency: "CNY", gainColorScheme: "red_positive" };
  const react = { ...require("react"), useState: (initial: unknown) => { const i = stateIndex++; if (!(i in states)) states[i] = typeof initial === "function" ? (initial as () => unknown)() : initial; return [states[i], (next: unknown) => { states[i] = typeof next === "function" ? (next as (value: unknown) => unknown)(states[i]) : next; }]; }, useRef: (initial: unknown) => refs[refIndex++] ??= { current: initial }, useMemo: (factory: () => unknown) => factory(), useEffect: (effect: () => unknown, dependencies?: readonly unknown[]) => { const i = effectIndex++, previous = previousDependencies[i]; if (!previous || !dependencies || dependencies.some((value, index) => !Object.is(value, previous[index]))) effects.push(effect); previousDependencies[i] = dependencies; }, useId: () => "fixture-id" };
  const routes: string[] = [];
  const navigate = (path: string) => { routes.push(path); };
  const bundle = await build({ entryPoints: [`apps/web/src/${file}`], bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", define: { "import.meta.env": JSON.stringify({ DEV: false }) }, external: ["react", "react/jsx-runtime", "react-router-dom", "react-i18next", "*/i18n/LanguageProvider", "*/lib/apiClient", "./apiClient", "*/lib/authClient", "*/lib/authContext", "*/lib/preferencesContext", "*/lib/useWorkflowDeparture", "*/lib/useEditDismissal", "*/components/Drawer", "*/components/LanguageSwitch", "../LanguageSwitch"] });
  const module = { exports: {} as Record<string, (props: Record<string, unknown>) => Node> };
  new Function("module", "exports", "require", bundle.outputFiles[0].text)(module, module.exports, (name: string) => {
    if (name === "react") return react;
    if (name === "react-i18next") return { useTranslation: (namespace: import("i18next").Namespace) => ({ t: i18n.getFixedT(language, namespace) }) };
    if (name === "react-router-dom") return { useNavigate: () => navigate, useSearchParams: () => [new URLSearchParams(), () => {}], Link: "a" };
    if (name.endsWith("/i18n/LanguageProvider")) return { useUiLanguage: () => ({ language, displayLocale: getDisplayLocale(language) }) };
    if (name.endsWith("/apiClient")) return { ApiClientError, apiRequest: api.apiGet, ...api };
    if (name.endsWith("/lib/authClient")) return { AuthClientError };
    if (name.endsWith("/lib/authContext")) return { useAuth: () => ({ session: { user: { id: "fixture-admin", role: "admin" }, mustChangePassword: false } }) };
    if (name.endsWith("/lib/preferencesContext")) return { usePreferences: () => ({ preferences, loading: false }), signedToneClass: () => "" };
    if (name.endsWith("/lib/useWorkflowDeparture")) return { useWorkflowDeparture: () => {} };
    if (name.endsWith("/lib/useEditDismissal")) return { useEditDismissal: (_open: unknown, _saving: unknown, _form: unknown, close: unknown) => close };
    if (name.endsWith("/LanguageSwitch")) return { LanguageSwitch: "language-switch" };
    if (name.endsWith("/components/Drawer")) return { Drawer: "drawer" };
    return require(name);
  });
  const render = (props: Record<string, unknown> = {}) => { stateIndex = refIndex = effectIndex = 0; let tree = module.exports[exported](props); if (file.includes("InstrumentsPage") && typeof tree.type === "function") tree = (tree.type as (props: Record<string, unknown>) => Node)(tree.props); return tree; };
  const flush = async (props: Record<string, unknown> = {}) => { for (let i = 0; i < 4; i++) { render(props); for (const effect of effects.splice(0)) effect(); await tick(); } return render(props); };
  return { render, flush, switch: (value: UiLanguage) => { language = value; }, routes };
}
const input = (tree: Node, placeholder: string, value: string) => { const node = nodes(tree).find(node => node.props.placeholder === placeholder); assert(node, placeholder); (node.props.onChange as (event: unknown) => void)({ target: { value } }); };
const submit = (tree: Node) => { const form = nodes(tree).find(node => node.type === "form"); assert(form); (form.props.onSubmit as (event: unknown) => void)({ preventDefault: () => {}, currentTarget: { checkValidity: () => true } }); };

{
  const calls: Call[] = []; let resolve!: (value: unknown) => void;
  const h = await harness("pages/AccountsPage.tsx", "AccountsPage", { apiGet: async (path: string) => { calls.push({ method: "GET", path }); return path.startsWith("/accounts/totals") ? { totals: [] } : { user: { role: "admin" }, accounts: [] }; }, apiPost: (path: string, body: unknown) => { calls.push({ method: "POST", path, body }); return new Promise(yes => { resolve = yes; }); } });
  let tree = await h.flush({ createOnly: true });
  input(tree, "For example, Hatch US shares", "家人 Source"); tree = h.render({ createOnly: true });
  submit(tree); h.render({ createOnly: true }); const count = calls.length;
  assert.equal(calls.filter(call => call.method === "POST").length, 1);
  const original = structuredClone(calls.at(-1));
  h.switch("zh-CN"); tree = await h.flush({ createOnly: true });
  assert.equal(calls.length, count); assert.deepEqual(calls.at(-1), original);
  assert(nodes(tree).some(node => node.type === "input" && node.props.value === "家人 Source"));
  resolve({ account }); await tick(); assert.deepEqual(h.routes, ["/accounts"]);
}
{
  const calls: Call[] = []; let failOpening!: (error: unknown) => void, openings = 0;
  const instruments = [{ id: "cash-nzd", assetType: "cash", shortName: "NZD source", currency: "NZD" }, { id: "cash-usd", assetType: "cash", shortName: "USD source", currency: "USD" }];
  const h = await harness("pages/AccountsPage.tsx", "AccountsPage", { apiGet: async (path: string) => { calls.push({ method: "GET", path }); return path === "/instruments" ? { instruments } : { user: { role: "admin" }, accounts: [] }; }, apiPost: async (path: string, body: unknown) => { calls.push({ method: "POST", path, body }); if (path === "/accounts") return { account }; if (++openings === 1) return { transaction: { id: "opening-one" } }; return new Promise((_yes, no) => { failOpening = no; }); } });
  let tree = await h.flush({ createOnly: true }); input(tree, "For example, Hatch US shares", "家人 Source"); tree = h.render({ createOnly: true });
  const toggle = nodes(tree).find(node => node.type === "input" && node.props.type === "checkbox"); assert(toggle); (toggle.props.onChange as (event: unknown) => void)({ target: { checked: true } }); tree = await h.flush({ createOnly: true });
  const change = (label: string, value: string) => { const node = nodes(tree).find(node => node.props["aria-label"] === label); assert(node, label); (node.props.onChange as (event: unknown) => void)({ target: { value } }); tree = h.render({ createOnly: true }); };
  change("Instrument in row 1", "cash-nzd"); change("Total cost or balance in row 1", "123.456");
  const add = nodes(tree).find(node => node.type === "button" && String(node.props.children).includes("Add row")); assert(add); (add.props.onClick as () => void)(); tree = h.render({ createOnly: true });
  change("Instrument in row 2", "cash-usd"); change("Total cost or balance in row 2", "45.67"); submit(tree); await tick(); tree = h.render({ createOnly: true });
  assert.equal(calls.filter(call => call.method === "POST").length, 3); const count = calls.length;
  const openingBodies = calls.filter(call => call.path === "/transactions").map(call => call.body as { accountId: string; transactionType: string; grossAmount: string; quantity: null; currency: string; notes: string });
  assert.deepEqual(openingBodies.map(body => ({ accountId: body.accountId, transactionType: body.transactionType, grossAmount: body.grossAmount, quantity: body.quantity, currency: body.currency, notes: body.notes })), [{ accountId: account.id, transactionType: "opening_balance", grossAmount: "123.456", quantity: null, currency: "NZD", notes: "期初余额" }, { accountId: account.id, transactionType: "opening_balance", grossAmount: "45.67", quantity: null, currency: "USD", notes: "期初余额" }]);
  h.switch("zh-CN"); tree = await h.flush({ createOnly: true }); assert.equal(calls.length, count);
  failOpening(new Error("secret-like-marker")); await tick(); tree = h.render({ createOnly: true }); assert(JSON.stringify(tree).includes("已确认期初记录 1 条")); assert(!JSON.stringify(tree).includes("secret-like-marker"));
  h.switch("en"); tree = await h.flush({ createOnly: true }); assert(JSON.stringify(tree).includes("Confirmed opening records: 1")); submit(tree); await tick(); assert.equal(calls.length, count); assert.deepEqual(h.routes, []);
}
{
  const calls: Call[] = []; let reveal!: (value: unknown) => void;
  const h = await harness("pages/AccountsPage.tsx", "AccountsPage", { apiGet: async (path: string) => { calls.push({ method: "GET", path }); return path.startsWith("/accounts/totals") ? { totals: [] } : { user: { role: "admin" }, accounts: [account] }; }, apiPost: (path: string, body: unknown) => { calls.push({ method: "POST", path, body }); return new Promise(yes => { reveal = yes; }); } });
  let tree = await h.flush(); const edit = nodes(tree).find(node => node.props["aria-label"] === "Edit account 家人 Source"); assert(edit); (edit.props.onClick as () => void)(); tree = h.render();
  input(tree, "Only needed to reveal the trading password", "fake-extra-marker"); tree = h.render(); const button = nodes(tree).find(node => node.type === "button" && nodes(node).some(child => child.type === "span" && child.props.children === "Reveal password")); assert(button); (button.props.onClick as () => void)(); const count = calls.length;
  h.switch("zh-CN"); tree = await h.flush(); assert.equal(calls.length, count); assert(nodes(tree).some(node => node.props.value === "fake-extra-marker"));
  reveal({ tradingPassword: "fake-secret-marker" }); await tick(); tree = h.render(); assert(nodes(tree).some(node => node.type === "textarea" && node.props.value === "fake-secret-marker"));
  h.switch("en"); tree = await h.flush(); assert.equal(calls.length, count); assert(nodes(tree).some(node => node.props.value === "fake-secret-marker"));
  const drawer = nodes(tree).find(node => node.type === "drawer"); assert(drawer); (drawer.props.onClose as () => void)(); tree = h.render(); assert(!JSON.stringify(tree).includes("fake-secret-marker"));
}
{
  const calls: Call[] = []; let reject!: (error: unknown) => void;
  const h = await harness("pages/InstrumentsPage.tsx", "InstrumentsPage", { apiGet: async (path: string) => { calls.push({ method: "GET", path }); if (path === "/investment-groups") return { revision: "1", groups: [] }; return { user: { role: "admin" }, instruments: [] }; }, apiPost: (path: string, body: unknown) => { calls.push({ method: "POST", path, body }); return new Promise((_yes, no) => { reject = no; }); } });
  let tree = await h.flush(); const add = nodes(tree).find(node => node.type === "button" && nodes(node).some(child => child.type === "span" && child.props.children === "Add instrument")); assert(add); (add.props.onClick as () => void)(); tree = h.render();
  input(tree, "For example, AMD, 0700", "AMD"); input(tree, "For example, Advanced Micro Devices", "Source name"); input(tree, "For example, AMD, Tencent or FS Nasdaq 100", "Source short"); tree = h.render(); submit(tree); const count = calls.length;
  const write = calls.find(call => call.method === "POST"); assert(write); assert.equal(write.path, "/instruments"); assert.equal((write.body as { marketRegion: string }).marketRegion, "US"); assert.equal((write.body as { assetType: string }).assetType, "stock");
  h.switch("zh-CN"); tree = await h.flush(); assert.equal(calls.length, count); assert(nodes(tree).some(node => node.props.value === "Source short"));
  reject(new Error("secret-like-marker")); await tick(); tree = h.render(); assert(!JSON.stringify(tree).includes("secret-like-marker")); h.switch("en"); tree = h.render(); assert(JSON.stringify(tree).includes("unknown")); assert.equal(calls.length, count);
}
console.log("Real account/instrument handlers preserved pending drafts, exact payloads and request counts across language switches; unknown writes hide source errors.");
