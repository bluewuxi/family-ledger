# Local Testing

Use this runbook when starting the app locally for browser testing against the configured test Supabase project.

## Prerequisites

- Run commands from the repository root.
- `.env.test` exists locally. It is intentionally ignored by Git.
- AWS credentials can read the test SSM parameters referenced by `.env.test`.
- A Supabase Auth test user exists.
- That Auth user has an active `viewer` or `admin` row in `public.user_roles`. Account create, edit, and delete testing requires `admin`.

Do not store Auth passwords, Supabase secret keys, or resolved SSM values in the repository.

## Configuration Checks

Before starting the app, confirm these values in `.env.test`:

```text
VITE_SUPABASE_URL=<test Supabase project URL>
VITE_SUPABASE_ANON_KEY=<test publishable/anon key>
VITE_API_BASE_URL=http://localhost:3000
SUPABASE_URL=<same test Supabase project URL>
SUPABASE_SECRET_KEY_SSM_PARAM=<test service key SSM parameter path>
AWS_REGION=<SSM parameter region>
```

`VITE_SUPABASE_URL` and `SUPABASE_URL` must target the same test project. A stale frontend URL causes login requests to fail before authentication.

## Start The Frontend

The Vite project is under `apps/web`, while `.env.test` is at the repository root. The current Vite configuration does **not** automatically load the root `.env.test` file. Load the environment into the process before starting Vite.

PowerShell example:

```powershell
Get-Content .env.test | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim().Trim('"'), "Process")
  }
}

Set-Location apps/web
.\node_modules\.bin\vite.CMD --host 127.0.0.1 --port 5181 --strictPort
```

Open:

```text
http://127.0.0.1:5181/login
```

Use another free port when `5181` is already in use.

## Start The API Locally

The backend is implemented as a Lambda handler. There is currently no checked-in local API server command.

For local browser testing, run a temporary HTTP adapter on:

```text
http://localhost:3000
```

The adapter must:

- load `.env.test` into its process before importing/calling backend dependencies;
- forward HTTP method, path, headers, and body into `apps/api/src/handlers/lambda.ts`;
- answer `OPTIONS` requests;
- include CORS response headers permitting the local Vite origin;
- run with `tsx` so it can invoke the TypeScript Lambda source directly.

Minimum health check:

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing
```

Expected response body:

```json
{"success":true,"data":{"status":"ok"}}
```

If local backend work becomes frequent, add a checked-in `scripts/local-api.ts` command as a separate development task rather than repeatedly creating temporary adapters.

## Test Auth And Roles

Passwords cannot be recovered from Supabase Auth or from this repository. Reset a test password in the Supabase Dashboard when needed.

After creating a test Auth user, grant application access from trusted SQL tooling:

```sql
insert into public.user_roles (user_id, role, is_active)
values ('<auth-user-id>', 'admin', true)
on conflict (user_id)
do update set role = excluded.role, is_active = true;
```

For account CRUD testing, use `admin`. For read-only verification, use `viewer`.

## Common Failures

### Login request reports `ERR_NAME_NOT_RESOLVED`

Cause: `VITE_SUPABASE_URL` points to an invalid or stale project hostname.

Check that `VITE_SUPABASE_URL` is reachable and matches `SUPABASE_URL` in `.env.test`, then restart Vite because frontend environment variables are read at startup.

### Browser reports missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`

Cause: Vite was started without loading the root `.env.test` values.

Restart the frontend using the PowerShell environment-loading step above.

### Accounts or other API calls report `ERR_CONNECTION_REFUSED` for `localhost:3000`

Cause: the frontend is running, but the local Lambda HTTP adapter is not listening.

Start the local API adapter and verify `GET /health` before reloading the browser page.

### Login succeeds but API returns `FORBIDDEN`

Cause: the Auth user has no active application role, or has `viewer` when attempting an admin write operation.

Check `public.user_roles` in the test project and assign the intended active role.

## Validation

After making code changes, run:

```powershell
corepack pnpm typecheck
corepack pnpm build
```
