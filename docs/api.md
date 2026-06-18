# API

The Lambda API returns a consistent JSON shape.

Success:

```json
{
  "success": true,
  "data": {}
}
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

Stable error codes:

- `UNAUTHORIZED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `INTERNAL_ERROR`

## Public

- `GET /health`

## Viewer/Admin Read

These endpoints require a valid Supabase Bearer token and an active `viewer` or `admin` role:

- `GET /me`
- `GET /dashboard`
- `GET /holdings`
- `GET /holdings/detail`
- `GET /accounts`
- `POST /accounts/:id/trading-password/reveal`
- `GET /instruments`
- `GET /transactions`
- `GET /portfolio-snapshots`
- `GET /reports/monthly-summary`
- `GET /data-maintenance/fx-rates`
- `GET /data-maintenance/instrument-prices`
- `GET /data-maintenance/job-runs`
- `GET /data-maintenance/job-runs/:id/provider-runs`
- `GET /data-maintenance/backups`
- `GET /settings/preferences`
- `PATCH /settings/preferences`

## Admin User Management

These endpoints require a valid Supabase Bearer token and an active `admin` role:

- `GET /users`
- `GET /settings/trading-password-gate`
- `PATCH /users/:id`
- `PATCH /settings/trading-password-gate`

`GET /accounts` returns real account data from `investment_accounts`.
`GET /instruments` returns real instrument master data from `instruments`.
`GET /transactions` returns real ledger entries from `transactions`, ordered by trade date and creation time descending. It supports `from`, `to`, `accountId`, `instrumentId`, `transactionType`, comma-separated `transactionTypes`, `excludeGeneratedCashLegs=true|false`, `excludeCashInstruments=true|false`, `limit`, and `offset` query parameters. `transactionTypes=buy,sell` is a first-class filter and works with or without pagination. If both `transactionType` and `transactionTypes` are supplied, the single `transactionType` must be included in the list and narrows the result set. When pagination parameters are supplied, the response includes `pagination` metadata with `limit`, `offset`, and `hasMore`.
`GET /holdings` returns current calculated positions and cash balances derived from transaction history, with valuation fields in the requested reporting currency.
`GET /holdings/detail` returns one account/instrument holding detail, related transactions, dividend summary, linked buy/sell cash-leg context, and latest/previous price context.
`GET /dashboard` returns a four-card portfolio summary in the selected reporting currency, calculated from holdings and stored price/FX records.
`GET /portfolio-snapshots` returns durable daily valuation snapshots with account-level rows.
`GET /reports/monthly-summary` returns a monthly value bridge plus dividend and cash-calibration context.
Market data read endpoints return stored provider FX rates, instrument prices, and ingestion audit logs. They do not call external providers.

