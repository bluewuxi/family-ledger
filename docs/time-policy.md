# Date and Time Policy

This document owns cross-layer date/time conventions for API, jobs, shared calculations, and UI defaults/display. Persistence-specific market-data and snapshot behavior belongs in the [data model](data-model.md#market-data-foundation); Scheduler configuration and event context belong in [deployment](deployment.md#scheduled-jobs).

## Instants and calendar dates

- Store instants as UTC ISO strings / PostgreSQL `timestamptz`. Never store viewer-local formatted timestamps as data.
- Store dates without a time as PostgreSQL `date` / `YYYY-MM-DD` strings, including `trade_date`, `settlement_date`, `price_date`, `rate_date`, and `snapshot_date`.
- Display human timestamps in the viewer's local time zone and make that clear in UI text where ambiguity matters. This display preference does not change persisted dates or portfolio business-day calculations.

## App business dates

Portfolio business-day logic is global, not viewer-local: use `Asia/Shanghai` with a `06:00` cutoff through shared helpers such as `getAppBusinessDate` in `packages/shared`.

Use shared time helpers for app business dates and UI date defaults. Avoid ad hoc `new Date().toISOString().slice(0, 10)`, which yields a UTC calendar date rather than the app business date.

Scheduled snapshot defaults must derive from scheduled time, not Lambda execution/retry time. The completed snapshot-date convention is defined in [Portfolio Valuation Snapshots](data-model.md#portfolio-valuation-snapshots); the required timezone-aware Scheduler settings and `<aws.scheduler.scheduled-time>` payload are defined in [Scheduled Jobs](deployment.md#scheduled-jobs).

## Provider dates

Market-data dates (`price_date`, `rate_date`, and quote dates) are provider/exchange dates. Do not derive them from viewer-local time or confuse acquisition timestamps with the provider date.

See [Market Data Foundation](data-model.md#market-data-foundation) for confirmed closes, published unit prices, explicit estimates, live quote caches, and expected FundRock publication lag. See [investment overview](specs/investment-overview.md#dashboard-composition-and-trends) and the [Dashboard Read API](api.md#dashboard-read-api) for daily-change eligibility and exchange-session mapping. A usable valuation price does not automatically qualify as current-day movement.

## Verification

When adding date/time behavior, document new semantics and update focused verification such as `corepack pnpm verify:time-policy`. Run the other affected checks listed in [local testing](local-testing.md#validation), including snapshot/trend checks when applicable. Changing an existing business-date contract requires explicit user authorization under [Project Workflow](project-workflow.md#superpowers-compatibility).
