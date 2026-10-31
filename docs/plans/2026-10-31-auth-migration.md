# AWS Session Authentication Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for sequential execution, or `superpowers:subagent-driven-development` only when that execution method is selected. Follow the project workflow instead of automatic commits or worktrees.

**Status:** TEST deployed and automatically verified under subsequent explicit authorization. User initialization and live DDB/API/backup checks passed. Real-login visual acceptance remains pending; see execution evidence below.

**Goal:** Replace Supabase Auth with Lambda/DynamoDB opaque sessions while preserving user IDs, roles and ledger data.

**Architecture:** Existing API Lambda owns authentication and authorization. DynamoDB stores credentials, sessions and rate counters; Postgres owns stable identities, roles and business data. SSM retains existing server secrets only.

**Tech Stack:** Strict TypeScript, Node crypto, AWS SDK DynamoDB, React/Vite, PostgreSQL, existing SAM/CloudFormation and Corepack/pnpm checks.

**Spec:** [AWS session authentication design](../specs/2026-10-31-auth-migration-design.md). Read it with [workflow](../project-workflow.md), [auth](../auth.md), [API](../api.md), [data model](../data-model.md), [local testing](../local-testing.md), and [TEST delivery](../test-auto-deployment.md).

## Global constraints

- Baseline: clean `test` at `7d6820591a896c742c5f532dc36c75d5ed007b94` when planning. Recheck HEAD and all working/index/untracked changes before implementation.
- Preserve existing UUIDs, financial calculations, viewer/admin endpoint exceptions and the separate trading-password gate.
- No account-visibility implementation, JWT, new SSM signing key, public registration, email recovery, persistent browser token, or always-on service.
- All detailed constants in the design apply. English repository prose/identifiers and Simplified Chinese product UI.
- Use existing `test`; no issue, commit, push, migration application, provisioning, infrastructure change, or deployment without its required authorization.
- File names below describe the implementation. Fixtures are isolated; a command name does not imply permission to access shared TEST.

## Review focus

1. Reset racing login or password change must not leave an old-password session usable (Task 2).
2. Failed pause/resume across stores must not revive sessions or accidentally activate access (Task 3).
3. Old Supabase JWTs must not bypass the new API through direct SQL REST/RPC permissions (Tasks 1 and 6).
4. Restricted sessions and restored DDB tables must not regain ordinary ledger access (Tasks 2 and 5).
5. Stale browser state, unknown users, spoofed source IP and dependency failures must not leak secrets or bypass throttling (Tasks 3 and 4).

## Task 1: Stable SQL identities and dependency migration

**Files:** Create `supabase/migrations/<implementation-timestamp>_application_users.sql`, `scripts/verify-app-users-db.ts`; modify `apps/api/src/repositories/managedUserRepository.ts`, `apps/api/src/repositories/profileRepository.ts`, and backup SQL in a new migration. Inspect all migrations and actual catalog dependencies first.

**Interfaces:** SQL `app_users(id,email,created_at)`; existing managed-user DTO shape retained. New `apps/api/src/repositories/appUserRepository.ts` exports `findAppUserByEmail(email: string): Promise<AppUser | null>` and `getAppUserById(id: string): Promise<AppUser | null>`, with `AppUser={id,email,createdAt}`.

- [x] Add disposable PostgreSQL checks for UUID-preserving migration, historical referenced users, normalization collision rejection and all retained foreign-key delete semantics. Run them before implementation to establish failure.
- [x] Implement the additive identity migration and explicit dependency changes, including Kernel RPC validation. Never edit historical migrations. Separate additive preparation from cutover privilege changes where compatibility requires it.
- [x] Implement identity lookups and managed-user reads without Auth admin APIs. Source last sign-in from DDB through the service layer; do not make SQL repositories own authentication.
- [x] Verify no current application foreign key or executed function requires `auth.users`; test legacy JWT `anon`/`authenticated` access denial and trusted jobs/RPC functionality after cutover changes.
- [x] Run `corepack pnpm exec tsx scripts/verify-app-users-db.ts`; expected PASS using disposable resources only.

## Task 2: Password, session, and throttle core

**Files:** Create `apps/api/src/auth/password.ts`, `apps/api/src/auth/sessionService.ts`, `apps/api/src/auth/rateLimit.ts`, `apps/api/src/repositories/authStateRepository.ts`, `apps/api/src/db/dynamoServer.ts`, `packages/shared/src/auth.ts`, `scripts/verify-auth.ts`; modify `packages/shared/src/index.ts`, API package dependencies and root `package.json`.

