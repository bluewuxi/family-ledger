# Roadmap

## Stage 0: Project Foundation

- Monorepo setup
- Frontend skeleton
- API skeleton
- Jobs skeleton
- Shared types
- Documentation
- CI

## Stage 1: Supabase Schema, Auth Verification, and Role Model

- Initial database migrations
- `profiles`
- `user_roles`
- Shared core business tables with audit fields
- Supabase JWT verification in Lambda API
- Role loading

## Stage 2: CRUD Through Lambda API

- Account CRUD (implemented, including non-confidential trading info and SSM-backed trading password reveal/update)
- Instrument CRUD (implemented)
- Transaction CRUD (implemented; all-account filters, sortable transaction/settlement date, instrument and type headers, server pagination, buy/sell price display, and numeric detail normalization)
- Atomic transaction mutations (implemented: parent, linked cash settlement, owned historical price, and affected snapshots commit together; revision conflicts reject stale calculations, and failures expose safe Chinese reasons)
- Admin-only write APIs
- Viewer read APIs

## Stage 3: Holdings and Dashboard

- Holdings calculation (implemented: native-currency quantity, cash balance, average-cost carrying value, opening entries, and valued holding rows)
- Portfolio summary (implemented: reporting-currency dashboard cards using stored prices, FX rates, and dashboard quote cache where available)
- Account purposes (implemented: investment, daily expense, and education accounts; investment-only dashboard and dedicated flow pages)
- Education logical fund and shared cashflow UI (deployed to test on 2026-10-04, #101): [implementation plan](education-reserve-unification-plan.md); manual multi-currency reserve, dedicated remaining/used summaries, independent domain totals, additive schema and verified seven-entry legacy cutover. Authenticated responsive checks passed at all five required sizes; version-6 backup checks and restore dry-run passed.
- Family cashflow navigation (deployed to test under #103; authenticated responsive acceptance passed on 2026-10-06): one 家庭收支 entry with 日常交易, 教育收支, and 收支查询 tabs; isolated URL filters and legacy route redirects. No schema or calculation changes.
- Derived portfolio snapshots (implemented and deployed to test; separate cutover completed on 2026-09-23 after fresh backup and exact parity verification)
- Dashboard account allocation and holding allocation (implemented; securities by account plus pooled cash, with explicit incomplete/negative distribution states)
- Holding detail page (implemented: account/instrument drill-down with valuation, transactions, dividend summary, linked cash-leg context, and price context)
- Account detail page (implemented: account-level current value, snapshot trend, holdings, recent transactions, cash balance context, and warnings)
- Dedicated currency allocation (pending)

- Investment overview performance and layout (deployed to test on 2026-10-08, #105): API cumulative profit and asset ratio, shared live valuation for dashboard/holdings, default one-year period-profit tab with an asset-trend tab, full curves and sparse hover nodes, and paginated read-only snapshots in data maintenance. Dashboard authenticated responsive acceptance passed on 2026-10-08; holdings and snapshot-tab visual acceptance remain separate. See [investment overview specification](investment-overview-spec.md).
- Dashboard display hotfix (deployed to test on 2026-10-08, #106): rounded whole monetary totals, vertical chart cursors with daily tooltips, and bounded recent trades matching the trend panel height with a full-history link. Authenticated responsive visual checks are deferred at the user's request.
- Trading-day movement correction (#107): `本日变动` uses only current-business-day quotes or estimates, excluding stale prices and published historical closes. Percentage uses participating instruments only; eligibility is data-based, including funds only when a current estimate/quote exists.

## Stage 4: Prices, FX, and Scheduled Jobs

- USD-centered price/FX storage foundation (implemented: currencies, exchange rates, instrument prices, job/provider run audit tables)
- Frankfurter FX maintenance handler (implemented: scheduled Lambda handler syncs account-base currencies, supports optional historical date fetches, logs structured EventBridge context, and relies on retry-safe inserts)
- FundRock PIE unit price maintenance handler (implemented: scheduled Lambda handler ingests latest public FundRock unit prices for seeded Foundation Series PIE funds)
- Market-data source registry (implemented: code-backed definitions for Frankfurter, Yahoo Finance, Eastmoney, FundRock, and Kernel estimate, with capabilities, acquisition methods, configuration types, statuses, and canonical run names)
- Stock/ETF price providers (implemented: enabled database-configured Yahoo Finance and Eastmoney instruments use best-effort public market data)
- Kernel S&P 500 (Unhedged) estimator: switched to published USF NTA with the following-NZX-date mapping, actual-anchor precedence, correction-aware atomic refresh, and resumable historical snapshot repair. Test cutover validation is described in [Kernel NTA repair](kernel-nta-repair.md).
- Price-source adapters for `yahoo_finance`, `eastmoney`, and `kernel_estimate` (implemented for enabled instruments)
- EventBridge jobs for prices and snapshots (implemented for price updates, FX updates, and portfolio snapshots)
- Portfolio snapshots (implemented: daily USD-canonical aggregate and account-level snapshots with NZD/USD/CNY API display)
- Data maintenance UI (implemented: first/default `数据源` tab, Kernel anchor drawer, FX, price, task log, data backup monitor, and data restore instruction tabs with filters and offset pagination where applicable)
- Settings user preferences (implemented: report default currency, gain/loss color convention, and light/dark theme backed by profiles)
- User access management (implemented: admins can view existing Supabase Auth users, maintain `viewer`/`admin` role, and pause/resume access)
- Self-service password reset (implemented: Supabase Auth reset emails with app-hosted new password screen)

## Stage 5: Tax-Assist and Reports

- Monthly value bridge (implemented: snapshot-based `资产变化 = 净投入 + 现金校准 + 估值变动`; dividends flow through snapshots into `估值变动` rather than a separate family-facing section)
- Monthly family review report (implemented: extends the monthly bridge with account contribution, buy/sell activity, linked settlement context, cash calibration notes, data-quality warnings, saved family notes, review completion status, and print-friendly export)
- Tax notes
- Tax-year summaries
- CSV export
- Report generation

## Stage 6: Deployment Hardening and Backup/Export

- S3 deployment (implemented in SAM/CloudFormation templates and deploy scripts)
- API Gateway/Lambda deployment (implemented in SAM/CloudFormation templates and deploy scripts)
- Secrets handling (implemented through SSM parameter references for API/jobs runtime)
- Ledger backup (implemented: scheduled public-ledger Postgres RPC snapshot export to encrypted private S3 with 30-day lifecycle retention, running-batch-job guard, and restore dry-run validation)
- User-facing CSV export
- Monitoring/logging (implemented for job audit tables and structured CloudWatch logs; alarms/DLQ hardening pending)

## Stage 7: Reporting Currency Selector and Charts

- Dashboard reporting currency selector (implemented: `NZD`, `USD`, and `CNY`)
- Holdings reporting currency selector and filters (implemented: account, asset type/cash, and currency filters with valued totals)
- Dashboard asset trend chart (implemented: uses portfolio snapshots)
- Dashboard account allocation chart (implemented: uses current investment security values by account and pooled cash)
- Dashboard daily trade count, holdings allocation chart, and business-day countdown (implemented)

## Spending Queries and Statements

- Deployed to test (2026-10-01, #96): own/counterparty suffix fields and filters, multi-card CCB imports, debit counterparty names/summary-location descriptions, rebate/repayment/FX suggestions, metadata redaction, pending import cancellation, import counts, 退款/返现 wording, and exact total-page pagination.
- Release reset completed: removed 941 imported spending transactions and 5 import batches after a verified backup; retained all 3 spending accounts. Protected account/investment data hashes were unchanged. Pre/post version-4 backups passed restoration dry runs; schema, API health/auth boundary, runtime configuration and current assets passed. Authenticated mobile UI acceptance remains pending user login. See docs/deployment.md.

- Deployed to test on 2026-09-27 (#91): [CSV import redesign](spending-import-plan.md) for CCB debit/credit and BNZ; automatic strict UTF-8/GB18030/UTF-16 detection; bank-specific dates; import previews, duplicates, atomic confirmation/retry and undo; simplified classification/manual rows; bulk tags; monthly and tag charts; retained CSV/PDF sources.
- The versioned empty-table schema redesign requires no data backfill. Related tables must remain empty until release. Backups use version 4 with exact spending amount strings.
- Local parser/storage tests, isolated PostgreSQL concurrency/undo/backup-restore checks, typecheck and build passed. Deployment health, runtime config/current assets, schema and version-4 backup checks passed. Remaining UI/mobile and personal import acceptance are delegated to the user at their request. No personal statements have been imported.
- Test now uses the redesigned schema and version-4 backups, replacing the 2026-09-24 is_spending/statement-month model.
- PDF extraction, budgets, FX conversion and investment integration remain out of scope.

UI refinement: filters use draft values and explicit 查询/重置 actions. Applied filters remain in URLs; tab changes discard drafts and restore applied conditions. Legacy `tab=accounts` retains valid date bounds only before redirecting to spending, because its account IDs belong to a different domain. Transaction filters, pagination, and sorting also use URLs. Date presets use the shared application business date. No financial schema or calculations changed. This local revision has not been deployed; authenticated visual acceptance subsequently passed on 2026-10-06.
