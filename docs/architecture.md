# Architecture

Account purpose is a current attribute, with exactly one purpose per account. Investment dashboard services filter accounts and transactions before valuation and historical aggregation. Account management and family reports cover all purposes.

Snapshot persistence consists of headers (identity, date, historical FX and metadata) and account rows. The final `portfolio_snapshots` relation is an invoker-security all-account view. The staged test rollout completed on 2026-09-23: synchronized headers and `portfolio_snapshots_v` first coexisted with the original table, then a separately verified transaction performed cutover. Snapshot generation and repairs keep the same atomic writer RPC. Backup format version 5 adds Kernel anchors and estimated-price metadata while preserving validated normalization for version 2 through version 4 files. Version-1 restore compatibility is outside operational scope. Production has not been deployed.

`金财屋` / `Family Ledger` uses a serverless architecture:

```text
CloudFront + private S3 static assets
  -> API Gateway
  -> Lambda API
  -> Supabase Postgres

EventBridge Scheduler
  -> Lambda scheduled jobs
  -> Supabase Postgres
```

## Components

- `apps/web`: React + TypeScript + Vite frontend hosted as private S3 static assets behind CloudFront for HTTPS and custom domains.
- `apps/api`: Lambda API behind API Gateway.
- `apps/jobs`: EventBridge-triggered Lambda jobs.
- `packages/shared`: shared TypeScript types and constants.
- `supabase/migrations`: Supabase schema migrations.

## Boundaries

The frontend uses Supabase only for Auth: login, session reading, and access token acquisition. Business data access goes through the Lambda API.

The Lambda API verifies the Supabase access token, loads the current user role from `user_roles`, enforces `viewer` / `admin` permissions, and uses a server-side Supabase client for trusted database access.

The family ledger data is shared. Core business tables do not have per-user ownership; user references on business records are audit fields only.

API and jobs resolve sensitive server-side values from AWS SSM Parameter Store. Decrypted values must stay in backend runtime memory and must never be exposed to frontend code.

Jobs use trusted server-side Supabase access and run as Lambda functions triggered by EventBridge Scheduler. Price update jobs use `instruments.price_source` configuration. A code-backed market-data source registry describes only implemented sources: Frankfurter, Yahoo Finance, Eastmoney, FundRock, and the Kernel estimate source. It provides stable source keys, canonical run-log names, capabilities, acquisition methods, configuration types, and supported instrument filters without introducing a generic editable provider table.

Kernel S&P 500 (Unhedged) pricing uses an anchored estimate because the observed Kernel unit-price action is available only through authenticated Next.js server actions. The scheduled job never stores or replays Kernel credentials, cookies, or authenticated responses. Administrators periodically save an exact Kernel unit-price anchor using Kernel's US-market valuation date. The API pairs that date with the corresponding later `USF.NZ` NZX-session raw open, then rebuilds estimates from subsequent confirmed opens. This offset is intentional: a Kernel date reflects the US close that occurs during the following New Zealand morning. Generated prices retain the Kernel/global valuation date derived from each later proxy session rather than adopting the NZX session date. Official USF NTAs corroborate this alignment but are not fetched automatically because the public NZX feed is undocumented and automated-use licensing has not been established. The database function writes the anchor, exact anchor price, estimate replacement, and first-anchor enablement atomically. Snapshot recalculation is resumable and follows the atomic market-data write.

The ledger backup job is also a trusted scheduled Lambda. It exports allowlisted public app tables through a database RPC so the backup reads one PostgreSQL statement snapshot, writes the gzipped payload to a private encrypted S3 backup bucket after batch jobs normally complete, and refuses to run while recent known market-data or snapshot batch jobs are still marked `started`. The web app exposes backup status through the data maintenance page only as sanitized job status fields, not raw backup payloads or S3 object metadata.

There is no always-on backend server. Lambda API is the primary business authorization layer, Supabase RLS is defensive, and the frontend must not write investment business tables directly.
