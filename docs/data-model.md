# Data Model

`小家大财` / `Family Ledger` is a single-family shared ledger. Core business data is shared by the family, not owned by individual users.

Users are accessors/operators only. User-specific tables are limited to:

- `profiles`: Supabase Auth user profile data.
- `user_roles`: active `viewer` / `admin` access role.

New profile rows default to `preferred_currency = 'CNY'`, `gain_color_scheme = 'red_positive'`, and `ui_theme = 'light'`. Existing saved preferences are not rewritten when defaults change.

Business tables do not use `user_id` as an ownership field. Where useful, they use audit fields only:

- `created_by_user_id`
- `updated_by_user_id`

## Shared Business Tables

- `investment_accounts`: shared brokerage, fund platform, bank, retirement, and other accounts. It includes non-confidential `trading_info` for app installation, login entry, and operational notes.
- `instruments`: shared instrument/security/fund master list.
- `transactions`: shared investment transaction records.
- `currencies`: supported currency reference data.
- `instrument_prices`: shared provider-supplied historical prices for instruments.
- `exchange_rates`: shared provider-supplied FX rates for valuation and future tax-assist separation.
- `job_runs`: scheduled/batch job execution audit records.
- `data_provider_runs`: per-provider audit records under a job run.
- `portfolio_snapshots`: shared daily family portfolio valuation snapshots.
- `portfolio_account_snapshots`: per-account rows under each daily portfolio snapshot.

Scheduled ledger backups export these public app tables only through the allowlisted `public.export_ledger_backup()` database RPC, which reads all backup tables in one PostgreSQL statement snapshot. The backup deliberately excludes Supabase Auth internals, frontend assets, AWS/SSM secrets, and decrypted trading account passwords. Restoring into a fresh Supabase project therefore requires recreating Auth users first or remapping user-linked rows such as `profiles`, `user_roles`, and audit user ids.

Trading account passwords are not stored in Postgres. Each account has one SSM SecureString parameter named from the deployment prefix plus the account id. New accounts receive the placeholder value `尚未设置交易密码`; deleting an account also deletes its SSM password parameter after the API confirms the account has no transactions.

## Instruments

`asset_type` is a classification field, not a separate table in Stage 1.

`market_region` distinguishes broad regions such as `US`, `HK`, `CN`, `NZ`, `AU`, `MULTI`, and `OTHER`.

`exchange` distinguishes venues or platform-specific sources such as `NASDAQ`, `NYSE_ARCA`, `HKEX`, `SSE`, `SZSE`, `INVESTNOW`, and `CASH`.

Price source fields configure scheduled price ingestion, dashboard quote lookup, and display metadata:

- `short_name`
- `description`
- `price_source`
- `price_source_symbol`
- `price_source_exchange`
- `price_update_enabled`
- `price_update_priority`
- `source_url`
- `source_checked_at`

Latest close price fetching is implemented for the configured scheduled providers, while manual price sources remain configuration-only.

Instrument master records are maintained through the Lambda API. `name` remains the full legal/provider-facing name; `short_name` is the compact display label used in dense tables and dashboard activity cards. `short_name` is required, nonblank, and limited to 32 characters. For asset types other than `other`, `symbol` and `exchange` are required. If an instrument has transaction records or stored price history, it is retained and cannot be hard-deleted through the API.

## Transactions

Transactions are entered through the Lambda API and always reference an account and an instrument. Transaction currency must match the selected instrument currency.