**Interfaces:** `hashPassword(password: string): Promise<PasswordVerifier>`; `verifyPassword(password: string, verifier: PasswordVerifier): Promise<boolean>`; `authenticateSession(token: string): Promise<SessionIdentity>` where `SessionIdentity={userId,credentialVersion,purpose,expiresAt}`. Repository exposes strongly consistent reads, transactional version-checked session creation, compare-and-swap password replacement, version increment and session deletion. Define typed inputs/outputs in these modules before callers. Shared `AuthSessionResponse={token,expiresAt,mustChangePassword}` uses ISO UTC `expiresAt` at the API boundary.

- [x] Write failing isolated fixtures for password bounds (reject 7 characters, accept 8 and 128, reject 129), Unicode/whitespace, salt uniqueness, malformed verifier, token format, TTL rows past expiry, full/restricted expiry, version mismatch, no raw-token persistence and all design constants.
- [ ] Implement crypto and DDB repository using conditional operations; inject clock/store for deterministic fixture checks. Limit expensive crypto concurrency; choose Lambda memory from measurement, not assumed defaults.
- [x] Add login/reset and change/reset races: old verifier cannot mint a usable session; exactly one conflicting password update succeeds. Simulate lost responses and retries without claiming a failed password change did not commit.
- [x] Add atomic rate-window boundary/concurrent request tests, email/IP/actor budgets, trusted IP extraction, unknown-user dummy verification and DDB outage denial.
- [ ] Add `verify:auth`; run `corepack pnpm verify:auth`, expected PASS. Validate real transaction/consistency behavior against a disposable DDB environment separately; mocks alone do not prove AWS behavior.

## Task 3: API integration and access lifecycle

**Files:** Create `apps/api/src/routes/authRoutes.ts`, `apps/api/src/services/authService.ts`; modify `apps/api/src/routes/router.ts`, `apps/api/src/handlers/lambda.ts`, `apps/api/src/auth/authMiddleware.ts`, `apps/api/src/auth/auth.ts`, `apps/api/src/services/managedUserService.ts`, `apps/api/src/config/serverConfig.ts`, error/logging utilities, and `scripts/verify-auth.ts`.

**Interfaces:** Implement the five endpoint contracts from the design. Existing `requireAuth`/`requireRole` return the existing `AuthenticatedUser` for full sessions only. Restricted-session routes use a separate explicit authenticator and cannot accidentally pass general middleware.

- [x] Add failing handler fixtures for every endpoint/method/access class, request size, 401/403/404/429/503 envelopes, and restricted-session denial across ledger, preferences and trading-secret routes.
- [x] Replace Supabase token verification, removing runtime imports/exports of `verifySupabaseJwt.ts`. Preserve existing business route authorization. Public login is an explicit new exception; health remains public.
- [x] Implement self-change and admin reset, admin reauthentication and self-target rejection, no activation by reset, generic login errors, safe audit events, and no sensitive request-body logging.
- [x] Implement SQL-first pause and DDB-first resume with `user_roles.access_revision` conditional updates from the design; include the column in Task 1 migration. Test every storage failure, retry, overlapping pause/resume and role-change boundary, including a stale resume finishing after a newer pause. Verify old sessions remain invalid after resumed access.
- [x] Test logout idempotency, storage failures, role removal, app-user absence, and old Supabase JWT rejection. Run `verify:auth` and `verify:account-secrets` using their isolated fixture modes.

## Task 4: Browser login and password management

**Files:** Create `apps/web/src/lib/authClient.ts`, `apps/web/src/pages/ChangePasswordPage.tsx`; modify `apps/web/src/lib/authContext.tsx`, `apps/web/src/lib/apiClient.ts`, `apps/web/src/lib/runtimeConfig.ts`, `apps/web/src/main.tsx`, login/settings/router components and web package dependencies. Remove or redirect `ForgotPasswordPage.tsx` and `ResetPasswordPage.tsx`, and retire `apps/web/src/lib/supabase.ts` once callers are removed.

**Interfaces:** `login(email,password)` returns `AuthSessionResponse`; `loadSession`, `logout`, `changePassword`, and `resetUserPassword` wrap the new routes. Expose application-owned session types, no Supabase Session/User imports. Keep expiry in UTC.

- [x] Add focused checks for sessionStorage-only credentials, no token in URLs/logs, legacy-key cleanup, reload session validation, restricted routing, expiry cleanup, and no mutation replay.
- [x] Build Chinese login/self-change/admin-reset flows using existing components. Recovery URLs show administrator-contact guidance and ignore old recovery fragments. Passwords remain form memory only.
- [x] Clear private application state on logout/401, including user switches; do not treat a 503 as bad credentials. Cover interrupted reset/change responses with clear retry/login guidance.
- [x] Adapt existing local bypass fixtures to application IDs without weakening environment/loopback gates. Browser acceptance never uses bypass.
- [ ] Run `verify:auth` and `verify:local-auth-bypass`. After user login/readiness, verify all five required viewports, keyboard/focus/errors, two roles and temporary-password routing. Record actual evidence or pending status.

