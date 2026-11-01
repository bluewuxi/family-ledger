# Account Visibility Implementation Plan

> **For agentic workers:** On separately authorized execution, use `superpowers:executing-plans`, or `superpowers:subagent-driven-development` if that execution method is selected. Track the checkboxes and follow the project workflow rather than automatic commits or worktree creation.

**Status:** Implementation, independent review, real PostgREST integration, local/deployed authenticated acceptance, and authorized TEST publication complete. See [delivery evidence](../releases/2026-11-01-account-visibility-validation.md). Production is excluded.

**Goal:** Enforce viewer account scope across all account-backed reads and calculated results while retaining the explicitly approved disclosure exceptions.

**Architecture:** Resolve role permissions and account scope centrally in the API. Persist typed grants in Postgres, filter before calculations and pagination, and retain trusted full-ledger batch work. Keep current administrators unrestricted while separating user/grant administration from ledger operations for the future super-administrator extension.

**Tech stack:** Existing strict TypeScript, React/Vite, Lambda, Supabase Postgres, opaque-session authentication, Corepack/pnpm, and existing fixture verification scripts. No new framework or service.

**Spec:** [Approved account visibility design](../specs/2026-10-31-account-visibility-design.md).

## Global constraints and starting point

- Work in the existing `test` checkout. At planning time, `docs/README.md` is modified and the approved design is untracked; preserve both. Re-record HEAD and staged/unstaged/untracked state before execution.
- Read [AGENTS.md](../../AGENTS.md), [workflow](../project-workflow.md), [Auth](../auth.md), [architecture](../architecture.md), [API](../api.md), [data model](../data-model.md), affected product specifications, and [local testing](../local-testing.md) before implementation.
- Only `admin` and `viewer` this release. Admin scope is always all; viewer mode is `all` or `selected`, including empty selection. Do not implement super administrators yet.
- All calculated amounts, counts, options, and historical results are scoped. Counterparty fields from visible source records, free text, and shared monthly review narrative/status remain readable by explicit approval. Do not use those exceptions to expose hidden account DTOs or computed totals.
- All viewers lose original CSV/PDF download access. Existing trading-password reveal still requires visible account access and the extra-password gate.
- New viewers default to empty selected scope. Admin-to-viewer changes default explicitly to all, with a pre-save warning and an option to narrow. Old backups without scope do not default viewers to all.
- Repository prose/identifiers are English; UI is Simplified Chinese. Preserve decimal arithmetic, current purpose boundaries, time semantics, and financial formulas.
- No commit, push, migration application, live-user edits, deployment, or infrastructure work is authorized by this plan. Local disposable database checks are distinct from live writes.

## Review focus

1. Hidden malformed account data must not poison visible valuations or disclose warnings (Task 4).
2. Matching UUIDs across resource domains and legacy education routes must not bypass scope (Tasks 1, 3, 5).
3. Revocation plus an older in-flight response must not repopulate cleared browser caches (Tasks 3, 7).
4. Demotion defaults and old-backup restoration have deliberately different outcomes (Tasks 2, 6).
5. Shared authored content is permitted, but nested DTOs and computed aggregates remain protected (Tasks 3–5).

## Task 1: Define scope contracts and inventory every disclosure path

**Files:** Create `packages/shared/src/accountAccess.ts`, `scripts/verify-account-access.ts`; modify `packages/shared/src/index.ts`, `package.json`, this plan. Inspect `apps/api/src/routes/router.ts`, `routes/spendingRoutes.ts`, `routes/educationReserveRoutes.ts`, `routes/authRoutes.ts`, and `handlers/lambda.ts`.

**Interfaces:** Define `AccountResourceKind = 'ledger' | 'spending' | 'education'`, `AccountResourceRef = { kind: AccountResourceKind; id: string }`, `AccountScope = { mode: 'all' } | { mode: 'selected'; resources: AccountResourceRef[] }`, and `AccountAccessPolicy = { userId: string; revision: number; scope: AccountScope }`. Add managed-user DTO fields without exposing other users' policies to viewers.

