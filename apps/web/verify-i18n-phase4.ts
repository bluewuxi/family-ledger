import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import ts from "typescript";
import { resources } from "./src/i18n/resources";
import { validateResources } from "./src/i18n/resourceValidation";
import { routeTitleKey } from "./src/components/RouteDocumentTitle";

const routes = [
  "/", "/dashboard", "/accounts", "/accounts/new", "/accounts/:accountId", "/instruments", "/transactions",
  "/daily-expense/import", "/daily-expense/import/:statementId", "/daily-expense", "/education", "/cashflows",
  "/holdings", "/holdings/:accountId/:instrumentId", "/reports/monthly-summary", "/data-maintenance",
  "/settings", "/about", "/login", "/forgot-password", "/reset-password", "*"
];
const root = "apps/web/src";
const read = (file: string) => readFileSync(posix.join(root, file), "utf8");
assert.deepEqual([...read("App.tsx").matchAll(/<Route path="([^"]+)"/g)].map(match => match[1]), routes,
  "Update the route and browser coverage inventory when routes change.");
for (const path of ["/daily-expense", "/daily-expense/import", "/daily-expense/import/fixture", "/data-maintenance", "/settings", "/about"]) {
  const key = routeTitleKey(path, "");
  assert(key, path);
  assert.notEqual(resources.en.navigation[key], resources["zh-CN"].navigation[key], path);
}
assert.deepEqual(validateResources(resources), []);

// Entries identify particular source literals. Diagnostic messages are never translated
// by matching their text; UI consumers map a stable error descriptor instead.
const exceptions: Record<string, Readonly<Record<string, string>>> = {
  "components/BrandName.tsx": { "金": "brand artwork lettering", "财": "brand artwork lettering", "屋": "brand artwork lettering" },
  "components/LanguageSwitch.tsx": { "中文": "self-language label", "中文 / English": "self-language group name" },
  "i18n/DevelopmentLanguagePreview.tsx": { "中文": "self-language label" },
  "i18n/instance.ts": { "金财屋 · Family Ledger": "startup brand title" },
  "pages/AccountsPage.tsx": { "期初余额": "persisted ledger note", "期初持仓": "persisted ledger note" },
  "lib/authClient.ts": {
    "操作过于频繁，请稍后再试。": "legacy client diagnostic", "登录服务暂时不可用，请稍后重试。": "legacy client diagnostic",
    "邮箱或密码不正确，或登录状态已失效。": "legacy client diagnostic", "操作未完成，请检查输入或稍后重试。": "legacy client diagnostic"
  },
  "lib/apiClient.ts": {
    "缺少 API 地址配置。": "legacy client diagnostic", "登录状态已失效，请重新登录。": "legacy client diagnostic",
    "登录状态已变化，请重新加载。": "legacy client diagnostic", "账户权限已更新，请重新加载。": "legacy client diagnostic",
    "账户权限已更新，正在重新加载。": "legacy client diagnostic", "API 请求失败。": "legacy client diagnostic"
  },
  "lib/preferencesContext.tsx": { "偏好设置请求失败，请稍后重试。": "legacy context error with no rendered consumer" },
  "lib/readCache.ts": { "数据已更新，请重新加载。": "internal cache diagnostic" },
  "lib/transactionBalances.ts": {
    "余额响应数据异常，请刷新或联系管理员。": "internal typed diagnostic",
    "账户余额数据异常，请刷新或联系管理员。": "internal typed diagnostic"
  }
};
const unreachable = "pages/AccountPurposePage.tsx";
const files = readdirSync(root, { recursive: true, encoding: "utf8" }).map(name => name.replaceAll("\\", "/"))
  .filter(name => /\.tsx?$/.test(name) && !name.startsWith("i18n/resources/") && !name.startsWith("fixtures/"));
const problems: string[] = [];
const used = new Set<string>();
for (const file of files) {
  const source = read(file);
  if (file !== unreachable) assert(!/\bAccountPurposePage\b/.test(source), `Reconcile the legacy account page if it is now used by ${file}`);
  if (file !== "components/PlaceholderTable.tsx") assert(!/\bPlaceholderTable\b/.test(source), `Reconcile the placeholder table if it is now used by ${file}`);
  if (file === unreachable) continue;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node) {
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateLiteralToken(node)) {
      const value = node.text.trim();
      if (/\p{Script=Han}/u.test(value)) {
        if (exceptions[file]?.[value]) used.add(`${file}\t${value}`);
        else problems.push(`${file}:${parsed.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${value}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
}
for (const [file, values] of Object.entries(exceptions)) for (const value of Object.keys(values)) {
  assert(used.has(`${file}\t${value}`), `Remove unused exception: ${file}: ${value}`);
}
assert.deepEqual(problems, [], "Untracked hardcoded UI literals require a resource or an exact, justified exception.");
console.log("Phase 4 route, resource and hardcoded copy inventory passed.");