## Task 5: Provisioning, backup and recovery

**Files:** Create `scripts/manage-auth-user.ts`, `docs/operations/auth-recovery.md`; modify `scripts/verify-backup.ts`, `scripts/verify-backup-restore-db.ts`, `scripts/restore-backup-dry-run.ts`, backup exporter/import types and allowlist modules located by reference search, plus `docs/operations/backup-restore.md`.

**Interfaces:** Operator CLI explicit `provision`/`reset` operations, environment and target UUID; masked password input only. Backup format adds `app_users` before dependent records; credentials and sessions are external dependencies, not ledger payloads.

- [x] Add fixtures for partial provisioning, no accidental credential overwrite, inactive-first bootstrap, historical audit-user restore, legacy-backup mapping requirements and credentials excluded from backup/log output.
- [x] Implement provisioning and first-admin recovery, preserving UUIDs and requiring temporary-password change. Test with disposable identities only.
- [x] Version backup payload, manifest and restore ordering; retain supported older-format behavior with explicit reviewed identity mappings. Test actual export/restore round trip and transaction rollback in disposable PostgreSQL.
- [ ] Write and rehearse the quarantined DDB restore procedure: discard sessions/rates and all restored password verifiers, reprovision enabled users, verify roles, then reconnect. Test restore followed by resume of an inactive user: old credentials must still fail, and fresh provisioning is required. A restored old session/password must fail.
- [x] Run `verify:backup`, `verify:backup-restore-db`, and affected precision checks after confirming their disposable-resource behavior. Document recovery evidence and unresolved environment prerequisites.

## Task 6: Infrastructure and coordinated cutover preparation

**Files:** Modify `infra/aws/template.yaml`, `infra/aws/parameters.prod.example.json` where needed, `scripts/deploy-aws.ts`, deployment runtime/config/smoke fixtures, `.env` example/public configuration files, `scripts/local-api.ts`, and relevant smoke scripts found by searching Supabase Auth usage. Create `docs/operations/auth-cutover.md`.

- [x] Add retained on-demand DDB with encryption/PITR/TTL and least-privilege API permissions. Configure table name by stack reference, never a hard-coded identifier. Keep jobs without auth-table grants.
- [x] Set and fixture-test auth request throttling at API Gateway (proposed 5 requests/second, burst 10); align it with DDB limits and UI traffic. Review existing gateway route shape before choosing route-level configuration; no paid WAF added by default.
- [x] Update runtime config generation and verification to require only the web API URL for auth. Preserve backend Supabase configuration; remove obsolete frontend SDK/config/CSP destinations only after caller inventory.
- [x] Update local and CI smoke paths so unauthenticated protected requests still fail and new public login does not weaken other routes. Adapt scripts that formerly acquired Supabase sessions without putting passwords in command arguments or artifacts.
- [ ] Run `verify:deployment`, `sam:validate` and affected local fixture checks; inspect the exact proposed change set when separately authorized. New DDB/IAM/config changes are independent infrastructure changes, not code-only automatic deployment.
- [ ] Document each maintenance/cutover/rollback stage from the design, exact target commit, backup evidence, identity mapping, separate operator approvals and registration prerequisites. Separate additive and final cutover migrations; apply and verify final policies/grants/functions during maintenance before registering the complete target manifest and publishing code. Test the gate rejects an incomplete manifest. Rehearse partial deployment and old-provider direct-access denial in isolated resources.

## Task 7: Contract reconciliation and final verification

**Files:** Update `AGENTS.md`, `docs/auth.md`, `docs/api.md`, `docs/data-model.md`, `docs/architecture.md`, `docs/time-policy.md` (auth expiry semantics), `docs/deployment.md`, `docs/test-auto-deployment.md`, `docs/local-testing.md`, `docs/frontend-guidelines.md` (recovery navigation), `docs/roadmap.md`, and root README references as affected. Historical plans/releases remain historical.

- [x] Reconcile maintained contracts only when behavior is implemented: public login, restricted sessions, new credential submission handling, schema/grants, backups and manual recovery. Preserve the trading-password response exception; auth tokens are explicit session credentials, never infrastructure secrets.
- [x] Search runtime sources, scripts and maintained docs for `supabase.auth`, `auth.users`, `auth.uid`, Supabase Session types and frontend config dependencies; classify intentional historical/backend references, remove live identity dependencies.
- [x] Run `corepack pnpm typecheck`, `corepack pnpm build`, `verify:auth`, `verify:local-auth-bypass`, `verify:account-secrets`, `verify:backup`, affected isolated DB/deployment checks and `git diff --check`. Record pass/fail/block evidence, not inferred success.
- [x] Review all scoped working/index/untracked changes against the starting baseline and design, with explicit concurrency, privilege, secret/logging and restore coverage. Resolve material findings before claiming completion.
- [x] Report implementation, deployment and authenticated visual acceptance separately. Do not execute migration, provisioning, infrastructure, registration or deployment steps under implementation-only authorization.

