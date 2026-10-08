# API

## Education reserve and shared cashflow reports

- `GET /education-reserve`: viewer/admin; returns `user`, logical `fund`, lifetime native-currency `totals`, filtered `periodTotals`, expense references, paginated `entries`, and pagination. Filters: `from`, `to`, `currency`, `category`, `limit` (1–200, default 50), and `offset`. Dates are calendar strings. Fund `cutoverAt` indicates migration readiness.
- `POST /education-reserve/entries`: admin; create a manual record.
- `PATCH /education-reserve/entries/:id`: admin; replace editable fields using the current integer `version`.
- `DELETE /education-reserve/entries/:id`: admin; JSON body `{ "version": 1 }` guards against stale deletion.
- `GET /cashflows`: viewer/admin; filters `domain=all|daily_expense|education`, dates, currency, optional education category, limit, and offset. Returns one server-paginated stable activity stream and separate per-domain/per-currency totals. This stream contains bank statement rows and education entries; legacy daily account transfers remain in the account-flow page and are not added to consumption totals.

Entry fields: `entryDate`, `entryType`, `currency`, positive exact decimal string `amount`, nullable `expenseCategory`, `relatedExpenseId`, `targetCurrency`, `targetAmount`, and `notes`. Types: `opening_balance`, `contribution`, `expense`, `refund`, `withdrawal`, `exchange`. Expense/refund categories: `tuition`, `accommodation`, `living_allowance`, `other`. Exchanges require a different target currency and a positive target amount; other types cannot supply target fields. Only refunds may reference an expense. Unavailable/stale records return `NOT_FOUND`/`CONFLICT`; invalid relationships return `VALIDATION_ERROR`.

Default account/transaction listings hide legacy education accounts. Old education rows remain available for historical inspection but cannot be changed through account, transaction, or linked settlement write paths. New education-purpose bank/investment accounts cannot be created. Investment holdings and monthly investment summaries filter investment-purpose accounts; default portfolio snapshot API output does likewise. Education records never write investment business tables.

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
- `DATA_SOURCE_DATE_UNAVAILABLE`
- `DATA_SOURCE_UNAVAILABLE`
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
- `GET /accounts/:id/detail`
- `POST /accounts/:id/trading-password/reveal`
- `GET /instruments`
- `GET /transactions`
- `GET /portfolio-snapshots`
- `GET /reports/monthly-summary`
- `GET /reports/monthly-review`
- `GET /data-maintenance/data-sources`
- `GET /data-maintenance/data-sources/kernel-estimate/anchors`
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
- `PATCH /reports/monthly-review`
- `POST /data-maintenance/data-sources/kernel-estimate/anchors`

`GET /accounts` returns real account data from `investment_accounts`.
`GET /instruments` returns real instrument master data from `instruments`.
`GET /transactions` returns real ledger entries from `transactions`, ordered by trade date and creation time descending. It supports `from`, `to`, `accountId`, `instrumentId`, `transactionType`, comma-separated `transactionTypes`, `excludeGeneratedCashLegs=true|false`, `excludeCashInstruments=true|false`, `limit`, and `offset` query parameters. `transactionTypes=buy,sell` is a first-class filter and works with or without pagination. If both `transactionType` and `transactionTypes` are supplied, the single `transactionType` must be included in the list and narrows the result set. When pagination parameters are supplied, the response includes `pagination` metadata with `limit`, `offset`, and `hasMore`.
`GET /holdings` returns current calculated positions and cash balances derived from transaction history, with valuation fields in the requested reporting currency.
`GET /holdings/detail` returns one account/instrument holding detail, related transactions, dividend summary, linked buy/sell/dividend cash-leg context, and latest/previous price context.
`GET /accounts/:id/detail` returns one account's current valued total, cash/non-cash subtotals, holdings, cash balance context, recent transactions with linked settlement cash legs, account snapshot trend, and account-scoped warnings.
`GET /dashboard` returns a portfolio summary with cumulative investment performance in the selected reporting currency, calculated from investment holdings, current/delayed quotes with stored-price fallback, and valuation FX.
`GET /portfolio-snapshots` returns durable daily valuation snapshots with account-level rows.
`GET /reports/monthly-summary` returns a monthly value bridge plus account contribution, buy/sell activity, cash-calibration context, and dividend fields for compatibility.
`GET /reports/monthly-review` returns saved monthly family notes and review status. `PATCH /reports/monthly-review` updates those workflow fields for admins.
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

