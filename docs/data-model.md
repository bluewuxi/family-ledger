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
- `currencies`: supported currency reference data.
- `instrument_prices`: shared provider-supplied historical prices for instruments.
- `exchange_rates`: shared provider-supplied FX rates for valuation and future tax-assist separation.
- `job_runs`: scheduled/batch job execution audit records.
- `data_provider_runs`: per-provider audit records under a job run.
- `portfolio_snapshots`: shared daily family portfolio valuation snapshots.
- `portfolio_account_snapshots`: per-account rows under each daily portfolio snapshot.

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

Latest close price fetching is implemented for the configured scheduled providers, while manual price sources remain configuration-only.

Instrument master records are maintained through the Lambda API. For asset types other than `other`, `symbol` and `exchange` are required. If an instrument has transaction records or stored price history, it is retained and cannot be hard-deleted through the API.

## Transactions

Transactions are entered through the Lambda API and always reference an account and an instrument. Transaction currency must match the selected instrument currency.

- `opening_position` references a non-cash instrument and stores the starting quantity plus total carrying cost in `gross_amount`.
- `opening_balance` references a cash instrument and stores the starting cash balance in `gross_amount`.
- `buy` and `sell` reference non-cash instruments. Their `gross_amount` is calculated in the API as `quantity * price`, rounded half-up to six decimal places.
- `dividend` references the paying non-cash instrument and may record withholding in `tax`.
- `deposit`, `withdrawal`, `interest`, `fee`, `tax`, and `adjustment` reference currency-matching cash instruments.
- Standalone `fee` records store their value in `fee`; standalone `tax` records store their value in `tax`.
- `adjustment` records store a non-negative `gross_amount` and use `adjustment_direction` (`increase` or `decrease`) to describe direction.
- Transaction records do not store manual FX rates. Valuation uses stored provider rates from `exchange_rates`; missing valuation FX should be fixed through market-data retrieval rather than transaction entry.

## Market Data Foundation

The canonical valuation currency for stored market data is USD.

`exchange_rates` stores provider-supplied calendar-date rates as:

```text
1 from_currency = rate USD
```

Examples:

- `USD -> USD = 1`
- `NZD -> USD = 0.61`
- `CNY -> USD = 0.138`
- `HKD -> USD = 0.128`

Valuation FX records use `rate_type = 'valuation'` and must target `USD`. Tax-specific FX handling remains separate through `rate_type = 'tax'` or a future dedicated table.

`instrument_prices` stores provider-supplied calendar-date instrument close prices in the instrument price currency. `price_date` and `rate_date` are provider-supplied dates. `fetched_at`, `job_started_at`, and `job_finished_at` are UTC timestamps and must not be treated as the provider price/rate date.

The Stage 4 FundRock price job stores public Foundation Series PIE `Unit Price` values as NZD instrument prices for the seeded `FS_NASDAQ_100`, `FS_TOTAL_WORLD`, and `FS_US_500` instruments. It does not store FundRock buy price, sell price, NAV, transaction spreads, fees, distributions, or historical backfills.

The stock/ETF price job also ingests best-effort latest daily prices for the seeded enabled instruments:

- `yahoo_finance`: seeded US/HK stocks and ETFs (`AMD`, `QQQM`, `VGT`, `SMH`, `1810.HK`, `0700.HK`).
- `eastmoney`: seeded China-listed ETFs/funds (`161128`, `159501`, `513500`).

These providers are treated as unofficial market-data sources for a small family ledger. They do not introduce API keys or paid provider secrets. Provider responses are validated before insert, and failures are recorded in `data_provider_runs`, but this is not a guaranteed market-data feed or historical backfill pipeline.

`job_runs` and `data_provider_runs` only track ingestion attempts and counts. They are audit records for completed or attempted jobs and are not themselves valuation snapshots.

`job_runs.trigger_source` records whether an attempt came from an EventBridge schedule (`schedule`) or an admin-triggered web action (`manual`). Manual runs may also include `triggered_by_user_id` and `trigger_request_id` so the Settings UI can correlate a submitted retrieval request with later audit rows.

## Derived Holdings

Holdings are a read-only derived view calculated by the Lambda API from transaction history, grouped by account and instrument. No separate holdings table is introduced.

