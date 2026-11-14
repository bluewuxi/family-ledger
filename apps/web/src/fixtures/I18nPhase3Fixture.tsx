import { useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { createMemoryRouter, Link, Outlet, RouterProvider } from "react-router-dom";
import type { AccountDetailSummary, HoldingDetailSummary, HoldingsValuationSummary, Instrument, InvestmentAccount, InvestmentDashboardSummary, InvestmentTransaction, MonthlyReview, MonthlySummary, PortfolioTrend, SnapshotDisplayCurrency, ValuedHoldingSummary } from "@family-ledger/shared";
import { getAppBusinessDate } from "@family-ledger/shared";
import { LanguageProvider } from "../i18n/LanguageProvider";
import { initializeI18n, setUiLanguage } from "../i18n/instance";
import { isLocalLanguagePreview } from "../i18n/language";
import { AuthProvider } from "../lib/authContext";
import { PreferencesProvider } from "../lib/preferencesContext";
import { initializeRuntimeConfig } from "../lib/runtimeConfig";
import { login } from "../lib/authClient";
import { Layout } from "../components/Layout";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { RouteDocumentTitle } from "../components/RouteDocumentTitle";
import { DashboardPage } from "../pages/DashboardPage";
import { HoldingsPage } from "../pages/HoldingsPage";
import { HoldingDetailPage } from "../pages/HoldingDetailPage";
import { MonthlySummaryPage } from "../pages/MonthlySummaryPage";
import { AccountsPage } from "../pages/AccountsPage";
import { AccountDetailPage } from "../pages/AccountDetailPage";
import { InstrumentsPage } from "../pages/InstrumentsPage";
import { TransactionsPage } from "../pages/TransactionsPage";
import "../styles.css";
import "./i18n-phase3.css";

// This separate DEV entry never mounts a synthetic session in the real application.
// Every fetch is intercepted before startup; no branch delegates to a live transport.
if (isLocalLanguagePreview(import.meta.env.DEV, window.location.hostname)) {
  void start().catch(() => { document.getElementById("root")!.textContent = "Isolated Phase 3 fixture startup failed."; });
}

async function start() {
  const parameters = new URLSearchParams(window.location.search);
  const role = parameters.get("role") === "viewer" ? "viewer" : "admin";
  const theme = parameters.get("theme") === "dark" ? "dark" : "light";
  // Preferences, route preferences and auth tokens all remain document-local.
  for (const name of ["sessionStorage", "localStorage"] as const) {
    const values = new Map<string, string>();
    Object.defineProperty(window, name, { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, String(value)); },
      removeItem: (key: string) => { values.delete(key); }, clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size; }
    } });
  }
  const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
  const user = { id: id(90), email: "phase3@example.invalid", role };
  const now = "2026-11-08T01:02:03.000Z", date = getAppBusinessDate();
  const audit = { createdAt: now, updatedAt: now, createdByUserId: user.id, updatedByUserId: user.id };
  let accounts: InvestmentAccount[] = [
    { ...audit, id: id(1), name: "Original family account · 长名称", broker: "Synthetic broker", accountType: "brokerage", purpose: "investment", baseCurrency: "USD", marketRegion: "US", notes: "Original family notes — preserve verbatim", tradingInfo: "Synthetic trading instructions", hasTransactions: true },
    { ...audit, id: id(2), name: "Synthetic daily account", broker: null, accountType: "bank", purpose: "daily_expense", baseCurrency: "NZD", marketRegion: "NZ", notes: null, tradingInfo: null, hasTransactions: false }
  ];
  const instrument: Instrument = { ...audit, id: id(3), active: true, symbol: "SYN", name: "Original source security", shortName: "Original security · 原始简称", description: "Untranslated source description", marketRegion: "US", exchange: "NYSE", currency: "USD", assetType: "etf", isin: null, provider: "Synthetic provider", priceSource: "manual", priceSourceSymbol: "SYN", priceSourceExchange: "NYSE", priceUpdateEnabled: false, priceUpdatePriority: 0, sourceUrl: null, sourceCheckedAt: null, notes: "Original instrument note" };
  const cash: Instrument = { ...instrument, id: id(4), symbol: "USD", name: "Source cash name", shortName: "Source cash name", assetType: "cash" };
  let instruments = [instrument, cash, { ...instrument, id: id(5), symbol: "OLD", shortName: "Inactive source security", active: false }];
  const transaction: InvestmentTransaction = { ...audit, id: id(6), accountId: accounts[0].id, instrumentId: instrument.id, instrumentSymbol: instrument.symbol, instrumentName: instrument.name, instrumentShortName: instrument.shortName, instrumentAssetType: "etf", transactionType: "buy", tradeDate: date, settlementDate: date, quantity: "2.000000", price: "50.123456", grossAmount: "100.246912", fee: "1", tax: "0", currency: "USD", adjustmentDirection: null, transactionSource: "manual", linkedTransactionId: null, settlementCurrency: "USD", settlementAmount: "101.246912", notes: "Original transaction notes" };
  const cashLeg: InvestmentTransaction = { ...transaction, id: id(7), instrumentId: cash.id, instrumentSymbol: "USD", instrumentShortName: cash.shortName, instrumentAssetType: "cash", transactionType: "withdrawal", quantity: null, price: null, grossAmount: "101.246912", transactionSource: "generated_cash_leg", linkedTransactionId: transaction.id, settlementCurrency: null, settlementAmount: null };
  let transactions = [transaction];
  const holding: ValuedHoldingSummary = { accountId: accounts[0].id, accountName: accounts[0].name, instrumentId: instrument.id, instrumentSymbol: instrument.symbol, instrumentName: instrument.name, instrumentShortName: instrument.shortName, assetType: "etf", currency: "USD", quantity: "12.123456", averageUnitCost: "40.123456", costAmount: "400", warnings: [], reportingCurrency: "USD", marketValue: "600", unrealizedGain: "200", latestPrice: "50.123456", latestPriceDate: date, latestPriceIsEstimated: true, latestPriceKind: "stored", latestPriceSource: "Synthetic source", quoteFetchedAt: now, valuationWarnings: [] };
  const cashHolding: ValuedHoldingSummary = { ...holding, instrumentId: cash.id, instrumentSymbol: "USD", instrumentName: cash.name, instrumentShortName: cash.shortName, assetType: "cash", quantity: "400", costAmount: null, averageUnitCost: null, marketValue: "400", unrealizedGain: null, latestPrice: "1", latestPriceIsEstimated: false };
  const performance = { netInvestment: "850", investmentProfit: "150", profitPercentageOfAssets: "15", inceptionDate: "2025-11-01", warnings: [] };
  const metadata = { valuedAt: now, nextRefreshAt: null, fxDateFrom: date, fxDateTo: date, quotedHoldingCount: 0, storedPriceHoldingCount: 1, missingPriceHoldingCount: 0, priceDateFrom: date, priceDateTo: date, quoteFetchedAtFrom: now, quoteFetchedAtTo: now };
  function valuation(currency: SnapshotDisplayCurrency): HoldingsValuationSummary {
    return { reportingCurrency: currency, totalMarketValue: "1000", totalUnrealizedGain: "200", investmentPerformance: performance, valuationMetadata: metadata, warnings: [], holdings: [holding, cashHolding].map(row => ({ ...row, reportingCurrency: currency })) };
  }
  const trend: PortfolioTrend = { points: [
    { date: "2025-11-01", snapshotDate: "2025-11-01", portfolioValue: "700", totalInvestment: "700" },
    { date: "2026-01-01", snapshotDate: "2025-12-31", portfolioValue: "680", totalInvestment: "700" },
    { date: "2026-05-01", snapshotDate: "2026-05-01", portfolioValue: "950", totalInvestment: "850" },
    { date, snapshotDate: date, portfolioValue: "1000", totalInvestment: "850" }
  ], principalPoints: [{ date: "2025-11-01", totalInvestment: "700" }, { date: "2026-05-01", totalInvestment: "850" }], summary: { range: "1y", rangeStart: "2025-11-01", rangeEnd: date, currency: "USD", inceptionDate: "2025-11-01", currentTotalInvestment: "850", cumulativeMovement: "150", warnings: [] } };
  const dashboardPollAt = parameters.get("poll") === "due" ? Date.now() + 15_000 : null;
  function dashboard(currency: SnapshotDisplayCurrency): InvestmentDashboardSummary {
    return { reportingCurrency: currency, totalAssets: "1000", todayChange: "-12.5", todayChangePct: "-1.25", unrealizedGain: "200", dailyTradeCount: 1, accountCount: 1, accounts: [{ accountId: accounts[0].id, accountName: accounts[0].name, marketValue: "1000" }], allocations: [{ id: accounts[0].id, name: accounts[0].name, marketValue: "600", allocationType: "account" }, { id: "cash", name: "现金", marketValue: "400", allocationType: "cash" }], holdingAllocations: [{ id: instrument.id, name: instrument.shortName, assetType: "etf", marketValue: "600", percentageOfTotal: "60", allocationType: "instrument" }, { id: "cash", name: "现金", assetType: "cash", marketValue: "400", percentageOfTotal: "40", allocationType: "cash" }], quoteFetchedAt: now, quoteDate: date, warnings: [], valuationMetadata: metadata, investmentPerformance: performance, groupDistribution: { status: "ready", revision: "4", canShowPercentages: true, reason: null, rows: [{ id: id(8), allocationType: "group", groupId: id(8), instrumentId: null, name: "未分组", marketValue: "600", percentageOfTotal: "60", members: [{ instrumentId: instrument.id, shortName: instrument.shortName }] }, { id: "cash", allocationType: "cash", groupId: null, instrumentId: null, name: "现金", marketValue: "400", percentageOfTotal: "40", members: [] }] } };
  }
  let review: MonthlyReview = { month: date.slice(0, 7), familyNotes: "Original family review notes · 保留原文", reviewStatus: "in_progress", completedAt: null, completedByUserId: null, updatedByUserId: user.id, createdAt: now, updatedAt: now };
  function monthlySummary(month: string, currency: SnapshotDisplayCurrency): MonthlySummary {
    return { month, currency, monthStart: `${month}-01`, monthEnd: `${month}-28`, startSnapshotDate: "2026-09-29", endSnapshotDate: "2026-10-28", requestedStartSnapshotDate: "2026-09-30", requestedEndSnapshotDate: "2026-10-31", fullPeriodAvailable: false, startValue: "800", endValue: "1000", assetChange: null, netPrincipalFlow: "50", cashAdjustmentImpact: "0", valuationMovement: null,
      bridgeLines: [{ key: "start_value", label: "期初资产", amount: "800" }, { key: "net_principal_flow", label: "净投入", amount: "50" }, { key: "valuation_movement", label: "估值变动", amount: null }, { key: "end_value", label: "期末资产", amount: "1000" }],
      dividendSummary: { grossAmount: "12", taxAmount: "2", netAmount: "10", transactionCount: 1, latestDividendDate: date, instruments: [] }, dividendTransactions: [], cashAdjustments: [], principalTransactions: [], accountChanges: [{ accountId: accounts[0].id, accountName: accounts[0].name, currency, startValue: "800", endValue: "1000", assetChange: null, netPrincipalFlow: "50", cashAdjustmentImpact: "0", valuationMovement: null, valuationContributionPct: null, changeAmount: null, changePct: null, warnings: [] }], tradeActivity: [{ transaction, linkedCashLeg: cashLeg }], snapshotWarnings: [], warnings: [{ code: "SNAPSHOT_DATE_MISMATCH", date: "2026-10-31", actualDate: "2026-10-28", currency, message: "Ignored synthetic legacy message" }, { code: "MISSING_OPENING_PRICE", date: "2026-10-01", currency: "USD", instrumentShortName: instrument.shortName, message: "Ignored synthetic legacy message" }] };
  }
  function accountDetail(currency: SnapshotDisplayCurrency): AccountDetailSummary {
    return { reportingCurrency: currency, account: accounts[0], currentValue: { marketValue: "1000", cashMarketValue: "400", nonCashMarketValue: "600", unrealizedGain: "200", holdingCount: 2, cashBalanceCount: 1, valuationBusinessDate: date }, holdings: valuation(currency).holdings, cashBalances: [], recentTransactions: [{ transaction, linkedCashLeg: cashLeg }], trend: { ...trend.summary, points: trend.points.map(point => ({ date: point.date, snapshotDate: point.snapshotDate, marketValue: point.portfolioValue, totalInvestment: point.totalInvestment })), principalPoints: trend.principalPoints, warnings: [] }, latestSnapshot: { date, snapshotDate: date, marketValue: "1000" }, valuationWarnings: [], snapshotWarnings: [], nextRefreshAt: null, investmentPerformance: performance, valuedAt: now, warnings: [{ origin: "snapshot", code: "MISSING_PREVIOUS_PRICE", instrumentShortName: instrument.shortName, currency: "USD", date, message: "Ignored synthetic legacy message" }] };
  }
  function holdingDetail(currency: SnapshotDisplayCurrency): HoldingDetailSummary {
    return { reportingCurrency: currency, hasCurrentPosition: true, holding: { ...holding, reportingCurrency: currency }, account: accounts[0], instrument, transactions, linkedCashLegs: [{ parentTransactionId: transaction.id, transaction: cashLeg }], dividendTransactions: [], dividendSummary: { currency: "USD", totalGrossAmount: "12", totalTaxAmount: "2", latestDividendDate: date }, priceContext: { latestPrice: null, previousPrice: null, movementAmount: null, movementPct: null, provider: "Synthetic source" } };
  }

  let mode = parameters.get("mode") ?? "success", version = 0, openingAttempts = 0;
  const listeners = new Set<() => void>();
  const log: Array<{ method: string; path: string; idempotencyKey?: string; body?: unknown }> = [];
  const pending: Array<(outcome: "success" | "lost") => void> = [];
  const replays = new Map<string, { body: string; transaction: InvestmentTransaction }>();
  const publish = () => { version++; for (const listener of listeners) listener(); };
  const finishPending = (outcome: "success" | "lost") => { pending.splice(0).forEach(resolve => resolve(outcome)); mode = "success"; publish(); };
  const success = (data: unknown) => Response.json({ success: true, data });
  const fail = (status: number, reason?: string) => Response.json({ success: false, error: { code: status === 403 ? "FORBIDDEN" : status === 409 ? "CONFLICT" : status === 503 ? "DEPENDENCY_UNAVAILABLE" : "VALIDATION_ERROR", message: "Ignored synthetic private payload", ...(reason ? { details: { reason } } : {}) } }, { status });
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET"), path = url.pathname;
    if (path === "/config.json" && url.origin === window.location.origin) return Response.json({ apiBaseUrl: "https://phase3.fixture.invalid" });
    if (url.origin !== "https://phase3.fixture.invalid") throw new Error("Unexpected isolated fixture transport");
    const allowed = method === "GET" ? ["/auth/session", "/settings/preferences", "/accounts", "/accounts/totals", "/instruments", "/investment-groups", "/holdings", "/holdings/detail", "/dashboard", "/portfolio-snapshots", "/transactions", "/transactions/balances", "/reports/monthly-summary", "/reports/monthly-review"].includes(path) || /^\/accounts\/[^/]+\/detail$/.test(path)
      : method === "POST" ? ["/auth/login", "/auth/logout", "/accounts", "/instruments", "/transactions"].includes(path) || /^\/accounts\/[^/]+\/trading-password\/reveal$/.test(path)
      : method === "PUT" ? /^\/(?:accounts|instruments|transactions)\/[^/]+$/.test(path) || /^\/accounts\/[^/]+\/trading-password$/.test(path)
      : method === "DELETE" ? /^\/(?:accounts|instruments|transactions)\/[^/]+$/.test(path)
      : method === "PATCH" && path === "/reports/monthly-review";
    if (!allowed) throw new Error(`Unexpected isolated fixture route: ${method} ${path}`);
    const key = new Headers(init?.headers).get("idempotency-key") ?? undefined;
    const rawBody = typeof init?.body === "string" ? init.body : "{}";
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    log.push({ method, path: path + url.search, ...(key ? { idempotencyKey: key } : {}), ...(["/transactions", "/reports/monthly-review"].includes(path) && method !== "GET" ? { body } : {}) }); publish();
    if (path === "/auth/login" && method === "POST") return success({ token: "phase3-document-only-token", expiresAt, mustChangePassword: false });
    if (path === "/auth/session" && method === "GET") return success({ user, expiresAt, mustChangePassword: false });
    if (path === "/auth/logout" && method === "POST") return success({});
    if (path === "/settings/preferences" && method === "GET") return success({ user, preferences: { preferredCurrency: "USD", gainColorScheme: "red_positive", uiTheme: theme } });
    if (method === "GET" && mode === "readFailure") return fail(503);
    if (mode === "delay") await new Promise(resolve => setTimeout(resolve, 2000));
    if (method !== "GET" && role === "viewer" && !path.endsWith("/trading-password/reveal")) return fail(403);
    let outcome = mode;
    if (method !== "GET" && mode === "pending") outcome = await new Promise<"success" | "lost">(resolve => { pending.push(resolve); publish(); });
    if (method !== "GET" && /^\d{3}$/.test(outcome)) return fail(Number(outcome), outcome === "409" ? "LEDGER_REVISION_CONFLICT" : undefined);
    const writeSuccess = (data: unknown) => { if (outcome === "lost") throw new Error("Synthetic write response loss"); return success(data); };
    if (path.endsWith("/trading-password/reveal") && method === "POST") {
      if (mode === "gateMissing") return fail(403, "EXTRA_PASSWORD_NOT_INITIALIZED");
      if (mode === "gateRejected") return fail(403, "EXTRA_PASSWORD_REJECTED");
      return writeSuccess({ tradingPassword: "SYNTHETIC-SECRET-ONLY" });
    }
    if (path.endsWith("/trading-password") && method === "PUT") return writeSuccess({ updated: true });
    const currency = (["NZD", "CNY"].includes(url.searchParams.get("currency") ?? "") ? url.searchParams.get("currency") : "USD") as SnapshotDisplayCurrency;
    if (method === "GET") {
      if (path === "/accounts") return success({ user, accounts });
      if (path === "/accounts/totals") return success({ totals: accounts.map(account => ({ accountId: account.id, currency, marketValue: "1000" })) });
      if (path === "/instruments") return success({ user, instruments });
      if (path === "/investment-groups") return success({ revision: "4", groups: [{ id: id(8), name: "未分组", instrumentIds: [instrument.id] }] });
      if (path === "/holdings") return success(valuation(currency));
      if (path === "/holdings/detail") return success({ holdingDetail: holdingDetail(currency) });
      if (/^\/accounts\/[^/]+\/detail$/.test(path)) return success({ accountDetail: accountDetail(currency) });
      if (path === "/dashboard") {
        const result = dashboard(currency);
        if (dashboardPollAt !== null && url.searchParams.get("quoteMode") === "cached") {
          result.valuationMetadata = { ...metadata, nextRefreshAt: new Date(dashboardPollAt).toISOString() };
        }
        return success({ dashboard: result });
      }
      if (path === "/portfolio-snapshots") return success({ snapshots: [], trend: { ...trend, summary: { ...trend.summary, currency, range: url.searchParams.get("trendRange") ?? "1y" } } });
      if (path === "/transactions/balances") return success(mode === "malformedBalances" ? { holdings: [], cashBalances: [{}] } : { holdings: [holding], cashBalances: accounts.map(account => ({ accountId: account.id, instrumentId: cash.id, quantity: "400", warnings: [] })) });
      if (path === "/transactions") return success({ user, transactions, linkedCashLegs: [cashLeg], pagination: { total: transactions.length, limit: Number(url.searchParams.get("limit") ?? 20), offset: Number(url.searchParams.get("offset") ?? 0), hasMore: false } });
      if (path === "/reports/monthly-summary") return success({ user, monthlySummary: monthlySummary(url.searchParams.get("month") ?? review.month, currency) });
      if (path === "/reports/monthly-review") return success({ user, monthlyReview: { ...review, month: url.searchParams.get("month") ?? review.month } });
    }
    if (path === "/reports/monthly-review" && method === "PATCH") {
      review = { ...review, familyNotes: String(body.familyNotes ?? review.familyNotes), reviewStatus: body.reviewStatus === "complete" ? "complete" : "in_progress", updatedAt: now };
      return writeSuccess({ user, monthlyReview: review });
    }
    if (path === "/transactions" && method === "POST") {
      if (mode === "openingFailure" && ++openingAttempts === 2) return fail(400, "INACTIVE_INSTRUMENT");
      const previous = key ? replays.get(key) : undefined;
      if (previous) return previous.body === rawBody ? success({ transaction: previous.transaction }) : fail(409, "IDEMPOTENCY_CONFLICT");
      const saved = { ...transaction, ...body, id: id(100 + transactions.length) } as InvestmentTransaction;
      transactions = [...transactions, saved];
      if (key) replays.set(key, { body: rawBody, transaction: saved });
      publish();
      if (outcome === "lost") throw new Error("Synthetic transaction response loss after one commit");
      return success({ transaction: saved });
    }
    if (/^\/transactions\/[^/]+$/.test(path) && ["PUT", "DELETE"].includes(method)) {
      const target = path.split("/").at(-1)!;
      if (method === "DELETE") { transactions = transactions.filter(row => row.id !== target); return writeSuccess({ deleted: true }); }
      const saved = { ...transaction, ...body, id: target } as InvestmentTransaction;
      transactions = transactions.map(row => row.id === target ? saved : row); return writeSuccess({ transaction: saved });
    }
    if (path === "/accounts" && method === "POST") {
      const account = { ...accounts[0], ...body, id: id(200 + accounts.length), hasTransactions: false } as InvestmentAccount;
      accounts = [...accounts, account]; return writeSuccess({ account });
    }
    if (/^\/accounts\/[^/]+$/.test(path) && method === "PUT") {
      const account = { ...accounts[0], ...body, id: path.split("/").at(-1)! } as InvestmentAccount;
      accounts = accounts.map(row => row.id === account.id ? account : row); return writeSuccess({ account });
    }
    if (/^\/accounts\/[^/]+$/.test(path) && method === "DELETE") return fail(400, "ACCOUNT_IN_USE");
    if (path === "/instruments" && method === "POST") {
      const saved = { ...instrument, ...body, id: id(300 + instruments.length) } as Instrument;
      instruments = [...instruments, saved]; return writeSuccess({ instrument: saved });
    }
    if (/^\/instruments\/[^/]+$/.test(path) && method === "PUT") {
      const saved = { ...instrument, ...body, id: path.split("/").at(-1)! } as Instrument;
      instruments = instruments.map(row => row.id === saved.id ? saved : row); return writeSuccess({ instrument: saved });
    }
    if (/^\/instruments\/[^/]+$/.test(path) && method === "DELETE") return fail(400, "INSTRUMENT_IN_USE");
    throw new Error(`Unexpected isolated fixture request: ${method} ${path}`);
  };
  await initializeI18n();
  await setUiLanguage(parameters.get("language") === "zh-CN" ? "zh-CN" : "en");
  await initializeRuntimeConfig();
  await login(user.email, "synthetic-document-only-password");

  function FixtureControls() {
    useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version);
    return <aside className="phase3-fixture-controls" aria-label="Isolated fixture controls">
      <strong>Isolated Phase 3 fixture — synthetic data only</strong><LanguageSwitch />
      <label>Response mode<select value={mode} onChange={event => { mode = event.target.value; publish(); }}>{["success", "delay", "pending", "lost", "readFailure", "400", "403", "409", "503", "gateMissing", "gateRejected", "openingFailure", "malformedBalances"].map(value => <option key={value}>{value}</option>)}</select></label>
      <button type="button" onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; }}>Toggle local theme</button>
      <button type="button" disabled={!pending.length} onClick={() => { finishPending("success"); }}>Complete pending</button>
      <button type="button" disabled={!pending.length} onClick={() => { finishPending("lost"); }}>Lose pending response</button>
      <label>Fixture role<select value={role} onChange={event => { const next = new URL(window.location.href); next.searchParams.set("role", event.target.value); window.location.assign(next); }}><option>admin</option><option>viewer</option></select></label>
      <output data-testid="request-count">Requests: {log.length}; writes: {log.filter(row => row.method !== "GET" && !row.path.startsWith("/auth/")).length}; committed keyed transaction creates: {replays.size}; pending: {pending.length}</output>
      <nav aria-label="Fixture pages">{[["Dashboard", "/dashboard"], ["Holdings", "/holdings"], ["Holding detail", `/holdings/${accounts[0].id}/${instrument.id}`], ["Monthly review", "/reports/monthly-summary"], ["Accounts", "/accounts"], ["Create account", "/accounts/new"], ["Account detail", `/accounts/${accounts[0].id}`], ["Instruments", "/instruments"], ["Transactions", "/transactions"]].map(([label, path]) => <Link key={path} to={path}>{label}</Link>)}</nav>
      <details><summary>Synthetic request log (secret fields excluded)</summary><pre data-testid="request-log">{JSON.stringify(log, null, 2)}</pre></details>
      <p>Use pending → switch language → Lose pending response → explicit retry. Compare the original operation key and payload; only one synthetic create is committed. Native confirmations localize when opened and cannot switch live.</p>
    </aside>;
  }
  function FixtureOverlayControls() {
    const [target, setTarget] = useState<Element | null>(null);
    useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version);
    useEffect(() => {
      const locate = () => setTarget(document.querySelector("dialog[data-confirmation-dialog][open]") ?? document.querySelector(".drawer-panel:not([inert]) .drawer-body"));
      const observer = new MutationObserver(locate);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "inert"] });
      locate(); return () => observer.disconnect();
    }, []);
    return target ? createPortal(<section className="phase3-overlay-controls" aria-label="Fixture overlay controls"><LanguageSwitch /><label>Fixture response<select value={mode} onChange={event => { mode = event.target.value; publish(); }}>{["success", "pending", "lost", "400", "403", "409", "503", "gateMissing", "gateRejected", "openingFailure"].map(value => <option key={value}>{value}</option>)}</select></label><button type="button" disabled={!pending.length} onClick={() => { finishPending("success"); }}>Complete pending</button><button type="button" disabled={!pending.length} onClick={() => { finishPending("lost"); }}>Lose pending response</button><output>Requests: {log.length}; creates: {replays.size}</output></section>, target) : null;
  }
  function FixtureShell() { return <AuthProvider><PreferencesProvider><RouteDocumentTitle /><FixtureControls /><FixtureOverlayControls /><Layout><Outlet /></Layout></PreferencesProvider></AuthProvider>; }
  const router = createMemoryRouter([{ element: <FixtureShell />, children: [
    { path: "/dashboard", element: <DashboardPage /> }, { path: "/holdings", element: <HoldingsPage /> },
    { path: "/holdings/:accountId/:instrumentId", element: <HoldingDetailPage /> },
    { path: "/reports/monthly-summary", element: <MonthlySummaryPage /> },
    { path: "/accounts", element: <AccountsPage /> }, { path: "/accounts/new", element: <AccountsPage createOnly /> },
    { path: "/accounts/:accountId", element: <AccountDetailPage /> }, { path: "/instruments", element: <InstrumentsPage /> }, { path: "/transactions", element: <TransactionsPage /> }
  ] }], { initialEntries: [parameters.get("page") ?? "/dashboard"] });
  createRoot(document.getElementById("root")!).render(<LanguageProvider><RouterProvider router={router} /></LanguageProvider>);
}
