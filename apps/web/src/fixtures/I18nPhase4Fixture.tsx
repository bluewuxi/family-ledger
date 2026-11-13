import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Link, Outlet, RouterProvider } from "react-router-dom";
import {
  calculateEducationTotals,
  type AccountAccessPolicy, type AuthenticatedUser, type DataMaintenanceBackupRun, type EducationEntry,
  type ManagedUser, type SpendingAccount, type StatementRow, type UserPreferences
} from "@family-ledger/shared";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { Layout } from "../components/Layout";
import { RouteDocumentTitle } from "../components/RouteDocumentTitle";
import { LanguageProvider } from "../i18n/LanguageProvider";
import { initializeI18n, setUiLanguage } from "../i18n/instance";
import { isLocalLanguagePreview } from "../i18n/language";
import { login } from "../lib/authClient";
import { AuthProvider } from "../lib/authContext";
import { PreferencesProvider } from "../lib/preferencesContext";
import { initializeRuntimeConfig } from "../lib/runtimeConfig";
import { AboutPage } from "../pages/AboutPage";
import { DailyExpensePage } from "../pages/DailyExpensePage";
import { DataMaintenancePage } from "../pages/DataMaintenancePage";
import { SettingsPage } from "../pages/SettingsPage";
import "../styles.css";

const root = document.getElementById("root");
if (root && isLocalLanguagePreview(import.meta.env.DEV, window.location.hostname)) {
  void start(root).catch(() => { root.textContent = "Isolated Phase 4 fixture startup failed."; });
}