`GET /data-maintenance/data-sources` returns the code-backed source registry enriched with configured-target counts, the latest canonical batch run, Kernel's latest anchor date, and one of `needs_configuration`, `ready`, or `inactive`. It lists only implemented sources.

`GET /data-maintenance/data-sources/kernel-estimate/anchors` returns the append-only Kernel anchor history. Decimal fields remain strings.

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

### Atomic Transaction Writes

Transaction create, update, and delete prepare their financial results before writing. One service-role-only RPC commits the manual transaction, generated cash leg, owned historical price, and all affected existing snapshots together. Any database failure rolls back the entire operation. Note-only updates preserve financial fields and derived records. Lambda still verifies the access token, requires `admin`, and performs authoritative request, settlement, and balance validation.

A revision guard returns `409 CONFLICT` when accounts, instruments, transactions, prices, FX, or snapshots change during preparation; refresh before retrying. Known database failures return safe Chinese reasons identifying cash/price/snapshot failure and confirming rollback. Failures during preparation confirm that nothing was saved. Connection failures with an unknown commit outcome ask the user to refresh and check existing records before retrying. The transaction drawer displays the API reason next to its save controls, including on phones; page-level errors remain visible when the drawer is closed. Database internals remain private.

### Kernel Estimate Anchor API

`POST /data-maintenance/data-sources/kernel-estimate/anchors` is admin-only and returns `201`. The request contains an exact Kernel unit price and calendar date:

```json
{
  "anchorDate": "2026-09-30",
  "kernelUnitPrice": "1.2345678901"
}
```

The request date is Kernel's US-market valuation date. The API fetches published USF NTA announcements and requires a reference date mapping back to that valuation date. It atomically writes an NTA anchor and recomputes the available estimate history, then recalculates affected snapshots. The request shape is unchanged. Anchor responses add `proxyValueType`, `proxyAnnouncementId`, `proxyPublishedAt`, and `derivedFromAnchorId`; decimal values remain strings. The compatibility `proxyClose` field contains NTA for `nta` records, or the historical open for `open` records. Derived references do not change actual-price revision priority. Identical actual-anchor retries are idempotent; the first anchor enables updates and subsequent refreshes preserve disabled state.

The endpoint returns `DATA_SOURCE_DATE_UNAVAILABLE` for a missing corresponding published NTA and `DATA_SOURCE_UNAVAILABLE` for unusable NZX data. It never falls back to a market price. Snapshot failures leave pending work for retry; callers can safely retry. Kernel login credentials are never accepted or stored.

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

The dashboard derives holdings through the existing holdings calculation and may refresh delayed quote cache rows during the request. Its headline performance and input-date metadata are specified under Investment Overview Performance and Valuation Metadata below:

