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

- Account CRUD (implemented)
- Instrument CRUD (implemented)
- Transaction CRUD (implemented)
- Admin-only write APIs
- Viewer read APIs

## Stage 3: Holdings and Dashboard

- Holdings calculation (implemented: native-currency quantity, cash balance, average-cost carrying value, opening entries, and valued holding rows)
- Portfolio summary (implemented: four NZD dashboard cards from stored prices and FX rates)
- Account summary (pending)
- Market and currency allocation (pending)

## Stage 4: Prices, FX, and Scheduled Jobs

- USD-centered price/FX storage foundation (implemented: currencies, exchange rates, instrument prices, job/provider run audit tables)
- Frankfurter FX maintenance handler (implemented: scheduled Lambda handler syncs account-base currencies, supports optional historical date fetches, logs structured EventBridge context, and relies on retry-safe inserts)
- FundRock PIE unit price maintenance handler (implemented: scheduled Lambda handler ingests latest public FundRock unit prices for seeded Foundation Series PIE funds)
- Stock/ETF price providers (implemented: seeded US/HK instruments use Yahoo Finance best-effort chart data; seeded China-listed ETFs/funds use Eastmoney best-effort quote data)
- Scheduled execution policy (implemented in docs: daily 15:30 UTC market-data jobs with EventBridge retry attempts `2` and maximum event age `1 hour`; AWS resources not deployed yet)
- Retry/job logging hardening (implemented for FX ingestion with durable job/provider run status and best-effort failure finalization)
- Additional price maintenance and automated instrument price updates
- Price-source adapters for `yahoo_finance` and `eastmoney` (implemented for seeded instruments)
- EventBridge jobs for prices and snapshots (implemented for price updates, FX updates, and portfolio snapshots)
- Portfolio snapshots (implemented: daily USD-canonical aggregate and account-level snapshots with NZD/USD/CNY API display)
- Dedicated data-sync monitor (implemented: FX, price, and log tabs with filters and offset pagination)
- Settings user preferences (implemented: report default currency backed by profiles, theme placeholder)

## Stage 5: Tax-Assist and Reports

- Tax notes
- Tax-year summaries
- CSV export
- Report generation

## Stage 6: Deployment Hardening and Backup/Export

- S3 deployment
- API Gateway/Lambda deployment
- Secrets handling
- Backup/export
- Monitoring/logging

## Stage 7: Reporting Currency Selector and Charts

- Dashboard reporting currency selector (implemented: `NZD`, `USD`, and `CNY`)
- Holdings reporting currency selector and filters (implemented: account, asset type/cash, and currency filters with valued totals)
- Dashboard asset trend chart (implemented: uses portfolio snapshots)
- Dashboard account allocation chart (implemented: uses latest available portfolio snapshot)
