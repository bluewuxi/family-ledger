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

- Price/FX maintenance and automated record updates
- Price-source adapters for `yahoo_finance`, `eastmoney`, and `investnow_manual`
- EventBridge jobs
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