- [x] Inventory every private route and nested DTO in a table appended to this plan: operation policy, domain owner, filtering point, child-ID authorization, global exception, cache dependency, and verification case. Include account totals, balances, imports/previews, attachments, snapshot predecessors, legacy education, maintenance, instruments, session/bootstrap, and monthly reviews. No unclassified read may remain.
- [x] Add a fixture command `verify:account-access` using existing `tsx` conventions. Assert selected empty denies membership; duplicate grants normalize; identical IDs in different domains differ; invalid kinds/IDs are rejected; all mode includes a new resource.
- [x] Demonstrate a meaningful failing fixture, implement shared validation, then rerun to pass. Keep financial values outside these authorization types.

## Task 2: Persist policies and manage grants atomically

**Files:** Create a uniquely timestamped migration in `supabase/migrations`, `apps/api/src/repositories/accountAccessRepository.ts`, `apps/api/src/services/accountAccessService.ts`, `scripts/verify-account-access-db.ts`; modify `services/managedUserService.ts`, `services/userAccessLifecycle.ts`, `repositories/managedUserRepository.ts`, `routes/router.ts`, `scripts/auth-user-operations.ts`, `scripts/verify-user-access.ts`, and `package.json`.

**Interfaces:** `getAccountAccessPolicy(userId: string): Promise<AccountAccessPolicy | null>` and `replaceAccountScope(input: { actorId: string; userId: string; expectedRevision: number; scope: AccountScope }): Promise<AccountAccessPolicy>`. Role-plus-scope changes share the existing managed-user lifecycle transaction boundary and revision checks, not two independent writes.

- [x] Create failing isolated-DB cases for stale concurrent saves, invalid resource FK, atomic rollback, own-access rejection, new viewer empty scope, and admin demotion default all versus explicitly selected scope.
- [x] Add a policy row keyed by app user, typed grant tables with domain-specific foreign keys, and an audit relation storing actor/target/time/change. Enforce unique grants, mode validation, revision increments, and trusted-server-only mutation with defensive RLS/direct-access restrictions.
- [x] Extend the existing managed-user update contract with scope and expected revision; add `GET /settings/users/:id/account-access` and `PUT /settings/users/:id/account-access` for full active admins only. Scope-only changes use the replace function; combined role/scope updates remain atomic. Preserve pause/resume ordering and credential/session safeguards.
- [x] Update operator provisioning to initialize new viewer scope. Existing viewer initialization must not silently grant all; prepare reviewed initialization separately from schema application. Admin effective scope stays all regardless of obsolete selected grants.
- [x] Register/run `verify:account-access-db` against a disposable local database and run `verify:auth`. Expected: all assertions pass, no project/live database access.

## Task 3: Central request enforcement and disclosure policies

**Files:** Create `apps/api/src/auth/accountAccess.ts`; modify `auth/authMiddleware.ts`, `routes/router.ts`, `routes/spendingRoutes.ts`, `routes/educationReserveRoutes.ts`, relevant services/repositories from the Task 1 inventory, and `scripts/verify-account-access.ts`.

**Interfaces:** `resolveAccountAccess(user: AuthenticatedUser): Promise<AccountAccessPolicy>`; `assertAccountVisible(policy: AccountAccessPolicy, resource: AccountResourceRef): void`; `visibleAccountIds(policy: AccountAccessPolicy, kind: AccountResourceKind): readonly string[] | null` (`null` means all, `[]` means none). Internal account-read services receive this policy explicitly, never an optional user that defaults to unrestricted access.

- [x] Add failing actual-route fixtures for guessed account/child IDs, missing policy, policy-store outage, restricted temporary sessions, role denial, and revocation between consecutive requests.
- [x] Resolve access per protected request without a cross-request permission cache; centralize operation checks. Missing viewer policy denies account data; dependency failure returns sanitized 503. Account-child lookup returns the same not-found behavior for absent and hidden resources.
- [x] Gate trading-password reveal before secret retrieval. Gate original source-file URL issuance/download to admins for all viewer scope modes. Retain approved shared reviews and source counterparty fields, but filter source options before disclosure.
- [x] Implement a response scope revision mechanism for private reads and expose the caller's policy revision through session/current-user data. Do not disclose grant catalogs to ordinary viewers. Apply safe global-field policies to maintenance and reference-data responses.
- [x] Run `verify:account-access`, `verify:auth`, and `verify:account-secrets`; require route-level evidence rather than helper-only tests.

## Task 4: Scope investment calculations and history

