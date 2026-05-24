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
- `GET /accounts`
- `GET /instruments`
- `GET /transactions`
- `GET /portfolio-snapshots`

`GET /accounts` returns real account data from `investment_accounts`.
`GET /instruments` returns real instrument master data from `instruments`.
`GET /transactions` returns real ledger entries from `transactions`, ordered by trade date and creation time descending.
`GET /holdings` returns current calculated positions and cash balances derived from transaction history.
`GET /dashboard` returns a four-card portfolio summary in the selected reporting currency, calculated from holdings and stored price/FX records.
`GET /portfolio-snapshots` returns durable daily valuation snapshots with account-level rows.

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

### Dashboard Read API

`GET /dashboard?currency=NZD|USD|CNY` is available to authenticated `viewer` and `admin` users.

Defaults:

- `currency`: `NZD`

It returns values in the selected reporting currency:

```json
{
  "dashboard": {
    "reportingCurrency": "USD",
    "totalAssets": "9240.67",
    "todayChange": "48.25",
    "todayChangePct": "0.32",
    "unrealizedGain": "1243.10",
    "accountCount": 3,
    "warnings": []
  }
}
```

The dashboard derives holdings through the existing holdings calculation and reads stored data only:

- Securities use their latest stored close price; cash uses its calculated cash balance.
- Holdings are valued internally in USD using the latest USD-centered valuation FX rates in `exchange_rates`, then converted to the requested reporting currency.
- `todayChange` compares the latest and preceding stored security close prices. Cash has zero daily price movement.
- Latest FX is applied to current value, preceding value, and carrying cost, so daily change reflects price movement rather than FX movement.
- `unrealizedGain` applies only to non-cash holdings with available remaining carrying cost.
- `accountCount` includes accounts with no non-zero holdings.

Aggregate totals are not reported as partial values. A missing latest price or required FX rate returns `null` for all affected monetary metrics. A missing preceding close returns `null` only for daily-change fields. Unavailable cost basis returns `null` only for unrealized gain. The `warnings` array identifies the affected instrument and one of `MISSING_LATEST_PRICE`, `MISSING_PREVIOUS_PRICE`, `MISSING_FX_RATE`, or `COST_BASIS_UNAVAILABLE`.

### Holdings Read API

`GET /holdings` is available to authenticated `viewer` and `admin` users. It returns one non-zero row for each account and instrument combination:

```json
{
  "holdings": [
    {
      "accountId": "uuid",
      "accountName": "Hatch 美股账户",
      "instrumentId": "uuid",
      "instrumentSymbol": "VGT",
      "instrumentName": "Vanguard Information Technology ETF",
      "assetType": "etf",
      "currency": "USD",
      "quantity": "15",
      "averageUnitCost": "15.15",
      "costAmount": "227.25",
      "warnings": []
    }
  ]
}
```

Transactions are processed by trade date and creation time ascending. Security holdings use weighted average cost: buys add `grossAmount + fee + tax`, sells reduce remaining carrying cost using the prior average unit cost, and dividends do not alter holdings. Security sell fees and taxes do not alter remaining carrying cost.

Cash holdings are calculated only from transactions explicitly linked to cash instruments. Deposits and interest increase balances; withdrawals, fees, and taxes decrease balances; adjustments apply their stated direction. Security trades do not implicitly create cash movements.

Rows with zero final quantity or cash balance are omitted. Negative balances include `NEGATIVE_POSITION`. A security position that becomes negative also has null cost fields and includes `COST_BASIS_UNAVAILABLE`; short-position and realized-gain accounting are not attempted.

Holding rows continue to return amounts in the instrument currency. NZD market value and unrealized gain are provided only by the dashboard summary; valued holding rows and allocation fields remain deferred.

### Portfolio Snapshots Read API

`GET /portfolio-snapshots?from=YYYY-MM-DD&to=YYYY-MM-DD&currency=NZD|USD|CNY` is available to authenticated `viewer` and `admin` users.

Defaults:

- `currency`: `NZD`
- `to`: current UTC date
- `from`: same as `to`

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
  ]
}
```

Snapshots are stored canonically in USD and converted for display using the FX rates persisted on each snapshot. Missing valuation inputs are returned as `null` rather than partial totals.

## Account Write APIs

These endpoints require a valid Supabase Bearer token and an active `admin` role:

- `POST /accounts`
- `PUT /accounts/:id`
- `DELETE /accounts/:id`

Create request:

```json
{
  "name": "Hatch 美股账户",
  "broker": "Hatch",
  "accountType": "brokerage",
  "baseCurrency": "USD",
  "marketRegion": "US",
  "notes": "可选备注"
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
    "createdByUserId": "uuid",
    "updatedByUserId": "uuid",
    "createdAt": "2026-05-22T00:00:00.000Z",
    "updatedAt": "2026-05-22T00:00:00.000Z"
  }
}
```

Delete response data:

```json
{
  "deleted": true
}
```

Account validation errors return `VALIDATION_ERROR`. Missing accounts return `NOT_FOUND`.

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

For all asset types except `other`, `symbol` and `exchange` are required. When supplied, they must be supplied together. The stable identity `marketRegion + exchange + symbol` must be unique.

Create/update response data:

```json
{
  "instrument": {
    "id": "uuid",
    "symbol": "VGT",
    "name": "Vanguard Information Technology ETF",
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
  "fxRateToNzd": "1.6500000000",
  "notes": null
}
```

For `buy` and `sell`, the API derives `grossAmount` from `quantity * price` using decimal arithmetic and half-up rounding to six decimal places.

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

- `buy` and `sell` require a non-cash instrument, positive `quantity` and `price`; optional `fee` and `tax` are allowed.
- `dividend` requires its non-cash source instrument and positive `grossAmount`; optional `tax` records withholding.
- `deposit`, `withdrawal`, and `interest` require a cash instrument and positive `grossAmount`.
- `fee` requires a cash instrument and stores its positive value in `fee`.
- `tax` requires a cash instrument and stores its positive value in `tax`.
- `adjustment` requires a cash instrument, positive `grossAmount`, and `adjustmentDirection` of `increase` or `decrease`.
- Transaction currency must match the selected instrument currency.
- Optional `fxRateToNzd` must be positive; optional settlement date cannot precede trade date.

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
    "fxRateToNzd": "1.65",
    "adjustmentDirection": null,
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