async function start(root: HTMLElement) {
  const query = new URLSearchParams(location.search);
  for (const name of ["sessionStorage", "localStorage"] as const) {
    const values = new Map<string, string>();
    Object.defineProperty(window, name, { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key), clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size; }
    } });
  }
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const user: AuthenticatedUser = { id: id(1), email: "phase4@example.invalid", role: query.get("role") === "viewer" ? "viewer" : "admin" };
  const now = "2026-11-10T02:30:00Z";
  const viewer: ManagedUser = { id: id(2), email: "viewer@example.invalid", role: "viewer", isActive: true, createdAt: now, lastSignInAt: now };
  const users: ManagedUser[] = [{ ...viewer, ...user }, viewer];
  let preferences: UserPreferences = { preferredCurrency: "NZD", gainColorScheme: "red_positive", uiTheme: query.get("theme") === "dark" ? "dark" : "light" };
  const account: SpendingAccount = { id: id(3), name: "Original account · 银行账户", source_format: "bnz", default_currency: "NZD", identity_suffix: "0123", is_active: true };
  const scope: AccountAccessPolicy = { userId: viewer.id, revision: 7, scope: { mode: "selected", resources: [{ kind: "spending", id: account.id }] } };
  const row: StatementRow = { id: id(4), statement_id: null, account_id: account.id, account_name: account.name, currency: "NZD", updated_at: now,
    row_number: null, fingerprint: null, transaction_date: "2026-11-09", description: "Original statement description · 原文",
    amount: "-1234.56789", classification: "spending", tag: "未分类", notes: "Original note", account_number_last4: "0123",
    counterparty_account_last4: null, counterparty_name: null, source_metadata: {} };
  const aggregate = { currency: "NZD", income: "0", gross_spending: "1234.56789", refunds: "0", net_spending: "1234.56789", count: 1, pending_count: 0 };
  const fund = { id: id(5), name: "Original reserve · 教育", legacyAccountId: null, cutoverAt: null };
  const entry = { id: id(6), fundId: fund.id, version: 2, legacyTransactionId: null, entryDate: "2026-11-09", entryType: "expense",
    currency: "CNY", amount: "20000", expenseCategory: "tuition", relatedExpenseId: null, targetCurrency: null, targetAmount: null, notes: "Original education note" } as const satisfies EducationEntry;
  const educationTotals = calculateEducationTotals([{ ...entry, entryType: "opening_balance", amount: "100000" }, entry, { ...entry, entryType: "refund", amount: "1000" }, { ...entry, entryType: "contribution", currency: "NZD", amount: "10" }]);
  const delayed: DataMaintenanceBackupRun = { id: id(7), status: "failed", triggerSource: "schedule", startedAt: now, finishedAt: now,
    durationSeconds: 0, recordsInserted: 0, friendlyFailureReason: "Legacy backup message", failureReasonCode: "blocked_by_running_job" };
  const legacyFailure = { ...delayed, id: id(8), failureReasonCode: undefined };
  const pagination = { limit: 20, offset: 0, total: 0, hasMore: false };
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  const success = (data: unknown) => Response.json({ success: true, data });
  const failure = (status: number, code: string, details?: unknown) => Response.json({ success: false, error: { code, message: "Synthetic diagnostic is not UI text", details } }, { status });
  const origin = "https://phase4.fixture.invalid";
  const requests: string[] = [];
  let resolveWrite: ((response: Response) => void) | undefined;
  let responseMode = "conflict";
  const notify = () => window.dispatchEvent(new Event("phase4-requests"));
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const method = init?.method ?? "GET", path = url.pathname;
    if (path === "/config.json" && url.origin === location.origin) return Response.json({ apiBaseUrl: origin });
    if (url.origin !== origin) throw new Error("Unexpected Phase 4 fixture transport");
    requests.push(`${method} ${path}${url.search}`);
    notify();
    if (method === "GET") {
      if (path === "/auth/session") return success({ user, expiresAt, mustChangePassword: false, accountAccess: { ...scope, userId: user.id, scope: { mode: "all" } } });
      if (path === "/settings/preferences") return success({ user, preferences });
      if (path === "/users") return user.role === "admin" ? success({ user, users }) : failure(403, "FORBIDDEN");
      if (path === "/settings/trading-password-gate") return user.role === "admin" ? success({ isInitialized: true, parameterPath: "/fixture/extra-password" }) : failure(403, "FORBIDDEN");
      if (path === `/settings/users/${viewer.id}/account-access`) return success({ accountAccess: scope });
      if (path === "/accounts") return success({ accounts: [] });
      if (path === "/spending/accounts") return success({ user, accounts: [account] });
      if (path === "/spending/filter-options") return success({ accountNumberLast4: ["0123"], counterpartyAccountLast4: [], tags: [row.tag] });
      if (path === "/spending/rows") return success({ rows: [row], totals: [aggregate], monthly: [{ ...aggregate, label: "2026-11" }],
        tags: [{ ...aggregate, label: row.tag }, { ...aggregate, label: null }], pagination: { ...pagination, total: 1 } });
      if (path === "/education-reserve") return success({ user, fund, totals: educationTotals, periodTotals: educationTotals, entries: [entry], expenses: [entry], pagination: { ...pagination, total: 1 } });
      if (path === "/cashflows") return success({ totals: [], rows: [{ domain: "daily_expense", sourceId: row.id, date: row.transaction_date, kind: row.classification,
        category: row.tag, currency: row.currency, amount: row.amount, notes: row.notes }], pagination: { ...pagination, total: 1 } });
      if (path === "/instruments") return success({ instruments: [] });
      if (path === "/data-maintenance/data-sources") return success({ user, dataSources: [] });
      if (path === "/data-maintenance/fx-rates") return success({ user, fxRates: [], pagination });
      if (path === "/data-maintenance/instrument-prices") return success({ user, prices: [], pagination });
      if (path === "/data-maintenance/job-runs") return success({ user, jobRuns: [], pagination });
      if (path === "/data-maintenance/backups") return success({ user, backupRuns: [delayed, legacyFailure], backupSummary: { latestRun: delayed, latestSucceededRun: null }, pagination: { ...pagination, total: 2 } });
      if (path === "/data-maintenance/errors") return success({ items: [], pagination });
      if (path === "/portfolio-snapshots") return success({ snapshots: [], pagination });
    }
    if (method === "POST" && path === "/auth/login") return success({ token: "fixture-session", expiresAt, mustChangePassword: false });
    if (method === "POST" && path === "/data-maintenance/errors/query") return success({ observed: 0, nextCursor: "fixture-cursor" });
    if (method === "POST" && path === "/data-maintenance/retrievals") return success({ retrieval: { kind: "all", triggered: [], triggerRequestId: "fixture-request" } });
    if (method === "POST" && path === `/settings/users/${viewer.id}/reset-password`) return failure(401, "UNAUTHORIZED", { kind: "workflow", reason: "ADMIN_PASSWORD_REJECTED" });
    if (method === "PATCH" && path === "/settings/preferences" && typeof init?.body === "string") {
      preferences = { ...preferences, ...JSON.parse(init.body) as Partial<UserPreferences> };
      return success({ user, preferences });
    }
    if ((method === "PUT" && path === `/settings/users/${viewer.id}/account-access`) ||
        (method === "PATCH" && path === `/users/${viewer.id}`) ||
        (method === "PATCH" && path.startsWith("/education-reserve/entries/"))) {
      if (responseMode === "pending") {
        return new Promise<Response>(resolve => { resolveWrite = resolve; notify(); });
      }
      return failure(409, "CONFLICT");
    }
    throw new Error(`Unexpected Phase 4 fixture route: ${method} ${path}`);
  };
  await initializeRuntimeConfig();
  await initializeI18n();
  await setUiLanguage(query.get("language") === "en" ? "en" : "zh-CN");
  await login(user.email, "fixture-password");

  function Controls() {
    const [, rerender] = useState(0);
    useEffect(() => {
      const refresh = () => rerender(value => value + 1);
      window.addEventListener("phase4-requests", refresh);
      return () => window.removeEventListener("phase4-requests", refresh);
    }, []);
    return <aside aria-label="Isolated fixture controls" style={{ padding: "1rem", overflowWrap: "anywhere" }}>
      <LanguageSwitch />
      <label>Write response <select defaultValue={responseMode} onChange={event => { responseMode = event.target.value; }}><option value="conflict">Conflict</option><option value="pending">Pending</option></select></label>
      <button type="button" disabled={!resolveWrite} onClick={() => { resolveWrite?.(failure(409, "CONFLICT")); resolveWrite = undefined; notify(); }}>Reject pending write</button>
      <output data-testid="phase4-requests">Requests: {requests.length}; writes: {requests.filter(item => !item.startsWith("GET ") && !item.startsWith("POST /auth/")).length}</output>
      <nav aria-label="Fixture pages" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link to="/daily-expense">Spending</Link><Link to="/daily-expense?tab=education">Education</Link>
        <Link to="/daily-expense?tab=report">Report</Link><Link to="/settings">Settings</Link>
        <Link to="/data-maintenance">Maintenance</Link><Link to="/about">About</Link>
        <a href="/fixtures/import-workspace.html?scenario=loss">Statement import fixture</a>
      </nav>
      <details><summary>Synthetic request paths</summary><pre style={{ whiteSpace: "pre-wrap" }}>{requests.join("\n")}</pre></details>
    </aside>;
  }
  function Shell() {
    return <AuthProvider><PreferencesProvider><RouteDocumentTitle /><Layout><Controls /><Outlet /></Layout></PreferencesProvider></AuthProvider>;
  }
  const router = createMemoryRouter([{ element: <Shell />, children: [
    { path: "/daily-expense", element: <DailyExpensePage /> },
    { path: "/settings", element: <SettingsPage /> },
    { path: "/data-maintenance", element: <DataMaintenancePage /> },
    { path: "/about", element: <AboutPage /> }
  ] }], { initialEntries: [query.get("page") ?? "/daily-expense"] });
  createRoot(root).render(<LanguageProvider><RouterProvider router={router} /></LanguageProvider>);
}
