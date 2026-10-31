# AWS Session Authentication Design

Status: Approved by the user on 2026-10-31, including the eight-character password minimum. Local implementation authorized; no commits, deployment, provisioning or live database/infrastructure operations authorized.

Implementation: [plan](../plans/2026-10-31-auth-migration.md). Current contracts remain [auth](../auth.md), [API](../api.md), [data model](../data-model.md), and [architecture](../architecture.md) until implementation updates them.

## Intent and scope

Remove Supabase Auth from the application while retaining Supabase Postgres and its server-side data client. Keep the existing two users, stable UUIDs, shared ledger, viewer/admin roles, preferences, audit history, and trading-password gate. Future account visibility is a separate project: introduce no account grants or new role hierarchy here.

Support email/password login, logout, self-service password change, and administrator password reset. No public registration, email recovery, email delivery, social login, MFA, refresh tokens, JWT signing, or always-on server. Operator tooling provisions users and recovers a locked-out administrator. No user deletion or email editing UI.

## Approaches and decision

| Approach | Tradeoff | Decision |
| --- | --- | --- |
| Cognito managed login | Less authentication maintenance; additional managed identity service and hosted flow | Considered, not selected |
| Lambda + DynamoDB opaque sessions | Small product surface and immediate server-side session control; project owns password and session security | Selected by user |
| Lambda + signed JWT | Local signature verification, but adds signing-key lifecycle and revocation complexity | Not selected |

Reuse the existing API Lambda and API Gateway. No separate authentication microservice. DynamoDB is used only for credentials, sessions, and throttling, never for the financial ledger. No new SSM signing secret or pepper is proposed. Existing database and trading-password secrets remain in SSM.

## Ownership and persistence

### Application users in Postgres

Add `public.app_users`: `id uuid primary key`, normalized unique `email text`, `created_at timestamptz`. Preserve existing Auth UUIDs and creation timestamps. Email normalization is trim + lowercase for login; detect normalization collisions before migration. Email changes are operator-only and outside normal UI scope.

`profiles` retains user preferences; `user_roles` remains authoritative for role and active status. Point their identity foreign keys and every business audit foreign key at `app_users`. Do not rewrite financial records or generate replacement user IDs. Migrate every referenced historical identity, not just the two active users. Referenced users without usable email require an explicit operator mapping; never fabricate email addresses or silently drop history.

Replace runtime SQL references to `auth.users`, including the Kernel anchor RPC's creator validation. Inventory actual schema dependencies, triggers, policies, functions, grants, and restore checks; scanning initial migrations alone is insufficient. Historical migrations remain unchanged.

RLS stays enabled. At cutover revoke direct `anon`/`authenticated` access to private application tables, views and RPCs, remove obsolete Auth-dependent policies/functions, and preserve explicitly public reference-data contracts only after review. Service-role API/jobs access remains. Supabase Auth infrastructure may remain installed, but old tokens must provide no private-data access. Do not drop the provider-owned `auth` schema.

### Authentication state in DynamoDB

One environment-specific on-demand table, partition key `pk` (string), no secondary index required. Enable encryption, point-in-time recovery, TTL on `expiresAt`, and retention on stack deletion/replacement. API IAM is limited to required item/transaction operations on this table; browser and jobs receive no auth-table access.

| Key | Attributes and purpose |
| --- | --- |
| `USER#<uuid>` | Versioned password verifier, `credentialVersion` (monotonically increasing integer), `mustChangePassword`, nullable `temporaryPasswordExpiresAt`, `lastSignInAt`, `updatedAt` |
| `SESSION#<sha256-token>` | `userId`, captured `credentialVersion`, `createdAt`, `expiresAt`, `purpose=full|password_change` |
| `RATE#<dimension>#<digest>#<window>` | Atomic attempt count and `expiresAt`; dimensions are normalized email, trusted source IP, and authenticated password operation |

Use strongly consistent base-table reads for credentials and sessions; never authorize using a cross-request cached role, credential version, or active flag. TTL is cleanup only: application code checks expiration on every request. Use UTC epoch seconds for DDB expiry, UTC timestamps for audit; do not use portfolio business dates for authentication.

## Passwords and sessions

Proposed defaults:

