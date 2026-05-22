# Data Model

The first real schema migration will be implemented in a later task. Planned tables:

- `profiles`: app-facing user profile data linked to Supabase Auth users.
- `user_roles`: simple `viewer` / `admin` application permissions.
- `investment_accounts`: brokerage, fund platform, bank, retirement, and other accounts.
- `instruments`: stocks, ETFs, PIE funds, mutual funds, cash, bonds, and other assets.
- `transactions`: buys, sells, dividends, fees, taxes, deposits, withdrawals, interest, and adjustments.
- `prices`: historical instrument prices.
- `fx_rates`: historical exchange rates.
- `portfolio_snapshots`: derived portfolio values by date.

## Financial Values

PostgreSQL `numeric` should be used for persisted money, quantity, price, FX rate, and tax-related values. Do not use float/double as authoritative persisted financial values.

UUID primary keys, `created_at`, `updated_at`, check constraints for enum-like values, foreign keys, useful indexes, and natural unique constraints should be added where appropriate.

Tax-specific tables are intentionally deferred until tax-assist requirements are clearer.