## Planning review record

The design was approved; this section records the earlier planning review. An independent read-only builder review identified three gaps, addressed in both documents: overlapping pause/resume now uses SQL revision checks; restored credentials are discarded for inactive as well as active users; final cutover schema verification precedes complete-manifest deployment registration. Planning validation consists of source inspection, requirement-to-task review, local-link checks and whitespace checks. No build, application test, browser acceptance or live cloud verification is claimed by planning completion. The updated defaults were subsequently approved by the user.

## Local implementation evidence (2026-10-31)

Local code is implemented for Tasks 1–7. No commit, deployment, cloud provisioning, shared database migration, credential provisioning or live password reset was performed. The previous Supabase deployment is not changed by these local files.

| Area | Local evidence |
| --- | --- |
| Stable SQL identities | `verify:app-users-db`: UUID/history preservation, normalization collision rejection and retained foreign-key actions |
| Auth core, service, SDK requests and handlers | `verify:auth`: password bounds, random tokens, expiry, version/reset conflicts, roles, restricted sessions, throttling, request bounds, sanitized errors and no mutation replay |
| Access changes | `verify-user-access.ts`: every store failure boundary, SQL/DDB ordering and stale resume CAS |
| Existing protections | `verify:account-secrets`, `verify:local-auth-bypass`, `verify:api-error-logging` passed |
| Backup | `verify:backup`, `verify:backup-restore-db`, `verify:backup-precision-db`: v9, 22 tables, 46 migrations, exact equality, numeric fidelity, late rollback, direct-role denial and removed SQL identity dependencies |
| Delivery preparation | `verify:deployment`, SAM validation: fixtures only; no change set applied |
| Build | Root `typecheck` and `build` passed; web no longer emits a Supabase SDK chunk |

Independent API and whole-change review found no permission bypass. The final review identified a delayed frontend logout/password-change response that could clear a newer login; the captured token/generation fix and deferred-response regression passed after first reproducing the failure. Completion navigation is guarded as well.

Remaining acceptance is explicitly outside local fixture evidence:

- Real/local DynamoDB transaction isolation, IAM enforcement and representative Lambda crypto latency/memory are not established by SDK-command fixtures. No local Java/Docker DDB runtime was available; a separately authorized disposable cloud integration check remains before cutover.
- Operator cutover, infrastructure/migration registration, actual two-user credential initialization and old-provider disablement require separate authorization and the [cutover procedure](../operations/auth-cutover.md).
- Real-login browser acceptance at all five viewports remains pending. No bypass, mock or build substitutes for it; the new auth table/credentials must first be available in an authorized environment.
- PITR recovery is documented and fixture-covered for fail-closed principles; no live PITR exercise or production readiness claim is made.

Unchecked execution items that mention these checks remain pending; this record does not assert live completion.

## User initialization follow-up (2026-10-31)

The user approved local random-password generation and first-admin activation; no commit/deployment/live user creation was authorized. Added --random-password for provision/reset: cryptographic 24-byte generation, no output or external plaintext persistence, temporary-password policy retained. Added activate-first-admin using UUID/email/role/credential checks, session invalidation before SQL activation, and service-role-only revision-checked RPC in 20261031110000_first_admin_activation.sql. Another active admin is rejected; activation never promotes a viewer. Provisioning now advances existing access revisions rather than resetting them.

Observed failing focused verification before the helper existed, followed by passing helper and disposable SQL checks. Password generation uniqueness/format, missing/expired credentials, wrong email/role, invalidation/activation failure, SQL role grants, stale revisions, other-admin guard and repeat activation are covered. CLI-specific TypeScript checks, root typecheck/build and independent scoped review passed. Cloud provisioning and actual user initialization remain pending; use the updated TEST and recovery runbooks.

## TEST execution follow-through

Explicit TEST execution authorization was received after local implementation. SQL/CloudFormation changes, native private administrator initialization/activation, other-user random temporary provisioning, real DDB/API checks and v9 backup verification completed. Automatic release 251572a passed in [run 41188714539](https://github.com/bluewuxi/family-ledger/actions/runs/41188714539) after the code-only role read-resource snapshot was refreshed. Real-login viewport acceptance remains pending. See [execution evidence](../releases/2026-10-31-auth-test-cutover.md); earlier local coverage limits are historical and do not claim a live PITR recovery drill.