- Passwords: 8–128 Unicode code points (minimum length explicitly selected by the user on 2026-10-31), at most 512 UTF-8 bytes. Preserve input exactly, including spaces; no trimming, silent truncation, composition rules, or periodic expiry. Reject reuse of the current password. No password-history service.
- Async Node `crypto.scrypt`: `N=131072`, `r=8`, `p=1`, random 16-byte salt, 64-byte result, `maxmem=256 MiB`; store algorithm/version/parameters with the verifier. Constant-time comparison. Benchmark representative Lambda memory and latency before release; cap concurrent expensive operations and body size. Any parameter change must be documented and tested.
- Session: 32 cryptographically random bytes encoded as base64url, only its SHA-256 digest stored in DDB. Full session expires after 12 hours, no sliding expiry or refresh endpoint.
- Temporary password: operator/admin supplies it through protected input; same password rules, expires after 24 hours. Login produces a 10-minute password-change-only session, never ordinary ledger access.
- Password change/reset atomically updates the verifier and increments `credentialVersion`. All prior sessions become unusable; completion requires fresh login. Compare-and-swap on the observed version rejects competing changes.
- Login verifies the password, checks current SQL access, and transactionally condition-checks credential version while inserting the session. A concurrent reset must never create a usable session for the old password.
- Every authenticated request checks session purpose/expiry, current credential version, current app user, and current active role. Requests already authorized before a revocation may finish; no claim of cancelling in-flight work.
- Logout deletes the presented session; repeated logout with an absent/expired session is harmless. Missing storage availability must not be reported as successful server-side revocation.

Pause/resume remains SQL-authoritative. Add `user_roles.access_revision bigint not null default 0`. To prevent old sessions reviving after resume: pause atomically writes `is_active=false` and increments the SQL revision first, then increments the DDB version. Resume reads the revision, increments the DDB version first, then conditionally sets `is_active=true` and advances the revision only if the observed SQL revision still matches. Concurrent role/access updates must also advance this revision; conflicts return 409 and require reload rather than replaying stale intent. Failures never activate access; DDB retries may increment again safely. No distributed transaction is claimed. Role changes apply on the next request. Keep the existing prohibition on changing one's own role/access through user management.

## API and browser contract

All routes retain the existing response envelope, sanitized errors, HTTPS, explicit CORS allowlist, and `Cache-Control: no-store`. Bound auth JSON bodies to 8 KiB. Never record request bodies, passwords, bearer tokens, verifiers, or authorization headers in logs/error tracking.

| Route | Access | Result |
| --- | --- | --- |
| `POST /auth/login` | Public, rate limited | `{token, expiresAt, mustChangePassword}`; restricted token when a change is required |
| `GET /auth/session` | Full or password-change session | Current safe user identity, role, expiry and change-required state; never verifier/token echo |
| `POST /auth/logout` | Presented session, idempotent if invalid | Revoke that session |
| `POST /auth/change-password` | Full or password-change session, active role | `{currentPassword,newPassword}`; revoke all sessions and return no replacement token |
| `POST /settings/users/:id/reset-password` | Full admin session plus current admin password | `{adminPassword,temporaryPassword}`; force target password change, revoke target sessions |

Admin reset cannot target the caller; use self-change or operator recovery. Revalidate admin credentials, version, and role immediately before reset. Target credential update and an admin credential-version condition belong in one DDB transaction; role changes already in flight retain the request-boundary limitation above. A reset never activates an inactive user. Missing target is 404; insufficient role is 403; invalid credentials/session are 401; rate limit is 429 with `Retry-After`; dependency outage is sanitized 503, not invalid-password feedback. Password-change-only sessions receive `PASSWORD_CHANGE_REQUIRED` for every other protected endpoint, including secrets/preferences/admin routes.

Keep login errors generic for unknown users, invalid passwords, expired temporary passwords, and disabled users. Unknown users perform a dummy verifier check after throttling to avoid an obvious cheap-path identity oracle. Password verification failures for self-change/admin reauthentication have their own rate budget.

Rate limits are proposed as 10 attempts/15 minutes per normalized login email, 100/15 minutes per trusted source IP, and 5/15 minutes per authenticated password-operation actor. Count attempts before password verification using atomic DDB conditional updates; count successes too, and do not reset counters on success. Expiring fixed windows avoid permanent lockout but can still be abused to delay a known user's login. Use API Gateway's trusted source IP; never trust arbitrary forwarding headers. Apply an infrastructure request-rate/burst ceiling before Lambda for auth traffic, with tested limits; DDB failures fail closed. This is bounded throttling, not a promise of comprehensive attack protection.

Retain the Chinese login page. Store token and minimal expiry metadata in `sessionStorage`; no persistent browser storage, URL token, cookie session, or automatic login restore across browser sessions. Browser session restoration features can preserve session storage; server expiry remains authoritative. Clear legacy Supabase session keys during transition. On reload, validate with `/auth/session`; a restricted session routes directly to change-password. Clear auth state and loaded private application data on logout/401; distinguish 403/503 from expired sessions. Do not automatically replay mutation requests.