- `opening_position` references a non-cash instrument and stores the starting quantity plus total carrying cost in `gross_amount`.
- `opening_balance` references a cash instrument and stores the starting cash balance in `gross_amount`.
- `buy` and `sell` reference non-cash instruments. Their `gross_amount` is calculated in the API as `quantity * price`, rounded half-up to six decimal places.
- `buy` and `sell` automatically create or update a generated linked cash transaction in the account base currency. A buy creates a cash `withdrawal`; a sell creates a cash `deposit`.
- `dividend` references the paying non-cash instrument and may record withholding in `tax`.
- `deposit`, `withdrawal`, `interest`, `fee`, `tax`, and `adjustment` reference currency-matching cash instruments.
- Standalone `fee` records store their value in `fee`; standalone `tax` records store their value in `tax`.
- `adjustment` records store a non-negative `gross_amount` and use `adjustment_direction` (`increase` or `decrease`) to describe direction.
- Generated cash legs are marked with `transaction_source = 'generated_cash_leg'` and `linked_transaction_id` pointing to the parent trade. They cannot be edited or deleted directly through the API.
- Parent buy/sell rows store the derived `settlement_currency` and `settlement_amount` for display and audit. The settlement currency defaults to the account `base_currency`.
- Transaction records do not store manual FX rates. Buy/sell settlement cash amounts use the latest stored valuation FX from `exchange_rates` on or before the trade date; missing settlement FX rejects the write request.

## Market Data Foundation

The canonical valuation currency for stored market data is USD.

`exchange_rates` stores provider-supplied calendar-date rates as:

```text
1 from_currency = rate USD
```

Examples:

- `NZD -> USD = 0.61`
- `CNY -> USD = 0.138`
- `HKD -> USD = 0.128`

Valuation FX records use `rate_type = 'valuation'` and must target `USD`. Tax-specific FX handling remains separate through `rate_type = 'tax'` or a future dedicated table.

The FX job derives provider target currencies from distinct account base currencies and instrument currencies, skips `USD` provider requests, and no longer persists `USD -> USD` rows. USD is treated as rate `1` inside valuation code only. The job can also fetch a provider rate for a supplied historical `rateDate`; otherwise it retrieves the latest available provider rate date.

`instrument_prices` stores provider-supplied calendar-date instrument close prices or published unit prices in the instrument price currency. `price_date` and `rate_date` are provider-supplied dates. `fetched_at`, `job_started_at`, and `job_finished_at` are UTC timestamps and must not be treated as the provider price/rate date.

The Stage 4 FundRock price job stores public Foundation Series PIE `Unit Price` values as NZD instrument prices for the seeded `FS_NASDAQ_100`, `FS_TOTAL_WORLD`, and `FS_US_500` instruments. It does not store FundRock buy price, sell price, NAV, transaction spreads, fees, distributions, or historical backfills. FundRock unit prices may lag by multiple days; one provider day behind the snapshot date is expected when the main batch runs before the NZ evening publication window. Snapshots use the latest published unit price available and must keep the provider-supplied `price_date`.

The stock/ETF price job also ingests best-effort latest daily prices for the seeded enabled instruments:

- `yahoo_finance`: seeded US/HK stocks and ETFs (`AMD`, `QQQM`, `VOO`, `VGT`, `SMH`, `1810.HK`, `0700.HK`).
- `eastmoney`: seeded China-listed ETFs/funds (`161128`, `159501`, `513500`).

These providers are treated as unofficial market-data sources for a small family ledger. They do not introduce API keys or paid provider secrets. Provider responses are validated before insert, and failures are recorded in `data_provider_runs`, but this is not a guaranteed market-data feed or historical backfill pipeline.

Scheduled price ingestion skips same-day stock/ETF prices fetched before the relevant exchange close-confirmation cutoff, so `instrument_prices` does not persist live intraday quotes as historical closes. Dashboard-only live or delayed quotes remain in `dashboard_instrument_quotes`.

`job_runs` and `data_provider_runs` only track ingestion attempts and counts. They are audit records for completed or attempted jobs and are not themselves valuation snapshots.

`job_runs.trigger_source` records whether an attempt came from an EventBridge schedule (`schedule`) or an admin-triggered web action (`manual`). Manual runs may also include `triggered_by_user_id` and `trigger_request_id` so the Data Sync UI can correlate a submitted retrieval request with later audit rows.

## Derived Holdings

Holdings are a read-only derived view calculated by the Lambda API from transaction history, grouped by account and instrument. No separate holdings table is introduced.