Response data:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "viewer"
  },
  "accounts": []
}
```

### Data Maintenance Read API

`GET /data-maintenance/fx-rates` supports `fromCurrency`, `toCurrency`, `from`, `to`, `provider`, `limit`, and `offset` filters. Existing stored `USD/USD` rows are not returned.

`GET /data-maintenance/instrument-prices` supports `instrumentId`, `from`, `to`, `provider`, `limit`, and `offset` filters.

`GET /data-maintenance/job-runs` supports `jobName`, `status`, `triggerSource`, `limit`, and `offset` filters. Use `GET /data-maintenance/job-runs/:id/provider-runs` to inspect per-provider results for a selected job run. Filtering by `jobName=backup-ledger-data` is applied in the API/repository query before pagination.

`GET /data-maintenance/backups` returns sanitized backup monitor rows for the UI plus a sanitized `backupSummary` with the latest backup run and latest successful backup run. The summary is calculated independently of pagination so the page header does not change when browsing older backup rows. The response includes only safe fields such as status, trigger source, start/end timestamps, duration, backed-up row count, and friendly failure reason. It does not expose S3 object keys, raw error messages, stack traces, environment details, secrets, or backup payload metadata.

Defaults:

- `limit`: `50`
- `offset`: `0`
- Maximum `limit`: `200`
- `from` and `to` must use `YYYY-MM-DD`

List responses include pagination metadata:

```json
{
  "fxRates": [],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

### Data Maintenance Retrieval API

`POST /data-maintenance/retrievals` is admin-only. It asynchronously invokes the existing market-data job Lambdas and returns `202`.

Request:

```json
{
  "kind": "exchange_rates",
  "rateDate": "2025-08-06"
}
```

Allowed `kind` values:

- `exchange_rates`
- `instrument_prices`
- `all`

The response includes a `triggerRequestId`. Actual inserted/skipped counts are recorded later in `job_runs` and `data_provider_runs`.

`rateDate` is optional and currently applies to FX retrieval. When omitted, the FX job retrieves the latest provider rate date.

### User Preferences API

`GET /settings/preferences` is available to authenticated `viewer` and `admin` users. It returns the current user preference view:

```json
{
  "preferences": {
    "preferredCurrency": "NZD",
    "gainColorScheme": "red_positive",
    "uiTheme": "light"
  }
}
```

`PATCH /settings/preferences` updates the current user's report default currency, gain/loss color convention, and UI theme. `preferredCurrency` must be `NZD`, `USD`, or `CNY`. `gainColorScheme` must be `red_positive` or `green_positive`. `uiTheme` must be `light` or `dark`; new profiles default to `light`.

### User Management API

These endpoints require a valid Supabase Bearer token and an active `admin` role:

- `GET /users`
- `PATCH /users/:id`

`GET /users` lists existing Supabase Auth users with their application role and active status. Users are created in the Supabase console, not through the app.

```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "role": "viewer",
      "isActive": true,
      "createdAt": "2026-05-28T00:00:00.000Z",
      "lastSignInAt": null
    }
  ]
}
```

`PATCH /users/:id` updates only access status and role:

```json
{
  "role": "admin",
  "isActive": true
}
```

The response returns the updated `managedUser`.

Setting `isActive` to `false` pauses application access while preserving the Supabase Auth user and audit history. Admins cannot change their own access from this endpoint.

### Dashboard Read API

`GET /dashboard?currency=NZD|USD|CNY` is available to authenticated `viewer` and `admin` users.

Defaults:

- `currency`: current user's `preferredCurrency`; new profiles default to `CNY`

It returns values in the selected reporting currency:

```json
{
  "dashboard": {
    "reportingCurrency": "USD",
    "totalAssets": "9240.67",
    "todayChange": "48.25",
    "todayChangePct": "0.32",
    "unrealizedGain": "1243.10",
    "dailyTradeCount": 2,
    "accountCount": 3,
    "allocations": [
      {
        "id": "account-id",
        "name": "IBKR",
        "marketValue": "7400.67",
        "allocationType": "account"
      },
      {
        "id": "cash",
        "name": "现金",
        "marketValue": "1840.00",
        "allocationType": "cash"
      }
    ],
    "holdingAllocations": [
      {
        "id": "instrument-id",
        "name": "VOO",
        "assetType": "etf",
        "marketValue": "6000.00",
        "percentageOfTotal": "64.93",
        "allocationType": "instrument"
      },
      {
        "id": "cash",
        "name": "现金",
        "assetType": "cash",
        "marketValue": "1840.00",
        "percentageOfTotal": "19.91",
        "allocationType": "cash"
      }
    ],
    "quoteFetchedAt": "2026-05-25T03:15:00.000Z",
    "quoteDate": "2026-05-24",
    "warnings": []
  }
}
```

The dashboard derives holdings through the existing holdings calculation and may refresh delayed quote cache rows during the request:

- Securities use a dashboard-only delayed quote cache for current-estimate valuation when available; cash uses its calculated cash balance.
- Dashboard quote cache rows are refreshed when older than five minutes and do not replace stored market-close `instrument_prices`. If a stale cache row cannot be refreshed, the dashboard ignores it and falls back to stored closes.
- Holdings are valued internally in USD using USD-centered valuation FX rates in `exchange_rates`, then converted to the requested reporting currency.
- `todayChange` is retained as the wire field name, but the UI labels it `行情变动`. It compares current quantity at the dashboard quote/latest stored price with the same current quantity at the preceding stored security close. It is latest-price movement on current holdings, not cash-flow-adjusted portfolio daily P&L and not a persisted snapshot change.
- Current market value and latest-price movement use latest valuation FX. Unrealized gain uses transaction-date USD cost basis when historical FX is available, so reported cost does not move with later FX rates.
- `unrealizedGain` applies only to non-cash holdings with available remaining cost basis.
- `dailyTradeCount` counts buy/sell transactions on the current app business date, excluding generated cash legs and cash instruments.
- `accountCount` includes accounts with no non-zero holdings.
- `allocations` drives the `账户分布` chart and contains account rows plus one combined cash row.
- `holdingAllocations` drives the `持仓分布` chart. It aggregates each non-cash instrument across accounts and combines all cash holdings into one `现金` row. If any row in an aggregate has unavailable `marketValue`, the aggregate `marketValue` and `percentageOfTotal` are `null`. Percentages are `null` when `totalAssets` is `null` or zero.
- `quoteFetchedAt` and `quoteDate` describe the newest dashboard quote cache row used in the response, or `null` when no dashboard quotes are available.

Aggregate totals are not reported as partial values. A missing latest price or required FX rate returns `null` for all affected monetary metrics. A missing preceding close returns `null` only for daily-change fields. Unavailable cost basis returns `null` only for unrealized gain. The `warnings` array identifies the affected instrument and one of `MISSING_LATEST_PRICE`, `MISSING_PREVIOUS_PRICE`, `MISSING_FX_RATE`, or `COST_BASIS_UNAVAILABLE`. Expected NZ PIE/FundRock publication lag is not itself a warning when an older published unit price exists with `price_date <=` the valuation date.

### Holdings Read API

`GET /holdings?currency=NZD|USD|CNY` is available to authenticated `viewer` and `admin` users.

Defaults:

- `currency`: current user's `preferredCurrency`; new profiles default to `CNY`

It returns aggregate valued totals plus one non-zero row for each account and instrument combination:

```json
{
  "reportingCurrency": "NZD",
  "totalMarketValue": "345.00",
  "totalUnrealizedGain": "90.00",
  "warnings": [],
  "holdings": [
    {
      "accountId": "uuid",
      "accountName": "Hatch 美股账户",
      "instrumentId": "uuid",
      "instrumentSymbol": "VGT",
      "instrumentName": "Vanguard Information Technology ETF",
      "instrumentShortName": "VGT",
      "assetType": "etf",
      "currency": "USD",
      "quantity": "15",
      "averageUnitCost": "15.15",
      "costAmount": "227.25",
      "marketValue": "315.00",
      "unrealizedGain": "87.75",
      "latestPrice": "21.00",
      "latestPriceDate": "2026-05-23",
      "reportingCurrency": "NZD",
      "warnings": [],
      "valuationWarnings": []
    }
  ]
}
```

Transactions are processed by trade date and creation time ascending. Security holdings use weighted average cost: buys add `grossAmount + fee + tax`, sells reduce remaining carrying cost using the prior average unit cost, and dividends do not alter holdings. When historical valuation FX is available, buy cost also carries a transaction-date USD basis from settlement cash or native trade cost. Security sell fees and taxes do not alter remaining carrying cost.

Cash holdings are calculated only from transactions explicitly linked to cash instruments. Deposits, generated sell cash legs, and interest increase balances; withdrawals, generated buy cash legs, fees, and taxes decrease balances; adjustments apply their stated direction.

Rows with zero final quantity or cash balance are omitted. Negative balances include `NEGATIVE_POSITION`. A security position that becomes negative also has null cost fields and includes `COST_BASIS_UNAVAILABLE`; short-position and realized-gain accounting are not attempted.

Holding quantity, average cost, and remaining cost continue to use the instrument currency. Valuation fields use the requested reporting currency. Missing latest price or required FX makes affected market-value totals unavailable (`null`). Missing historical cost basis makes unrealized-gain totals unavailable (`null`). The API does not return partial totals as complete values.

### Holding Detail Read API

`GET /holdings/detail?accountId=<uuid>&instrumentId=<uuid>&currency=NZD|USD|CNY` is available to authenticated `viewer` and `admin` users.

It returns the current valued holding row, account and instrument metadata, related transactions, linked buy/sell generated cash-leg context, dividend transactions and summary, and latest/previous stored price context. For non-cash holdings, generated cash legs are shown only as linked settlement context. For cash holding details, generated cash legs are included in the main transaction list because they are real cash balance movement.

If the current holding quantity is zero but historical transactions exist for the selected account and instrument, the endpoint still returns a detail response with `hasCurrentPosition = false`, `quantity = "0"`, zero current valuation, and no current valuation warnings. If the account/instrument pair has neither a current holding nor historical transactions, it returns `NOT_FOUND`.

Dividend transactions are displayed as investment income context. They do not change holding quantity; reinvested dividends should be recorded as a separate buy transaction.

### Monthly Summary Read API

`GET /reports/monthly-summary?month=YYYY-MM&currency=NZD|USD|CNY` is available to authenticated `viewer` and `admin` users.

It returns a read-only monthly family review using stored portfolio snapshots, manual ledger cash-flow records, account-level snapshot rows, buy/sell activity, dividends, cash adjustments, and data-quality warnings.

The value bridge remains:

```text
资产变化 = 净投入 + 现金校准 + 估值变动
```

`月初资产` uses the latest portfolio snapshot before the selected month. `月末资产` uses the latest portfolio snapshot on or before the selected month's last day. `净投入` uses manual opening, deposit, and withdrawal transactions in the month; generated buy/sell cash legs are excluded. `现金校准` uses manual cash `adjustment` transactions in the month, direction-aware. `估值变动` is the residual after subtracting net principal flow and cash calibration from asset change; it covers price movement, FX movement, and other valuation effects.

Dividend transactions are returned as separate investment-income context. They do not participate in the value bridge because current dividend records do not automatically increase cash holdings. If dividend cash is reconciled through month-end cash adjustments, it is reflected in `现金校准`.

Account changes use the union of account rows from the selected start and end snapshots. A missing row on one side is treated as zero for display, so accounts opened or closed during the month can still be reviewed. If an account row exists with unavailable market value, the affected account change fields are returned as `null`.

Manual buy/sell transactions are returned as monthly trade activity. Generated cash legs are not standalone trades; when present, they are attached to the parent buy/sell as settlement context in the cash-leg currency.

Missing start/end snapshots, unavailable snapshot market values, missing exact transaction-date valuation FX rates, and snapshot valuation warnings are returned as warnings. The endpoint does not store report records or saved review notes.

Response data:

```json
{
  "monthlySummary": {
    "month": "2026-06",
    "currency": "CNY",
    "monthStart": "2026-06-01",
    "monthEnd": "2026-06-30",
    "startSnapshotDate": "2026-05-31",
    "endSnapshotDate": "2026-06-30",
    "startValue": "100000.000000",
    "endValue": "108000.000000",
    "assetChange": "8000.000000",
    "netPrincipalFlow": "5000.000000",
    "cashAdjustmentImpact": "-20.000000",
    "valuationMovement": "3020.000000",
    "bridgeLines": [],
    "dividendSummary": {
      "grossAmount": "300.000000",
      "taxAmount": "45.000000",
      "netAmount": "255.000000",
      "transactionCount": 2,
      "latestDividendDate": "2026-06-20",
      "instruments": []
    },
    "dividendTransactions": [],
    "cashAdjustments": [],
    "principalTransactions": [],
    "accountChanges": [],
    "tradeActivity": [],
    "snapshotWarnings": [],
    "warnings": []
  }
}
```

### Portfolio Snapshots Read API

`GET /portfolio-snapshots?from=YYYY-MM-DD&to=YYYY-MM-DD&currency=NZD|USD|CNY` is available to authenticated `viewer` and `admin` users. It also supports validated `limit` and `order=asc|desc`. When `limit` is supplied without `from`, the API bypasses the default single-business-date range and searches from the beginning of stored history through `to`, so dashboard activity can request the latest persisted snapshots with `limit=16&order=desc`. Rows are returned in the requested order; chart callers that need chronological data should keep using explicit `from`/`to` range reads with the default ascending order.

Dashboard trend callers may add `includeTrend=true&trendRange=1m|3m|1y|3y|5y|inception`. This keeps the existing `snapshots` array in the response and adds a `trend` object for the asset trend chart.

Defaults:

- `currency`: current user's `preferredCurrency`; new profiles default to `CNY`
- `to`: current app business date using the `06:00 Asia/Shanghai` cutoff
- `from`: same as `to`, unless `limit` is supplied
- `order`: `asc`
- `limit`: optional integer from `1` to `200`; when supplied without `from`, latest-mode history search is enabled
- `trendRange`: `3m` when `includeTrend=true`

Response data:

```json
{
  "snapshots": [
    {
      "id": "uuid",
      "snapshotDate": "2026-05-22",
      "currency": "NZD",
      "marketValue": "393.33",
      "cost": "296.67",
      "unrealizedGain": "96.67",
      "dailyChange": "19.67",
      "dailyChangePct": "5.26315789",
      "usdToNzdRate": "1.6666666667",
      "usdToCnyRate": "7.1428571429",
      "warnings": [],
      "accounts": []
    }
  ],
  "trend": {
    "points": [
      {
        "date": "2026-06-15",
        "portfolioValue": "236000.000000",
        "snapshotDate": "2026-06-13",
        "liveValue": null,
        "totalInvestment": "202000.000000"
      }
    ],
    "principalPoints": [
      {
        "date": "2026-06-15",
        "totalInvestment": "202000.000000"
      }
    ],
    "summary": {
      "range": "3m",
      "rangeStart": "2026-03-15",
      "rangeEnd": "2026-06-15",
      "currency": "NZD",
      "inceptionDate": "2026-05-22",
      "currentTotalInvestment": "202000.000000",
      "cumulativeMovement": null,
      "warnings": []
    }
  }
}
```

Snapshots are stored canonically in USD and converted for display using the FX rates persisted on each snapshot. Missing valuation inputs are returned as `null` rather than partial totals. For dashboard recent-snapshot activity, compare adjacent returned rows' `marketValue` values client-side. Do not reuse `dailyChange` or `dailyChangePct` for `较上一快照`; those fields are latest-price movement on current snapshot holdings, not cash-flow-adjusted portfolio daily P&L.

Trend `portfolioValue` points normally use every stored daily snapshot in the selected range so the value curve remains faithful to daily data. For long ranges of two years or more (`3y`, `5y`, or `inception`), the API thins portfolio points to weekly targets aligned to the current app business date's weekday; if a target date has no snapshot, the API uses the latest previous snapshot and still labels the point with the target date. `totalInvestment` is calculated from manual opening positions, opening balances, deposits, and withdrawals only; generated trade cash legs and income/fee/tax/adjustment transactions are excluded. Principal events use exact trade-date valuation FX. If required FX is missing, `totalInvestment` and `currentTotalInvestment` are returned as `null` and `summary.warnings` includes `MISSING_PRINCIPAL_FX_RATE`; this should be fixed as a data issue rather than hidden with fallback FX.

## Account Write APIs

These endpoints require a valid Supabase Bearer token and an active `admin` role:

- `POST /accounts`
- `PUT /accounts/:id`
- `DELETE /accounts/:id`
- `PUT /accounts/:id/trading-password`

Create request:

```json
{
  "name": "Hatch 美股账户",
  "broker": "Hatch",
  "accountType": "brokerage",
  "baseCurrency": "USD",
  "marketRegion": "US",
  "notes": "可选备注",
  "tradingInfo": "App 安装方式、登录入口和操作提示"
}
```

Update request accepts one or more of the same fields.

Create/update response data:

```json
{
  "account": {
    "id": "uuid",
    "name": "Hatch 美股账户",
    "broker": "Hatch",
    "accountType": "brokerage",
    "baseCurrency": "USD",
    "marketRegion": "US",
    "notes": "可选备注",
    "tradingInfo": "App 安装方式、登录入口和操作提示",
    "createdByUserId": "uuid",
    "updatedByUserId": "uuid",
    "createdAt": "2026-05-22T00:00:00.000Z",
    "updatedAt": "2026-05-22T00:00:00.000Z"
  }
}
```

Update requests cannot change `transactionType`. To correct a record to a different transaction type, delete the original transaction and create a new one.

Delete response data:

```json
{
  "deleted": true
}
```

Account validation errors return `VALIDATION_ERROR`. Missing accounts return `NOT_FOUND`.

### Account Trading Password API

Each account has one deterministic SSM SecureString parameter for its trading password. The database stores only non-confidential `tradingInfo`; the trading password value is never stored in Postgres or frontend storage.

`POST /accounts/:id/trading-password/reveal` is available to authenticated `viewer` and `admin` users. The request must include the extra password:

```json
{
  "extraPassword": "family extra password"
}
```

When the extra-password gate has been initialized and the submitted password matches the SSM gate verifier, the response returns the decrypted trading password:

```json
{
  "tradingPassword": "stored trading password"
}
```

`PUT /accounts/:id/trading-password` is admin-only. It verifies the same extra password and overwrites the account SSM SecureString:

```json
{
  "extraPassword": "family extra password",
  "tradingPassword": "new stored trading password"
}
```

Wrong extra passwords and uninitialized gates return `FORBIDDEN`. Missing accounts return `NOT_FOUND`. Invalid bodies return `VALIDATION_ERROR`.

### Trading Password Gate Settings API

These endpoints are admin-only:

- `GET /settings/trading-password-gate`
- `PATCH /settings/trading-password-gate`

The gate SSM parameter is a SecureString. It is created as `empty` when first read if missing. After setup, the API stores a salted scrypt verifier for the extra password. Legacy MD5 gate values are accepted only to verify the current password and are upgraded to scrypt after a successful check.

`GET /settings/trading-password-gate` returns whether the gate has been initialized:

```json
{
  "isInitialized": false
}
```

`PATCH /settings/trading-password-gate` sets or changes the extra password. If the current SSM value is `empty`, `currentExtraPassword` may be omitted or null. Otherwise it must match the existing extra password:

```json
{
  "currentExtraPassword": "old extra password",
  "newExtraPassword": "new extra password"
}
```

Wrong current passwords return `FORBIDDEN`. Invalid bodies return `VALIDATION_ERROR`.

## Instrument Write APIs

These endpoints require a valid Supabase Bearer token and an active `admin` role:

- `POST /instruments`
- `PUT /instruments/:id`
- `DELETE /instruments/:id`

Create request:

```json
{
  "symbol": "VGT",
  "name": "Vanguard Information Technology ETF",
  "shortName": "VGT",
  "description": "Technology sector ETF",
  "marketRegion": "US",
  "exchange": "NYSE_ARCA",
  "currency": "USD",
  "assetType": "etf",
  "isin": null,
  "provider": "Vanguard",
  "priceSource": "yahoo_finance",
  "priceSourceSymbol": "VGT",
  "priceSourceExchange": "NYSE_ARCA",
  "priceUpdateEnabled": true,
  "priceUpdatePriority": 1,
  "sourceUrl": null,
  "sourceCheckedAt": null,
  "notes": null
}
```

Update request accepts one or more of the same fields.

For all asset types except `other`, `symbol` and `exchange` are required. When supplied, they must be supplied together. The stable identity `marketRegion + exchange + symbol` must be unique. `shortName` is required for updates when present, optional on create for backward compatibility, and must be nonblank with at most 32 characters; create falls back to `symbol` or a trimmed `name` when omitted.

Create/update response data:

```json
{
  "instrument": {
    "id": "uuid",
    "symbol": "VGT",
    "name": "Vanguard Information Technology ETF",
    "shortName": "VGT",
    "marketRegion": "US",
    "exchange": "NYSE_ARCA",
    "currency": "USD",
    "assetType": "etf",
    "priceSource": "yahoo_finance",
    "priceUpdateEnabled": true,
    "priceUpdatePriority": 1,
    "createdByUserId": "uuid",
    "updatedByUserId": "uuid",
    "createdAt": "2026-05-23T00:00:00.000Z",
    "updatedAt": "2026-05-23T00:00:00.000Z"
  }
}
```

Delete response data:

```json
{
  "deleted": true
}
```

An instrument cannot be deleted after it has transaction or price history. Instrument validation, duplicate identity, and delete-in-use errors return `VALIDATION_ERROR`. Missing instruments return `NOT_FOUND`.

## Transaction Write APIs

These endpoints require a valid Supabase Bearer token and an active `admin` role:

- `POST /transactions`
- `PUT /transactions/:id`
- `DELETE /transactions/:id`

Buy request:

```json
{
  "accountId": "uuid",
  "instrumentId": "uuid",
  "transactionType": "buy",
  "tradeDate": "2026-05-23",
  "settlementDate": "2026-05-27",
  "quantity": "10.5",
  "price": "250.123456",
  "fee": "2.50",
  "tax": "0",
  "currency": "USD",
  "notes": null
}
```

For `buy` and `sell`, the API derives `grossAmount` from `quantity * price` using decimal arithmetic and half-up rounding to six decimal places.

For `buy` and `sell`, the API also derives a linked cash movement automatically:

- Settlement currency defaults to the account `baseCurrency`.
- Settlement FX uses the latest stored valuation FX on or before `tradeDate`.
- If trade and settlement currencies differ, missing prior-or-same-day FX returns `VALIDATION_ERROR`.
- `buy` creates a generated cash `withdrawal`; `sell` creates a generated cash `deposit`.
- Generated cash transactions cannot be directly edited or deleted.

Opening position request:

```json
{
  "accountId": "uuid",
  "instrumentId": "non-cash-instrument-uuid",
  "transactionType": "opening_position",
  "tradeDate": "2026-01-01",
  "quantity": "8",
  "grossAmount": "120.00",
  "currency": "USD",
  "notes": "期初持仓"
}
```

Opening cash balance request:

```json
{
  "accountId": "uuid",
  "instrumentId": "cash-instrument-uuid",
  "transactionType": "opening_balance",
  "tradeDate": "2026-01-01",
  "grossAmount": "250.00",
  "currency": "USD",
  "notes": "期初余额"
}
```

Adjustment request:

```json
{
  "accountId": "uuid",
  "instrumentId": "cash-instrument-uuid",
  "transactionType": "adjustment",
  "tradeDate": "2026-05-23",
  "grossAmount": "100.00",
  "currency": "NZD",
  "adjustmentDirection": "increase",
  "notes": "Opening balance correction"
}
```

Transaction validation rules:

- `opening_position` requires a non-cash instrument, positive `quantity`, and positive `grossAmount`; `grossAmount` is total carrying cost.
- `opening_balance` requires a cash instrument and positive `grossAmount`.
- `buy` and `sell` require a non-cash instrument, positive `quantity` and `price`; optional `fee` and `tax` are allowed.
- `buy` settlement amount is `grossAmount + fee + tax`, converted to account base currency when needed.
- `sell` settlement amount is `grossAmount - fee - tax`, converted to account base currency when needed.
- `dividend` requires its non-cash source instrument and positive `grossAmount`; optional `tax` records withholding.
- `deposit`, `withdrawal`, and `interest` require a cash instrument and positive `grossAmount`.
- `fee` requires a cash instrument and stores its positive value in `fee`.
- `tax` requires a cash instrument and stores its positive value in `tax`.
- `adjustment` requires a cash instrument, positive `grossAmount`, and `adjustmentDirection` of `increase` or `decrease`.
- Transaction currency must match the selected instrument currency.
- Optional settlement date cannot precede trade date.
- Valuation-impacting transaction creates, updates, and deletes recalculate existing portfolio snapshots from the affected trade date onward.

Create/update response data:

```json
{
  "transaction": {
    "id": "uuid",
    "accountId": "uuid",
    "instrumentId": "uuid",
    "transactionType": "buy",
    "tradeDate": "2026-05-23",
    "quantity": "10.5",
    "price": "250.123456",
    "grossAmount": "2626.296288",
    "fee": "2.5",
    "tax": "0",
    "currency": "USD",
    "adjustmentDirection": null,
    "transactionSource": "manual",
    "linkedTransactionId": null,
    "settlementCurrency": "NZD",
    "settlementAmount": "4300.10",
    "createdByUserId": "uuid",
    "updatedByUserId": "uuid",
    "createdAt": "2026-05-23T00:00:00.000Z",
    "updatedAt": "2026-05-23T00:00:00.000Z"
  }
}
```

Delete response data:

```json
{
  "deleted": true
}
```

Transaction validation errors return `VALIDATION_ERROR`. Missing transactions return `NOT_FOUND`.

## Admin Maintenance APIs Planned Later

- `POST /jobs/recalculate`
