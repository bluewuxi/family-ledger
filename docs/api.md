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

Stable error codes include `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, and `INTERNAL_ERROR`.

## Public

- `GET /health`

## Authenticated Read

- `GET /me`
- `GET /dashboard`
- `GET /holdings`
- `GET /accounts`
- `GET /instruments`
- `GET /transactions`

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

Stage 0 only includes placeholder read routes and no real database access.