- Security quantities and native remaining carrying cost use weighted average cost in the instrument currency.
- When historical valuation FX is available, holdings also carry a USD cost basis derived from buy settlement cash amounts or transaction-date native carrying cost. This USD cost basis is reduced on sells with the same weighted-average method and is used for reporting-currency unrealized gain so cost does not move with later FX rates.
- Opening positions add starting quantity and carrying cost before later buys and sells are applied.
- Buys add `gross_amount + fee + tax` to carrying cost; sells remove units at the prior average unit cost. Sell-side fees and taxes are not included in remaining carrying cost.
- Dividends do not change security quantity or carrying cost.
- Cash balances use transactions linked to cash instruments: opening balances, deposits, generated sell cash legs, and interest increase balance; withdrawals, generated buy cash legs, fees, and taxes reduce balance; adjustments use their recorded direction.
- A security buy/sell automatically creates the matching linked cash transaction; other cash movements remain explicit cash transactions.
- Final zero positions are omitted.
- A negative cash balance is returned with `NEGATIVE_POSITION`.
- A security position that becomes negative is returned with `NEGATIVE_POSITION` and `COST_BASIS_UNAVAILABLE`, and its average cost and remaining cost are null.

Holding rows report native-currency quantity and carrying cost, plus optional valuation fields in a requested reporting currency (`NZD`, `USD`, or `CNY`). Row market value uses stored instrument prices and USD-centered valuation FX rates. Row unrealized gain applies only to non-cash holdings with available carrying cost; the web UI labels this value as `动态盈亏`.

## Dashboard Summary Valuation

The current read-only dashboard summary values current non-zero holdings without persisting a derived dashboard record. Dashboard valuation is USD-centered internally and is displayed in the selected reporting currency: `NZD`, `USD`, or `CNY`.

- `dashboard_instrument_quotes` stores the latest dashboard-only delayed quote cache per instrument and provider. It is refreshed by `GET /dashboard` when older than five minutes; stale rows that cannot be refreshed are ignored for dashboard valuation so newer stored closes can be used instead.
- Securities use the dashboard quote cache for current dashboard valuation when available; daily movement compares that quote with the latest stored market close before the quote date, or the latest stored close as a display baseline when no earlier close exists.
- Historical snapshots and data maintenance query pages continue to use stored `instrument_prices` close records, not dashboard quote cache rows.
- Cash uses its derived cash balance and has zero daily price movement.
- Stored FX rates are USD-centered in `exchange_rates`. The dashboard converts each holding currency to USD, then converts aggregate monetary values to the requested reporting currency using the latest valuation FX rates.
- `todayChange` / latest movement is price movement on current holdings: current quantity times current/latest price minus current quantity times the preceding stored price. The UI labels it `行情变动`. It is not cash-flow-adjusted portfolio daily P&L and not a persisted snapshot change, so buys and sells on the same business date can affect the movement base.
- Unrealized gain is market value less transaction-date USD cost basis for securities only, converted to the requested reporting currency for display.
- Dashboard `allocations` are account-plus-cash rows for `账户分布`; `holdingAllocations` are instrument-plus-cash rows for `持仓分布`.
- `holdingAllocations` aggregate the same non-cash instrument across all accounts and combine all cash currencies into one `现金` row. Unavailable row market values make the aggregate value and percentage unavailable. Percentages are omitted when total assets are unavailable or zero.
- `dailyTradeCount` uses the current app business date and counts only buy/sell security transactions, excluding generated cash legs.

The summary and valued holdings response return unavailable (`null`) monetary fields rather than incomplete totals when required quote/price, FX, or cost-basis information is absent. Price and FX records are normally maintained by scheduled jobs or admin-triggered data maintenance retrievals; trusted operators may still load or repair records outside the app when needed.

## Portfolio Valuation Snapshots

Portfolio snapshots are durable but repairable daily valuation records generated by scheduled jobs or manual backfills. The app business day uses a `06:00 Asia/Shanghai` cutoff so snapshot dates are stable across viewer time zones and before China/Hong Kong markets open. Scheduled snapshot generation writes the most recently completed business date, so a default `06:30 Asia/Shanghai` run on `2026-06-16` writes snapshot date `2026-06-15`, not `2026-06-16`.

