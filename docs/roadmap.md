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

- Holdings calculation (implemented: native-currency quantity, cash balance, and average-cost carrying value)
- Portfolio summary (implemented: four NZD dashboard cards from stored prices and FX rates)
- Account summary (pending)
- Market and currency allocation (pending)

## Stage 4: Prices, FX, and Scheduled Jobs

- USD-centered price/FX storage foundation (implemented: currencies, exchange rates, instrument prices, job/provider run audit tables)
- Frankfurter FX maintenance handler (implemented: scheduled Lambda handler calls ingestion service, logs structured EventBridge context, and relies on retry-safe inserts)
- FundRock PIE unit price maintenance handler (implemented: scheduled Lambda handler ingests latest public FundRock unit prices for seeded Foundation Series PIE funds)
- Scheduled execution policy (implemented in docs: daily 01:00 UTC with EventBridge retry attempts `2` and maximum event age `1 hour`; AWS resources not deployed yet)
- Retry/job logging hardening (implemented for FX ingestion with durable job/provider run status and best-effort failure finalization)
- Additional price maintenance and automated instrument price updates
- Price-source adapters for `yahoo_finance` and `eastmoney`
- EventBridge jobs for prices and snapshots
- Portfolio snapshots

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
