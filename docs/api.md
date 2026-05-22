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

Stage 1 returns placeholder business data. Real CRUD is planned for Stage 2.

## Admin Write APIs Planned Later

- `POST /accounts`
- `PUT /accounts/:id`
- `DELETE /accounts/:id`
- `POST /instruments`
- `PUT /instruments/:id`
- `DELETE /instruments/:id`
- `POST /transactions`
- `PUT /transactions/:id`
- `DELETE /transactions/:id`

## Admin Maintenance APIs Planned Later

- `POST /jobs/recalculate`
