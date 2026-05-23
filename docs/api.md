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

`GET /accounts` returns real account data from `investment_accounts`.
`GET /instruments` returns real instrument master data from `instruments`.

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

Other read endpoints still return placeholder or derived data until their Stage 2/3 implementation.

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

## Admin Write APIs Planned Later

- `POST /transactions`
- `PUT /transactions/:id`
- `DELETE /transactions/:id`

## Admin Maintenance APIs Planned Later

- `POST /jobs/recalculate`