**Files:** Modify `apps/api/src/services/dashboardService.ts`, `holdingService.ts`, `accountService.ts`, `accountDetailService.ts`, `transactionService.ts`, `investmentPerformanceService.ts`, `monthlySummaryService.ts`, `portfolioSnapshotService.ts`, `historyCache.ts`, and their account/transaction/snapshot repositories. Extend existing investment verification scripts and `scripts/verify-account-access.ts`.

**Interfaces:** Consume the required policy from Task 3; intersect permitted IDs with existing purpose/date/user filters before financial computation and before database pagination/counts. Preserve existing result DTO formulas and decimal representations.

- [x] Add A/B fixtures: only A visible, B has missing FX/broken valuation, a closed A position, one-sided funding transfer, empty scope, and previous snapshots outside the requested page. Assert results equal an independently calculated A-only ledger, including ratios and counts.
- [x] Scope account/transaction queries before holdings, principal, quote inputs, warnings, totals, and metadata. Ensure account detail and balance endpoints cannot independently bypass the policy.
- [x] Build snapshot/trend/monthly values from authorized account snapshot rows and their saved FX. Never reuse family aggregate totals or notes. Scope predecessor selection consistently and omit dates with only hidden-account data rather than exposing hidden activity.
- [x] Key private history caches by effective scope/revision or cache only safely reusable internal data that is scoped before output. Keep batch generation full-ledger; do not create per-user snapshots.
- [x] Run `verify:holdings`, `verify:holding-detail`, `verify:account-detail`, `verify:dashboard`, `verify:monthly-summary`, `verify:portfolio-trend`, `verify:portfolio-snapshots`, `verify:account-purposes`, and the new access fixtures. Require all pass with unchanged financial semantics.

## Task 5: Scope spending, education, and combined queries

**Files:** Modify `apps/api/src/services/spendingService.ts`, `spendingImportService.ts`, `spendingAttachmentService.ts`, `educationReserveService.ts`, `repositories/spendingRepository.ts`, `educationReserveRepository.ts`, related routes, and a new migration for scoped SQL/RPC reads. Extend `scripts/verify-spending.ts`, `verify-spending-db.ts`, `verify-education-reserve.ts`, `verify-education-reserve-db.ts`.

**Interfaces:** Pass server-derived spending IDs and education access to SQL/RPC reads separately from user-provided filters. `null` and empty IDs retain the Task 3 semantics; caller-supplied IDs never replace authorization scope.

- [x] Add failing cases for hidden statement/entry IDs, options from hidden rows, combined pagination, empty education grant, cross-domain UUID collision, and legacy education account routes.
- [x] Scope list/detail/import metadata, row summaries/options and combined queries before aggregation and pagination. Grant education as one whole multi-currency fund, mapping legacy history to that same boundary.
- [x] Preserve counterparty names/suffixes and filters from authorized rows, source free text, shared monthly review narrative/status, and existing classification rules. Verify no hidden account link or family computed total is attached to these exceptions.
- [x] Run all four spending/education commands above using their documented fixture/disposable-DB modes; verify source URL denial for both viewer modes and continued admin access.

## Task 6: Backup compatibility and safe restoration

**Files:** Modify `apps/jobs/src/services/ledgerBackupBundle.ts`, exporter migration, `scripts/restore-backup-dry-run.ts`, `scripts/verify-backup.ts`, `scripts/verify-backup-restore-db.ts`, and `docs/operations/backup-restore.md`.

- [x] Add fixtures for policy/grant/audit round-trip, deleted-resource integrity, malformed grants, and older backup without policies. Original-version checksum validation must precede normalization.
- [x] Bump the backup format from the actual execution-time version (currently code/docs report 9); update exporter allowlist, marker, normalization, and restoration dependency order together. Keep credentials, sessions, and secrets excluded.
- [x] Normalize legacy viewer authorization to empty selected scope unless a separately reviewed mapping supplies grants; never reuse demotion's all-scope default. Restore policies/grants transactionally with stable user/resource identities.
- [x] Run `verify:backup`, `verify:backup-restore-db`, and `verify:backup-precision-db` in documented isolated modes. No live backup or restore is part of this task.

## Task 7: User management and scoped UI state

**Files:** Modify `apps/web/src/pages/SettingsPage.tsx`, `lib/apiClient.ts`, `lib/authContext.tsx`, `lib/readCache.ts`, affected account/holdings/dashboard/cashflow/maintenance page components found in Task 1; create `apps/web/src/components/AccountAccessEditor.tsx` and `apps/web/verify-account-access-client.ts`.

