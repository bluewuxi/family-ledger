# Data Model

`family-ledger` is a single-family shared ledger. Core business data is shared by the family, not owned by individual users.

Users are accessors/operators only. User-specific tables are limited to:

- `profiles`: Supabase Auth user profile data.
- `user_roles`: active `viewer` / `admin` access role.

Business tables do not use `user_id` as an ownership field. Where useful, they use audit fields only:

- `created_by_user_id`
- `updated_by_user_id`

## Shared Business Tables

- `investment_accounts`: shared brokerage, fund platform, bank, retirement, and other accounts.
- `instruments`: shared instrument/security/fund master list.
- `transactions`: shared investment transaction records.
- `prices`: shared historical prices for instruments.
- `fx_rates`: shared FX rates.
- `portfolio_snapshots`: shared daily family portfolio snapshots.

## Instruments

`asset_type` is a classification field, not a separate table in Stage 1.

`market_region` distinguishes broad regions such as `US`, `HK`, `CN`, `NZ`, `AU`, `MULTI`, and `OTHER`.

`exchange` distinguishes venues or platform-specific sources such as `NASDAQ`, `NYSE_ARCA`, `HKEX`, `SSE`, `SZSE`, `INVESTNOW`, and `CASH`.

Price source fields are configuration for future scheduled price jobs:

- `description`
- `price_source`
- `price_source_symbol`
- `price_source_exchange`
- `price_update_enabled`
- `price_update_priority`
- `source_url`
- `source_checked_at`

Actual latest-close-price fetching is not implemented in this task.

## Seeded Instruments

Initial seed data under `supabase/seed/001_seed_instruments.sql` populates the shared instrument master list only. It includes metadata such as market region, exchange, currency, asset type, price-source configuration, source URL, and source verification timestamp.

The seed is idempotent using the stable identity `market_region + exchange + symbol`.

Seeded instruments:

- AMD
- QQQM
- VGT
- SMH
- 01810
- 00700
- 161128
- 159501
- 513500
- FS_NASDAQ_100
- FS_TOTAL_WORLD
- FS_US_500

Seed data does not include transactions, holdings, current prices, FX rates, or portfolio snapshots.

## Financial Values

PostgreSQL `numeric` is used for persisted money, quantity, price, FX rate, and percentage values. Float/double types are not used for authoritative financial values.

## Integrity

The schema uses UUID primary keys, `created_at`, `updated_at`, check constraints for enum-like values, useful indexes, and natural uniqueness:

- prices: unique by `instrument_id, price_date`
- FX rates: unique by `from_currency, to_currency, rate_date`
- portfolio snapshots: unique by `snapshot_date`

Tax-specific tables are intentionally deferred until tax-assist requirements are clearer.

## RLS

RLS is enabled as a defensive layer.

- Active `viewer` or `admin` users can read shared business tables.
- Active `admin` users can write shared business tables.
- Lambda API remains the primary business authorization layer.
- Frontend must not write business tables directly.