- Securities use a dashboard-only delayed quote cache for current-estimate valuation in both the dashboard and investment holdings when available; cash uses its calculated cash balance.
- Dashboard quote cache rows are refreshed when older than five minutes and do not replace stored market-close `instrument_prices`. If a stale cache row cannot be refreshed, the dashboard ignores it and falls back to stored closes.
- Yahoo Finance and Eastmoney each have a six-second deadline for their sequential quote batch, including response-body reading. On deadline expiry, completed quotes are returned and cached; no further instruments are requested in that batch. An entirely timed-out batch returns no quotes. Instruments without a fresh quote use the existing stored-close fallback and remain eligible for refresh on the next dashboard request. Non-timeout HTTP and invalid-response errors still fail the provider batch.
- Holdings are valued internally in USD using USD-centered valuation FX rates in `exchange_rates`, then converted to the requested reporting currency.
- `todayChange` retains its wire name; the UI labels it `本日变动`. It compares current quantities at eligible current quotes or estimated prices with the preceding stored close. Cash is excluded. Eligibility depends on data freshness and kind, not asset type: lagged fund unit prices and confirmed historical closes alone do not qualify. Prices must match the current global app business day: US/UK provider dates are the preceding calendar date, and other markets use the business date itself. Older prices and confirmed closes remain available for valuation but contribute no daily movement; weekends/holidays do not roll old movement forward. Instruments without eligible current quotes or estimates are excluded. Missing preceding closes or FX for participating instruments return unavailable daily fields. `todayChangePct = todayChange / totalAssets * 100`, using the current total investment assets in the same reporting currency, including cash and instruments excluded from the numerator. Missing/non-positive total assets return null. Never use participating instruments or their preceding values as this denominator. This is price movement, excluding cash flows and FX movement, rather than portfolio daily P&L or snapshot change.
- Current market value and latest-price movement use latest valuation FX. Unrealized gain uses transaction-date USD cost basis when historical FX is available, so reported cost does not move with later FX rates.
- `unrealizedGain` applies only to non-cash holdings with available remaining cost basis.
- `dailyTradeCount` counts buy/sell transactions on the current app business date, excluding generated cash legs and cash instruments.
- `accountCount` includes accounts with no non-zero holdings.
- `allocations` drives the `证券账户与现金` chart and contains account rows plus one combined cash row.
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
      "latestPriceIsEstimated": false,
      "reportingCurrency": "NZD",
      "warnings": [],
      "valuationWarnings": []
    }
  ]
}
```

Transactions are processed by trade date and creation time ascending. Security holdings use weighted average cost: buys add `grossAmount + fee + tax`, sells reduce remaining carrying cost using the prior average unit cost, and dividends do not alter holdings. When historical valuation FX is available, buy cost also carries a transaction-date USD basis from settlement cash or native trade cost. Security sell fees and taxes do not alter remaining carrying cost.

Cash holdings are calculated only from transactions explicitly linked to cash instruments. Deposits, generated sell/dividend cash legs, and interest increase balances; withdrawals, generated buy cash legs, fees, and taxes decrease balances; adjustments apply their stated direction.

Rows with zero final quantity or cash balance are omitted. Negative balances include `NEGATIVE_POSITION`. A security position that becomes negative also has null cost fields and includes `COST_BASIS_UNAVAILABLE`; short-position and realized-gain accounting are not attempted.

Holding quantity, average cost, and remaining cost continue to use the instrument currency. Valuation fields use the requested reporting currency. Missing latest price or required FX makes affected market-value totals unavailable (`null`). Missing historical cost basis makes unrealized-gain totals unavailable (`null`). The API does not return partial totals as complete values.

### Holding Detail Read API

`GET /holdings/detail?accountId=<uuid>&instrumentId=<uuid>&currency=NZD|USD|CNY` is available to authenticated `viewer` and `admin` users.

It returns the current valued holding row, account and instrument metadata, related transactions, linked buy/sell/dividend generated cash-leg context, dividend transactions and summary, and latest/previous stored price context. For non-cash holdings, generated cash legs are shown only as linked settlement context. For cash holding details, generated cash legs are included in the main transaction list because they are real cash balance movement.

If the current holding quantity is zero but historical transactions exist for the selected account and instrument, the endpoint still returns a detail response with `hasCurrentPosition = false`, `quantity = "0"`, zero current valuation, and no current valuation warnings. If the account/instrument pair has neither a current holding nor historical transactions, it returns `NOT_FOUND`.

Dividend transactions are displayed as investment income context. They do not change holding quantity. A positive net dividend automatically creates a linked generated cash `deposit`; reinvested dividends should still be recorded as a separate buy transaction.

### Account Purposes and Overview API

Each account has one current `purpose`: `investment`, `daily_expense`, or `education`. Account create/update DTOs accept this field. Omitted create purpose defaults to investment; omitted update purpose is unchanged. Changing purpose immediately changes historical query membership without snapshot rewrites.

| Read surface | Account scope |
| --- | --- |
| Dashboard and portfolio trend (including `includeTrend`) | Current investment accounts only |
| Account management, holdings and monthly family reports | All purposes |
| Portfolio snapshots and transactions | All purposes by default; optional `purpose` filter |
| Daily expense / education overview | Requested purpose only |

`GET /account-purpose-overview` is available to authenticated viewers and admins. It requires `purpose=daily_expense|education` and accepts optional `currency`, `accountId`, `from`, and `to`. It returns `overview.balances` (all accounts of that purpose with current balances and display currency) and `overview.flows` (manual deposits and withdrawals only). The page filters balance rows by selected account. API account/date filters apply to flows; dates do not change current balances. Dates must be valid `YYYY-MM-DD` values with `from <= to`; an account outside the selected purpose is rejected with `VALIDATION_ERROR`.

`GET /portfolio-snapshots` and `GET /transactions` accept `purpose=investment|daily_expense|education`. Transaction filtering occurs before pagination. Dashboard requests explicitly pass `investment`; the optional snapshot `includeTrend` result always represents investment history and principal, independently of the snapshot purpose filter.

Responses use `Cache-Control: no-store`; there is no aggregate dashboard cache. The instrument quote cache is independent of account membership. Account writes remain admin-only; purpose pages link to the existing transaction workflow.

### Account Detail Read API

`GET /accounts/:id/detail?currency=NZD|USD|CNY&trendRange=1m|3m|1y|3y|5y|inception&recentLimit=1..50` is available to authenticated `viewer` and `admin` users.

It returns one account's current valuation, current holdings, cash balances, recent primary transactions, linked buy/sell/dividend settlement cash legs, account snapshot trend, latest account snapshot, and data-quality warnings.

Current valuation is account-scoped: the API calculates holdings, filters to the selected account, fetches prices and valuation FX for those holdings only, then values only those account holdings. Missing price, FX, or cost basis from another account cannot make this account's totals unavailable.

`valuationBusinessDate` is the app business date used as the valuation reference date. It does not mean every holding has same-day market data. Each holding still carries row-level `latestPriceDate`; lagged funds may use the latest published price available.

The account trend uses persisted `portfolio_account_snapshots`. Account snapshot rows store USD values, so NZD/CNY display values are converted with the parent `portfolio_snapshot_headers.usd_to_nzd_rate` and `usd_to_cny_rate` from the same snapshot. Account trends retain all stored snapshot dates, including long ranges.

Recent transactions exclude `generated_cash_leg` rows as primary activity. When a buy/sell/dividend has an automatically generated cash leg, it is attached as `linkedCashLeg`.

Response data:

```json
{
  "accountDetail": {
    "reportingCurrency": "CNY",
    "account": {},
    "currentValue": {
      "marketValue": "100000.00",
      "cashMarketValue": "12000.00",
      "nonCashMarketValue": "88000.00",
      "unrealizedGain": "8000.00",
      "holdingCount": 5,
      "cashBalanceCount": 2,
      "valuationBusinessDate": "2026-06-18"
    },
    "holdings": [],
    "cashBalances": [],
    "recentTransactions": [
      {
        "transaction": {},
        "linkedCashLeg": null
      }
    ],
    "trend": {
      "range": "3m",
      "rangeStart": "2026-03-18",
      "rangeEnd": "2026-06-18",
      "currency": "CNY",
      "points": [
        {
          "date": "2026-06-18",
          "snapshotDate": "2026-06-17",
          "marketValue": "100000.00"
        }
      ],
      "warnings": []
    },
    "latestSnapshot": null,
    "valuationWarnings": [],
    "snapshotWarnings": []
  }
}
```

### Monthly Summary Read API

`GET /reports/monthly-summary?month=YYYY-MM&currency=NZD|USD|CNY` is available to authenticated `viewer` and `admin` users. Future months are rejected with `VALIDATION_ERROR`; the maximum month follows the app business date using the `06:00 Asia/Shanghai` cutoff.

It returns a read-only monthly family review using stored portfolio snapshots, manual ledger cash-flow records, account-level snapshot rows, buy/sell activity, cash adjustments, dividend rows, and data-quality warnings.

The value bridge remains:

```text
资产变化 = 净投入 + 现金校准 + 估值变动
```

`月初资产` uses the latest portfolio snapshot before the selected month. `月末资产` uses the latest portfolio snapshot on or before the selected month's last day. `净投入` normally uses manual opening, deposit, and withdrawal transactions in the month; generated buy/sell/dividend cash legs are excluded. `现金校准` uses manual cash `adjustment` transactions in the month, direction-aware. `估值变动` is the residual after subtracting net principal flow and cash calibration from asset change; it covers price movement, FX movement, and other valuation effects.

Dividend transactions and `dividendSummary` are still returned for API compatibility and audit use. The web monthly review intentionally does not render a separate dividend section, so family members stay focused on `净投入`, `现金校准`, and `估值变动`. Generated dividend cash deposits are included in snapshots and therefore flow into the value bridge through `资产变化`; economically, dividends remain part of the residual `估值变动` rather than new principal.

Account changes use the union of account rows from the selected start and end snapshots plus accounts with monthly principal or cash-adjustment flow. A missing snapshot row on one side is treated as zero for display, so accounts opened or closed during the month can still be reviewed. `assetChange` is end value minus start value. `valuationMovement` is the account residual after subtracting account-level `netPrincipalFlow` and `cashAdjustmentImpact`; dividends remain part of this residual through snapshots. `valuationContributionPct` is account `valuationMovement` divided by the sum of absolute account-level `valuationMovement` values, so in-month principal changes do not inflate contribution shares. If an account row exists with unavailable market value, account-level FX is missing, the total valuation movement is unavailable, or the account-level contribution denominator is zero, the affected fields are returned as `null`.

For an initialization month without an earlier portfolio snapshot, manual `opening_balance` rows and market-valued `opening_position` rows are treated as a synthetic month-start baseline instead of in-month net principal flow. Security openings are valued from quantity, the latest available instrument price on or before the opening date, and valuation FX; their `grossAmount` carrying cost is not used as market value. This allows the monthly bridge and account contribution table to show `assetChange` and `valuationMovement` without double-counting opening assets. If a security opening cannot be market-valued, the start bridge remains unavailable and returns a data-quality warning.

Manual buy/sell transactions are returned as monthly trade activity. Generated buy/sell cash legs are not standalone trades; when present, they are attached to the parent buy/sell as settlement context in the cash-leg currency. Dividend cash legs are reflected through snapshots and cash balances, while dividend rows remain in `dividendTransactions` without a linked cash-leg DTO in this endpoint.

Missing start/end snapshots, unavailable snapshot market values, missing opening security prices, missing exact transaction-date valuation FX rates, and snapshot valuation warnings are returned as warnings. The initialization-month synthetic baseline suppresses the missing-start-snapshot warning when opening rows can be valued and converted successfully. The endpoint does not store derived report records or generated files.

### Monthly Review Workflow API

`GET /reports/monthly-review?month=YYYY-MM` is available to authenticated `viewer` and `admin` users. It returns the saved workflow record for the month, or an unsaved default review with empty notes and `in_progress` status. Future months are rejected with `VALIDATION_ERROR`.

`PATCH /reports/monthly-review?month=YYYY-MM` is admin-only. Future months are rejected with `VALIDATION_ERROR`. It accepts:

```json
{
  "familyNotes": "本月主要变化和家庭讨论结论。",
  "reviewStatus": "complete"
}
```

`reviewStatus` must be `in_progress` or `complete`. Marking a review complete writes `completedAt` and `completedByUserId`; reopening clears both fields. The workflow record stores notes and completion metadata only. Data health is still computed from the monthly summary warnings and snapshot warnings.

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
    "cashAdjustmentImpact": "0.000000",
    "valuationMovement": "3000.000000",
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
    "accountChanges": [
      {
        "accountId": "account-1",
        "accountName": "Brokerage",
        "currency": "CNY",
        "startValue": "60000.000000",
        "endValue": "64000.000000",
        "assetChange": "4000.000000",
        "netPrincipalFlow": "1000.000000",
        "cashAdjustmentImpact": "0.000000",
        "valuationMovement": "3000.000000",
        "valuationContributionPct": "100.000000",
        "changeAmount": "4000.000000",
        "changePct": "6.666667",
        "warnings": []
      }
    ],
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

Snapshots are stored canonically in USD and converted for display using the FX rates persisted on each snapshot. Missing valuation inputs are returned as `null` rather than partial totals. The dashboard does not render a snapshot list. Data maintenance requests API comparisons so the previous persisted row remains available across page and date-filter boundaries. Do not reuse `dailyChange` or `dailyChangePct` for `较上一快照`; those fields are latest-price movement on current snapshot holdings, not cash-flow-adjusted portfolio daily P&L.

Trend `portfolioValue` points normally use every stored daily snapshot in the selected range so the value curve remains faithful to daily data. Long ranges also retain all stored snapshot dates; hover selection in the dashboard does not thin the curve data. `totalInvestment` is calculated from manual opening positions, opening balances, deposits, and withdrawals only; generated trade cash legs and income/fee/tax/adjustment transactions are excluded. Principal events use exact trade-date valuation FX. If required FX is missing, `totalInvestment` and `currentTotalInvestment` are returned as `null` and `summary.warnings` includes `MISSING_PRINCIPAL_FX_RATE`; this should be fixed as a data issue rather than hidden with fallback FX.

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
- `dividend` requires its non-cash source instrument and positive `grossAmount`; optional `tax` records withholding and cannot exceed `grossAmount`.
- `dividend` settlement amount is `grossAmount - tax`, converted to account base currency when needed. A positive net amount creates a generated cash `deposit`; a zero net amount creates no cash leg.
- `deposit`, `withdrawal`, and `interest` require a cash instrument and positive `grossAmount`.
- `fee` requires a cash instrument and stores its positive value in `fee`.
- `tax` requires a cash instrument and stores its positive value in `tax`.
- `adjustment` requires a cash instrument, positive `grossAmount`, and `adjustmentDirection` of `increase` or `decrease`.
- Transaction currency must match the selected instrument currency.
- Optional settlement date cannot precede trade date.
- Creating a past-date `buy` or `sell` best-effort backfills a missing same-day `instrument_prices` row with a `manual` price copied from the transaction price before snapshot recalculation. The row is linked to its source transaction, reconciled when that transaction changes, and deleted with it; independent same-day prices are preserved. This is a deliberate data-consistency trade-off: it is not a guaranteed official close, but it prevents affected historical snapshots from becoming unavailable until better market data is loaded.
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

## Spending API

The `/spending` API uses the standard success/error envelope. GET requires active viewer/admin; all mutations require admin. Money is a decimal string. `statements` now means import/document batches. See [spending specification](spending.md).

| Route | Purpose |
| --- | --- |
| `GET/POST /spending/accounts` | List/create accounts; name, source_format, default_currency, optional identity_suffix, is_active |
| `PATCH/DELETE /spending/accounts/:id` | Edit/deactivate; delete only unused accounts |
| `GET/POST /spending/statements` | Paginated import history; create with account_id and optional document_only |
| `GET /spending/statements/:id` | Batch details, preview/token, counts and source metadata |
| `POST /spending/statements/:id/csv-upload` | filename/size/sha256 → signed POST and key |
| `POST /spending/statements/:id/preview` | key plus optional encoding → validated server preview; no transactions created |
| `POST /spending/statements/:id/commit` | token and choices → atomic, idempotent commit |
| `POST /spending/statements/:id/cancel` | Cancel draft/preview (including expired); idempotent, retains history; returns statement |
| `POST /spending/statements/:id/undo` | optional confirm_edited boolean → remove this batch's rows, retain history/source |
| `GET /spending/statements/:id/csv` | Exact-version source download URL |
| `GET /spending/rows` | Paginated rows plus full filtered totals/monthly/tag summaries |
| `POST /spending/rows` | Manual transaction without a batch |
| `PATCH /spending/rows` | Bulk ids (1–200), optional classification and/or nullable tag |
| `PATCH/DELETE /spending/rows/:id` | Edit/delete a transaction |
| `GET /spending/filter-options` | Distinct tags, accountNumberLast4 and counterpartyAccountLast4 arrays; optional accountId |
| `POST /spending/statements/:id/attachment-upload` | PDF filename/size/sha256 → signed upload |
| `PUT/GET/DELETE /spending/statements/:id/attachment` | Verify/link PDF key; view URL; unlink retaining object |

Source formats: ccb_debit, ccb_credit, bnz. Encodings: utf-8, gb18030, utf-16le, utf-16be. Classifications: income, spending, refund, excluded, review. Manual/editable row fields: account_id, transaction_date, description, amount, classification, tag, notes. An existing row cannot move accounts or alter source identity. Income/refund require positive amounts; spending requires negative amounts.

CCB credit imports keep the first six columns fixed and join all remaining CSV fields with commas into the seventh column (transaction description). Quoted descriptions remain supported; records with fewer than seven columns are rejected.

Commit choices contain exactly one entry per preview record: row_number, skip, classification, nullable tag, allow_duplicate. Invalid CSV records block commit. A stale token/changed duplicate count requires preview again. Repeat source hashes return CONFLICT. Batch list filters: accountId, status, limit, offset. History omits preview bodies; fetch detail when selected.

Row filters: month=YYYY-MM OR inclusive from/to, accountId, statementId, classification, tag OR untagged=true, currency, accountNumberLast4, counterpartyAccountLast4, q, limit, offset. Suffix filters require exactly four digits. Default limit 50, max 200. Literal description search, AND filters, transaction-date/ID descending order. Result: rows, pagination, totals, monthly, tags. Each aggregate has currency, income, gross_spending, refunds, net_spending, count, pending_count; breakdowns add label. Totals include every matched row regardless of pagination and keep currencies separate.

The old statement date/month/period/completion fields, original amount, transaction_type, is_spending and statement-scoped manual-create route are removed. PDF content is never parsed. CSV is limited to 2 MiB/5000 records/4 MiB preview; PDF to 10 MiB. Signed URLs expire in 300 seconds and previews in 24 hours.
Spending import additions (2026-10-01): rows/previews expose nullable account_number_last4 and counterparty_account_last4; both are immutable source identity. Known account metadata fields expose suffixes only. Batch DTOs include nullable total_count (valid rows plus rejected rows; null before parsing) and cancelled_at (UTC). imported_count is historical; row_count counts surviving rows. Cancellation clears preview approval and prevents CSV/PDF writes, preview and commit; existing sources remain readable.

Paginated transaction and data-maintenance responses now include pagination.total, the exact count after all filters. Existing limit/offset/hasMore remain unchanged.

Spending rows/previews also expose nullable counterparty_name, extracted from CCB debit 对方户名 as immutable source identity. Debit descriptions combine 摘要 and 交易地点. Bank-specific rebate/repayment/FX suggestions populate classification/tag before preview; commit choices still determine final classification/tag.

### Transaction table queries

The transaction page defaults to all accounts and requests server-side filters before pagination.
`GET /transactions` accepts `sortBy=tradeDate|settlementDate|instrument|transactionType`
and `sortDirection=asc|desc` (defaults: trade date descending). Instrument order uses
the instrument short name; type order uses the stable transaction type value.
Missing settlement dates sort last in either direction. Trade date, creation time,
and ID provide descending tie-breakers.
Existing date, account, instrument, type, limit, and offset filters remain supported.
The table uses page sizes 20, 50 (default), and 100, with
`excludeGeneratedCashLegs=true&includeLinkedCashLegs=true`.
The optional `linkedCashLegs` response array contains generated cash rows for returned
parents only; these rows do not affect pagination totals. Other callers retain their
existing defaults. Transaction numeric DTO fields are decimal strings, preserving nulls.

### Investment Overview Performance and Valuation Metadata

GET /dashboard returns dashboard.investmentPerformance and dashboard.valuationMetadata. GET /holdings returns the same objects beside holdings for investment accounts. Both endpoints use the same five-minute quote cache, provider deadline, and stored-price fallback. Existing unrealized fields remain compatible. Other purpose overviews, detail pages, and historical snapshots retain stored-price valuation. Future-dated transactions are excluded from current investment overview valuation.

InvestmentPerformance contains netInvestment, investmentProfit, profitPercentageOfAssets (percentage units), inceptionDate, and warnings. Numeric values are decimal strings or null. Missing exact principal-date FX invalidates net investment, cumulative profit, and its ratio without invalidating an otherwise available market value. Missing cost basis affects unrealized gain, not cumulative profit when assets and principal remain available.

ValuationMetadata contains valuedAt (UTC instant), fxDateFrom/fxDateTo, priceDateFrom/priceDateTo, quoteFetchedAtFrom/quoteFetchedAtTo, quotedHoldingCount, storedPriceHoldingCount, and missingPriceHoldingCount. Ranges describe actual inputs and are null when none apply. ValuedHoldingSummary additionally exposes latestPriceSource, latestPriceKind (quote/stored/null), and quoteFetchedAt. Price dates remain provider calendar dates; acquisition and valuation instants are displayed in viewer-local time. Legacy quoteFetchedAt/quoteDate fields are retained and do not describe every holding's freshness.

### Paginated Snapshot Comparisons

GET /portfolio-snapshots accepts optional offset and includeComparison=true. Either enables pagination; default limit is 20, maximum 200, offset is a non-negative integer. Existing calls without either parameter keep their response behavior. The response adds pagination (limit, offset, total, hasMore); comparison mode also adds comparisons keyed by snapshot ID. Each comparison has previousSnapshotDate, changeAmount, and changePct as nullable values.

The predecessor is the immediately earlier persisted snapshot in the same purpose, independent of page or start-date filtering. Each snapshot is converted with its own saved FX. Missing current/previous valuation makes the difference unavailable; a missing or non-positive predecessor makes the percentage unavailable. Missing history has no predecessor. Viewer and admin can read comparisons. The data-maintenance tab requests purpose=investment, descending order, and twenty rows per page; it does not repair or write snapshots.