- [x] Add client fixtures for user change, scope revision change, stale responses arriving after invalidation, empty scope, and demotion payload defaults. Register `verify:account-access-client`; demonstrate failure before implementing state handling.
- [x] Add grouped `全部账户`/`指定账户` selection with empty-scope support and fixed admin all-access display. Save whole configurations with revisions and show conflicts. Demotion warning must state all existing/future accounts remain visible unless narrowed.
- [x] Mark calculated views `可见账户合计`; use `暂无可访问账户` for no account access. Hide viewer original-download controls while retaining authorized parsed rows, counterparties, and shared reviews. Avoid showing full-family totals briefly during loading.
- [x] Invalidate private UI caches and removed details on detected revision change; use a user/revision generation guard to discard older in-flight responses. Reload affected totals. Do not promise server-pushed screen erasure.
- [x] Run client fixtures, `verify:loading`, and `verify:family-cashflow-ui`. Follow [frontend guidelines](../frontend-guidelines.md); actual authenticated visual acceptance is Task 8 and requires user login.

## Task 8: Contract reconciliation, complete verification, and delivery readiness

**Files:** Update `docs/auth.md`, `architecture.md`, `api.md`, `data-model.md`, `specs/investment-overview.md`, `specs/spending.md`, `specs/education-reserve.md`, `local-testing.md`, `roadmap.md`, this plan, and the backup procedure from Task 6. Add a dated release record only when delivery actually occurs.

- [x] Reconcile maintained contracts with implemented behavior; clearly document the approved disclosure exceptions, role-change defaults, restore policy, and future-only super-administrator boundary.
- [x] Close every Task 1 inventory row with a test reference and actual result. Review the full scoped working/index diff and untracked files, not only committed HEAD differences. Include all approved exceptions in final review.
- [x] Run `corepack pnpm typecheck`, `corepack pnpm build`, `git diff --check`, and affected focused suites listed above. Classify commands before running; do not run live repair/audit commands by name alone. Record blockers and results here.
- [x] With separate user login/readiness agreement, inspect admin and viewer behavior at `320x740`, `393x852`, `430x932`, `768x1024`, and desktop `1440x1000`. Real authentication and authorized dedicated-viewer scope changes were used; no ledger transactions were changed. See [acceptance evidence](../releases/2026-11-01-account-visibility-validation.md).
- [x] Prepare rollout prerequisites: reviewed initial policies for existing viewers; schema/exporter compatibility; coordinated API/web/jobs versions; expiry of previously issued source URLs; documented restoration/rollback behavior. Older unrestricted API code is not a safe rollback after restricted access is promised: maintain service denial or compatible enforcement until recovery.
- [x] Before separately authorized delivery, read [TEST automation](../test-auto-deployment.md) and [deployment](../deployment.md). Four TEST migrations and initial policies were verified/registered; isolated CORS configuration was applied/registered before automatic delivery. No release gate was bypassed.

## Completion record and authorization boundary

Planning checks: source paths and existing verification commands inspected; design-to-task coverage self-reviewed; document links and whitespace checked. Implementation and authorized TEST/local acceptance and publication are complete as recorded below.

Execution order: Tasks 1–3 establish shared contracts; Tasks 4–5 complete domain coverage; Task 6 adds restoration safety; Task 7 completes the UI; Task 8 verifies the combined change. These are reviewable increments, not independent release candidates.

Execution authorized: implement sequentially in the existing test checkout, then perform an independent review and necessary local validation. Later authorizations cover four TEST migrations, dedicated-viewer provisioning/scope changes/cleanup, commit/push, isolated CORS application, both registrations, automatic TEST delivery, and one backup/file recovery preflight. Actual restoration and production remain excluded.

## Read-path inventory

