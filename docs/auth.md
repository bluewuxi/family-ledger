# Auth

The API Lambda authenticates opaque random session tokens using an environment-specific DynamoDB table. Supabase remains the server-side Postgres provider; it is not the identity provider. Stable UUIDs live in `app_users`; `profiles` stores preferences and `user_roles` stores authoritative access. See the [approved design](specs/2026-10-31-auth-migration-design.md) for storage and concurrency details and [cutover](operations/auth-cutover.md) for separately authorized deployment steps.

## Roles

Only `viewer` and `admin` exist. Ledger data is shared; user references are audit identities, not ownership. Viewer is read-only except the endpoint exceptions below. Admin manages ledger data and access. Account visibility is deferred; do not add teams or permission matrices.

## Enforcement

Lambda enforces access on every request; frontend checks are UI hints. Every protected request checks session expiry/purpose, current credential version, application identity, active role and endpoint permissions. No active role means denied. No cross-request permission cache. Already-authorized in-flight work can finish after a concurrent revocation.

- Public: `GET /health` and rate-limited `POST /auth/login`; logout is idempotent for invalid sessions and provides no data access.
- Full active viewer/admin: ordinary ledger and sanitized maintenance/status reads.
- Admin only: user management, password reset of another user, gate settings, error tracking including reads, ledger mutations, maintenance/job triggers.
- Viewer exceptions: `PATCH /settings/preferences` changes only the caller's preferences; `POST /accounts/:id/trading-password/reveal` requires the initialized shared extra-password gate and matching extra password for either role.
- Restricted temporary-password sessions: session status, password change and logout only; every other protected endpoint returns `PASSWORD_CHANGE_REQUIRED`.

Admin cannot change their own access or reset their own password through user management. Pause writes SQL inactive first then revokes DDB sessions; resume revokes sessions before conditional SQL activation. SQL access revisions reject stale concurrent changes. Resume never revives old sessions. RLS remains enabled; cutover revokes private direct `anon`/`authenticated` access so old Supabase tokens cannot bypass the API. Jobs/API retain trusted database access.

## Password and session lifecycle

Passwords contain 8–128 Unicode characters, at most 512 UTF-8 bytes, with no composition rule. They are salted scrypt verifiers in DDB, never plaintext or reversible ciphertext. Users change their own password by providing the current password. Admin reset requires the admin's current password and sets a 24-hour temporary password; next login allows only password change. Temporary sessions expire in 10 minutes or with the temporary password, whichever comes first. Change/reset increments the credential version and invalidates all prior sessions.

A full token has 256 random bits and a fixed 12-hour lifetime. Only its SHA-256 hash is stored server-side. Browser tokens use `sessionStorage`; no JWT signing key, refresh token, persistent local storage or token URL. DynamoDB TTL only cleans records; server timestamps enforce expiry. Browser session restoration may preserve session storage; the fixed server expiry remains authoritative.

Login throttling uses atomic fixed 15-minute DDB windows: 10 attempts per normalized email, 100 per trusted source IP, and 5 per authenticated password-operation actor. Gateway also limits auth mutation routes. Failures and successes count. There is no permanent account lock or claim of comprehensive attack protection. Dependency failure denies requests with sanitized 503 rather than reporting bad passwords.

## User management and recovery

No public registration, invitations, email editing UI, email recovery or social login. Operators provision users and recover the administrator using masked-input tooling; see [recovery](operations/auth-recovery.md). Settings lists existing app users, manages roles/active status, changes the caller's password and resets another user's password. Login recovery guidance asks users to contact an administrator.

Ledger backups contain stable application identities, roles and preferences, not credentials/sessions. Old backups need explicit reviewed identity mappings. DDB recovery must discard all old verifiers and sessions, including inactive users, before fresh credential provisioning. Do not directly reconnect a restored auth table.

## Secret boundaries

Server database/service credentials and the trading-password gate verifier remain in AWS SSM and never enter frontend configuration, responses or logs. Auth passwords, tokens, verifiers and sensitive request bodies never enter logs or ledger backups. A newly issued session token is returned only by login and held in browser session storage.

Trading account passwords retain the independent shared extra-password gate. Its SSM SecureString is `empty` before setup or a salted scrypt verifier. Only the explicitly gated reveal endpoint may return an account trading password. Ordinary DTOs, logs, backups and persistent browser storage exclude it. Admin alone updates account trading passwords and the gate. Extra-password throttling remains a separate open hardening decision.