- Security quantities and remaining carrying cost use weighted average cost in the instrument currency.
- Opening positions add starting quantity and carrying cost before later buys and sells are applied.
- Buys add `gross_amount + fee + tax` to carrying cost; sells remove units at the prior average unit cost. Sell-side fees and taxes are not included in remaining carrying cost.
- Dividends do not change security quantity or carrying cost.
- Cash balances use only transactions explicitly linked to cash instruments: opening balances, deposits, and interest increase balance; withdrawals, fees, and taxes reduce balance; adjustments use their recorded direction.
- A security trade does not implicitly update a cash instrument balance.
- Final zero positions are omitted.
- A negative cash balance is returned with `NEGATIVE_POSITION`.
- A security position that becomes negative is returned with `NEGATIVE_POSITION` and `COST_BASIS_UNAVAILABLE`, and its average cost and remaining cost are null.

Holding rows report native-currency quantity and carrying cost, plus optional valuation fields in a requested reporting currency (`NZD`, `USD`, or `CNY`). Row market value uses stored instrument prices and USD-centered valuation FX rates. Row unrealized gain applies only to non-cash holdings with available carrying cost.

## Dashboard Summary Valuation

The current read-only dashboard summary values current non-zero holdings without persisting a derived dashboard record. Dashboard valuation is USD-centered internally and is displayed in the selected reporting currency: `NZD`, `USD`, or `CNY`.

- Securities use the latest stored `instrument_prices` record in the instrument currency; daily movement uses the preceding stored close.
- Cash uses its derived cash balance and has zero daily price movement.
- Stored FX rates are USD-centered in `exchange_rates`. The dashboard converts each holding currency to USD, then converts aggregate monetary values to the requested reporting currency using the latest valuation FX rates.
- The same latest FX rate converts current values, preceding-close values, and remaining carrying costs, so daily movement represents stored close-price changes only.
- Unrealized gain is market value less remaining carrying cost for securities only.

The summary and valued holdings response return unavailable (`null`) monetary fields rather than incomplete totals when required stored price, FX, or cost-basis information is absent. Price and FX records may be loaded outside the app in this stage.

## Portfolio Valuation Snapshots

Portfolio snapshots are durable daily valuation records generated by scheduled jobs or manual EventBridge backfills.

- `portfolio_snapshots` stores one family-level aggregate row per `snapshot_date`.
- `portfolio_account_snapshots` stores one row per account for the same snapshot date.
- Snapshot valuation is canonicalized in USD because market data storage is USD-centered.
- Each snapshot stores `usd_to_nzd_rate` and `usd_to_cny_rate` used at generation time so historical display values remain stable when later FX data changes.
- API reads can display stored USD canonical amounts as `USD`, `NZD`, or `CNY`.

Snapshot generation uses as-of data:

- Transactions with `trade_date <= snapshot_date`.
- Latest instrument price where `price_date <= snapshot_date`.
- Previous instrument close before that latest price date for daily movement.
- Latest valuation FX where `rate_date <= snapshot_date`.

Missing latest price or required FX makes affected aggregate market-value fields unavailable (`null`) rather than partial. Missing previous price only makes daily-change fields unavailable. Unavailable cost basis only makes cost and unrealized-gain fields unavailable.

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

The three seeded Foundation Series PIE instruments are configured for the FundRock unit price job through `price_source = 'custom'`, enabled price updates, and stable `price_source_symbol` values. Seed data does not include transactions, current prices, FX rates, or portfolio snapshots. Holdings are calculated from transactions rather than seeded or persisted separately; dashboard values require separately stored price and FX records.

## Financial Values

PostgreSQL `numeric` is used for persisted money, quantity, price, FX rate, and percentage values. Float/double types are not used for authoritative financial values.

## Integrity

The schema uses UUID primary keys, `created_at`, `updated_at`, check constraints for enum-like values, useful indexes, and natural uniqueness:

- instruments: unique by `market_region, exchange, symbol`
- instrument prices: unique by `instrument_id, provider, price_date`
- exchange rates: unique by `from_currency, to_currency, rate_type, provider, rate_date`
- valuation exchange rates: constrained to `to_currency = 'USD'`
- portfolio snapshots: unique by `snapshot_date`
- portfolio account snapshots: unique by `snapshot_date, account_id`
- adjustments: `adjustment_direction` is required only for adjustment transactions
- opening entries: `opening_position` and `opening_balance` are stored in transaction history, not in a separate starting-holdings table

Tax-specific tables are intentionally deferred until tax-assist requirements are clearer.

## RLS

RLS is enabled as a defensive layer.

- Active `viewer` or `admin` users can read shared business tables.
- Active `admin` users can write shared business tables.
- Lambda API remains the primary business authorization layer.
- Frontend must not write business tables directly.