- `portfolio_snapshots` stores one family-level aggregate row per `snapshot_date`.
- `portfolio_account_snapshots` stores one row per account for the same snapshot date.
- Snapshot valuation is canonicalized in USD because market data storage is USD-centered.
- Each snapshot stores `usd_to_nzd_rate` and `usd_to_cny_rate` used at generation time so historical display values remain stable when later FX data changes.
- API reads can display stored USD canonical amounts as `USD`, `NZD`, or `CNY`.
- Dashboard recent-snapshot activity compares each row's displayed `marketValue` with the previous persisted snapshot's displayed `marketValue` in the selected display currency. It does not use `dailyChange` or `dailyChangePct`, because those fields describe latest-price movement versus previous price inside a single snapshot valuation. Weekend or holiday snapshots are shown if they exist; changes may be zero or may reflect FX, cash, or other input changes.
- Dashboard trend charts can request trend points from the snapshot API. Portfolio value normally uses every stored daily snapshot in the selected range. For long ranges of two years or more (`近3年`, `近5年`, or `投资以来`), the API thins portfolio points to weekly targets aligned to the current app business date; non-trading targets use the latest previous snapshot while keeping the target date as the chart label. The dashboard profit chart reuses the same trend points and plots `资产净值 - 总投入` as the profit value curve.
- The dashboard `总投入` line is derived from manual principal events only: `期初持仓`, `期初余额`, `入金`, and `出金`. Generated buy/sell cash legs, dividends, interest, fees, tax, and adjustments are excluded. Principal is converted with exact trade-date valuation FX into the selected display currency; missing FX is a data quality issue and makes the principal line and `累计收益` unavailable until fixed.
- The expected historical series includes every stored market-data price date on or after the first transaction date where required NZD and CNY valuation FX is available, plus existing snapshot dates. Operator repair may insert missing expected dates and rewrite mismatched derived values.

Snapshot generation uses as-of data:

- Transactions with `trade_date <= snapshot_date`.
- Latest instrument price where `price_date <= snapshot_date`.
- Previous instrument close before that latest price date for latest-price movement.
- Latest valuation FX where `rate_date <= snapshot_date`, plus historical valuation FX needed to derive transaction-date USD cost basis.
- If multiple price or FX providers have records on the selected date, valuation picks one deterministic provider record for that date, preferring `manual` records and then provider name order.
- Dashboard quote cache rows are never used for snapshot valuation or repair.

For NZ PIE/FundRock instruments, an older latest unit price is an accepted provider lag unless there is no usable historical price at all. Snapshot warnings should not classify the normal Foundation Series publication lag as a missing or stale price.

Missing latest price or required FX makes affected aggregate market-value fields unavailable (`null`) rather than partial. Missing previous price only makes daily-change fields unavailable. Unavailable cost basis only makes cost and unrealized-gain fields unavailable.

When a valuation-impacting transaction is created, updated, or deleted through the API, existing snapshots with `snapshot_date` on or after the affected trade date are recalculated and upserted. If a transaction update changes trade date, recalculation starts from the earlier old/new trade date.

## Monthly Family Review

The monthly family review is a derived, read-only API/UI view. It does not store monthly report rows, saved notes, generated files, or approval state in V1.

The report reuses stored portfolio snapshots for month-start and month-end values, manual principal transactions for net invested cash, manual cash adjustments for month-end reconciliation, and dividend transactions as separate investment-income context. Buy/sell generated cash legs are shown only as linked settlement context under their parent trade.

Account changes compare account snapshot rows from the selected start and end snapshots. A missing account row on one side is displayed as zero so accounts opened or closed during the month remain explainable. Rows with unavailable snapshot values remain unavailable and surface data-quality warnings rather than partial values.

## Seeded Instruments

Initial seed data under `supabase/seed/001_seed_instruments.sql` populates the shared instrument master list only. It includes metadata such as short display name, market region, exchange, currency, asset type, price-source configuration, source URL, and source verification timestamp.

The seed is idempotent using the stable identity `market_region + exchange + symbol`.

Seeded instruments:

- AMD
- QQQM
- VOO
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