| Routes / DTOs | Policy and filtering boundary | Cache / verification |
| --- | --- | --- |
| health, login, logout, password-change/session | Existing public or temporary-session policy; caller session data only | Auth fixtures; session revision contains no account catalog |
| me, preferences | Caller identity/preferences only | Auth and preference fixtures |
| users, user access, reset, gate settings | Admin-only global access management | Auth/user lifecycle and scope CAS fixtures |
| accounts, totals, purpose overview | Ledger IDs before list/count/valuation; legacy education maps to fund | Account/holdings fixtures |
| account detail, holdings/detail, password reveal | Owning ledger ID before data/secret access; reveal retains gate | Detail and secret route fixtures |
| transactions, balances, holdings, dashboard | Ledger IDs before query pagination, inputs and financial computation | Dashboard/transaction/holdings fixtures |
| portfolio snapshots, optional trend/comparison | Visible account rows, purpose membership, predecessor in same scope | History cache scope/revision; trend fixtures |
| monthly summary | Visible snapshot/account/transaction inputs | Monthly fixtures |
| monthly review narrative/status | Approved shared authored-content exception; writes admin-only | Monthly/access fixtures |
| instruments, FX, prices, Kernel anchors, source metadata | Public references only; private/manual metadata scoped or omitted | DTO disclosure fixtures |
| jobs, backups, provider runs | Safely scoped or account-independent status; deny selected scope where not separable | Maintenance route fixtures |
| error diagnostics and all ledger mutations | Existing admin-only operation policy | Auth/error fixtures |
| spending/accounts | Spending IDs before list | Spending fixtures |
| spending/statements list/detail/preview | Owning spending account; query scope before pagination and metadata | Spending route/DB fixtures |
| spending/rows, filter-options | Spending IDs before totals/options/pagination; source counterparty/free-text exceptions retained | Spending DB fixtures |
| spending/statements/:id/csv or attachment GET | Admin-only originals, including signed URL issuance | Source route fixtures |
| education-reserve and entry details | Whole fund grant, including legacy route mapping | Education fixtures |
| cashflows | Spending IDs plus education flag before SQL aggregation/pagination | Combined query DB fixtures |

All non-GET spending/education operations remain admin-only. Existing route dispatch exposes no other private read families; newly introduced endpoints must be added here before release.

## Local completion evidence (2026-11-01)

- Shared scope contracts, HTTP request-isolation fixtures, real handler authorization/disclosure fixtures, client revision/target-binding/in-flight invalidation fixtures, and isolated account access SQL passed.
- Investment route fixtures verify authorized account/transaction/snapshot filters, visible-only dashboard and snapshot totals, guessed hidden account 404, source-file denial, policy 503, and next-request revision changes. Existing financial suites passed: holdings, holding detail, account detail, dashboard, monthly summary, portfolio trend, portfolio snapshots, and account purposes.
- Spending and education fixture/isolated SQL suites passed. Their scoped query checks cover empty access before options/totals and server-scope intersection with user filters. Backup fixture, precision DB, and complete restore DB checks passed; the latter replays all 51 local migrations into disposable databases and restores 27 tables with exact equality and rollback checks.
- Auth, account-secrets, loading, family-cashflow UI fixtures, typecheck, and build passed. These are local checks; no shared-environment credentials or personal data were used by fixtures. Final log paths remain in the ignored plan workspace.
- Independent whole-change review found and corrected the missing editor opener and stale target-policy reuse. A target-binding regression fixture fails without the new guard and now passes; request-generation fixtures reject responses completing after invalidation. No further concrete material defect was reported by the independent reviewer.
- Implementation adaptation: mandatory request-scoped AsyncLocalStorage carries access to repository boundaries rather than adding optional access parameters throughout financial services. HTTP without an authorized policy fails closed; trusted non-HTTP work remains unrestricted. All HTTP entry points must retain the router wrapper.
- Administrative DTOs fetch scope separately rather than adding complete grant lists to the user list. Existing users without a role receive an explicit validation error if a combined initial role/scope update is attempted; assign their initial role first.
- TEST follow-up completed: four migrations applied with unchanged pre-existing ledger digest; real PostgREST integration and local five-viewport acceptance passed. Subsequently, isolated CORS application, both registrations, automatic API/web/jobs delivery of `37090cf`, deployed real-login responsive/revocation acceptance, and a live version-10 backup/file restore preflight passed under #121. The dedicated viewer was emptied, deactivated, and sessions invalidated after both acceptance rounds. See [evidence](../releases/2026-11-01-account-visibility-validation.md). Production remains pending; no actual restoration occurred.

Additional boundary hardening: SQL scope/access replacement rejects null expected revisions (observed RED missing exception, then GREEN isolated SQL suite). No deferred material review findings remain.