Replace recovery pages with a Chinese instruction to contact an administrator; old recovery URLs must not accept Supabase recovery tokens. Settings adds self-change and admin reset forms with accessible validation and password-manager autocomplete. Temporary passwords are supplied by the administrator and never returned by the API or persisted in UI storage. Communicate them out of band manually.

## Provisioning, backup, and recovery

Operator CLI uses masked interactive password input, never arguments, shell history, files, or emitted generated passwords. Require explicit environment and target UUID; no broad IAM credentials in the browser. Provision SQL identity/profile/role and DDB credentials in a recoverable sequence: keep SQL access inactive until credentials exist; partial provisioning denies login. Initial and recovery passwords require first-login change. Idempotent provisioning must not silently overwrite an existing credential; resetting requires an explicit operation.

Extend the ledger backup format to include `app_users` before roles/profiles/audit-linked records. Credentials, sessions and rate limits remain outside ledger exports and logs. Preserve existing format compatibility rules: older backups require an explicit identity mapping to reconstruct `app_users`, because profiles alone do not establish email identity. Do not guess metadata.

DDB PITR is an independent recovery aid, not an automatic cross-store backup transaction. Do not serve traffic directly from a restored auth table: quarantine it and discard all session/rate rows and all restored password verifiers, including inactive users. Reprovision fresh temporary credentials for enabled users before attaching it; inactive users without credentials remain denied and require explicit fresh provisioning before future resume. This prevents restoration from reviving revoked sessions or old usable passwords. A credential-store loss can be recovered for two users by resetting passwords against stable SQL identities. Document this drill and encrypted-backup access boundaries.

## Migration and cutover

Use a short operator-controlled maintenance window; no permanent dual-provider acceptance.

1. Inventory identities, normalized-email collisions, all identity dependencies and actual grants. Prepare a reviewed private UUID mapping and recoverable ledger backup.
2. Rehearse on disposable SQL/DDB resources. Apply additive `app_users` schema and preserve IDs. Retain old Auth records during the rollback window; old audit foreign keys are redirected, not records deleted.
3. Independently provision and verify DDB/IAM/API throttling changes. Prepare distinct additive identity and final cutover SQL migrations; the latter removes obsolete policies/grants/functions. These are separately authorized operator actions. Do not register an incomplete migration manifest as ready for the final release.
4. During maintenance, initialize credentials, apply and verify the final cutover migration, then register the exact complete target migration manifest and verified infrastructure manifest under TEST deployment rules before publishing the coordinated API/frontend version. New API accepts only opaque sessions. Existing browser sessions must log in again. Follow the deployment lock/registration sequence; no schema mutation may follow its attestation without fresh verification and registration.
5. Verify both users, roles, preferences, history, change/reset, pause/resume, old-token rejection through both API and direct Supabase access, jobs and backup/restore. Record authenticated browser acceptance separately.
6. After acceptance, independently disable old Auth sign-in paths/providers and remove frontend Supabase configuration. Backend database credentials remain necessary. Retire old accounts only under a separate reviewed cleanup decision.

Rollback is a coordinated operator recovery, never just a Git revert. Before renewed traffic, restore a compatible code/config/grant set and confirm retained Supabase identities have working credentials. Passwords changed in DDB are not synchronized to Supabase; require secure recovery where needed. Deny the new provider and invalidate opaque sessions when returning to the old provider. Preserve business writes and user UUIDs; do not restore an old ledger backup merely to undo authentication. Rehearse failure after every cutover stage.

## Acceptance and unresolved approval

The updated design was approved and local implementation authorized on 2026-10-31. Defaults include 12-hour sessions, 24-hour temporary passwords, forced change after reset, the eight-character password minimum and the documented rate limits/recovery procedure. Live operations require separate authorization.

Acceptance covers concurrency, expiry with undeleted TTL rows, lost/reordered responses, denied restricted sessions, authorization exception preservation, redacted error paths, cross-store partial failures, old-provider bypass closure, backup identity completeness and recovery without revived sessions. Follow [local testing](../local-testing.md) and [workflow](../project-workflow.md); all five browser viewports require real user login.

## References

- [DynamoDB TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html): asynchronous cleanup does not enforce session expiry.
- [DynamoDB consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html): strongly consistent base-table reads reflect completed writes; later concurrent changes still require conditional writes.
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): salted password hashing and scrypt guidance.
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): random session tokens and server-side lifecycle.
