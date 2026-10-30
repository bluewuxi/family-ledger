# Rules Review and Remediation Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for proportional inline execution after implementation is requested. Follow [Project Workflow](../project-workflow.md); this plan does not authorize commits, pushes, deployment, migrations, or live-data changes. Track the steps below without creating separate plans for each document.

**Status:** Implemented for documentation scope on 2026-10-31. Tasks 1-6 completed; G1-G4 remain open and outside execution scope.

**Goal:** Make the maintained rules internally consistent, operationally safe, and easy to follow, while accurately recording implementation gaps that documentation cannot repair.

**Architecture:** Retain the existing documentation structure and two-role serverless application. Correct each contract at its owning source, replace duplicated explanations with links, and separate repeatable procedures from historical evidence. Preserve product behavior except for explicitly identified proposed contract resolutions.

**Tech stack:** Markdown; existing React/TypeScript, Lambda, Supabase/PostgreSQL, and Corepack/pnpm sources provide evidence. No new framework or dependency is required for the documentation work.

**Spec:** The user's request to re-review the 16 maintained rule documents and produce one detailed plan; [AGENTS.md](../../AGENTS.md), [documentation map](../README.md), and [adopted policy decisions](../decisions/rules-cleanup-decisions.md) constrain execution. The documentation decisions were approved for execution on 2026-10-31; code follow-ups remain outside authorization.

**Review baseline:** `test`, HEAD `549800b19e605596702fe11a94fd95b1c2326c3c`; working tree and index were clean before this plan was created. Evidence is local source evidence, not verification of deployed state.

## Scope and approach

The recommended scope is one documentation-remediation pass, Tasks 1-6. Application, SQL, infrastructure, and installed skills remain outside those tasks. The implementation-gap register below contains concrete follow-up logic in this same plan; those items remain open until their implementation is explicitly requested and verified. Completing the documentation tasks must not be reported as fixing those runtime gaps.

Three approaches were considered: patch isolated sentences, consolidate the current contracts in place, or redesign the rules and product behavior together. In-place consolidation is recommended: isolated patches leave contradictory copies, while a broad redesign would exceed this review's scope. Keep the existing delivery authorization policy, five-viewport acceptance, roles, financial formulas, and deployment gates.

## Review findings and disposition

Priorities describe the risk of following the rule, not a claim that a production incident occurred. P1 needs early attention; P2 is a material contract or procedure inconsistency; P3 is maintenance improvement.

| ID | Priority and finding | Evidence and disposition |
| --- | --- | --- |
| R1 | P1: deployment example prints a decrypted service key; blanket secret rules also contradict the intentional trading-password reveal feature | [Deployment](../deployment.md#secrets), [architecture](../architecture.md#boundaries), root rules, and [trading-password API](../api.md#account-trading-password-api). Remove secret-printing instructions and distinguish infrastructure credentials from the one explicitly gated application-secret response. Task 1. |
| R2 | P2: method/path-based role defaults conflict with actual endpoint exceptions | [Auth](../auth.md#enforcement) says GET is viewer/admin and maintenance is admin-only; the [router](../../apps/api/src/routes/router.ts) has public health, admin-only GETs, viewer-readable maintenance, and two viewer mutation exceptions. The inspected routes enforce roles; this is not evidence of an authorization bypass. Task 1. |
| R3 | P1 implementation gap: legacy financial fields in backups are not uniformly lossless | [Backup numeric policy](../operations/backup-restore.md#exact-numeric-values), [education-era exporter](../../supabase/migrations/20261004090000_add_education_reserve.sql), [NTA wrapper](../../supabase/migrations/20261007120000_kernel_nta_estimation.sql), and [backup repository](../../apps/jobs/src/repositories/ledgerBackupRepository.ts). SQL emits several financial fields as JSON numbers before ordinary JavaScript parsing. Checksums are generated afterward. Task 4 documents the limit; G1 defines the still-open repair. |
| R4 | P2: account-purpose scope differs within API and architecture documents | API's education introduction and account-purpose table disagree; architecture still says account management/family reports cover all purposes. [Account service](../../apps/api/src/services/accountService.ts), [holding service](../../apps/api/src/services/holdingService.ts), [transaction service](../../apps/api/src/services/transactionService.ts), and [monthly service](../../apps/api/src/services/monthlySummaryService.ts) establish the distinctions below. Task 2. |
| R5 | P2 implementation gap: snapshot scope changes with an optimization flag | [Snapshot service](../../apps/api/src/services/portfolioSnapshotService.ts), `getPortfolioSnapshotsResponse`: omitted purpose normally means all account rows, but non-paginated `includeTrend=true` uses investment-only cached history for both `snapshots` and `trend`. Adding pagination takes another path. Do not erase this discrepancy by declaring all paths equivalent. Task 2 records it; G2 defines the recommended repair. |
| R6 | P2: monthly boundary and snapshot-repair date rules disagree | API describes latest earlier month boundaries without the exact-date constraint; data model describes market-price dates for repair; local testing and [audit script](../../scripts/verify-test-snapshots.ts) use calendar dates. [Monthly service](../../apps/api/src/services/monthlySummaryService.ts) enforces exact boundaries and the last completed business date. Task 2. |
| R7 | P2: current chart acceptance still contains superseded sparse-hover rules | [Investment specification](../specs/investment-overview.md#dashboard-composition-and-trends) requires each valid dated point; local testing and data model retain weekly/monthly hover selection. [Dashboard](../../apps/web/src/pages/DashboardPage.tsx) constructs hover dates from the full series. An unused sparse-selection helper is not proof of active behavior. Task 2. |
| R8 | P2: spending-account immutability is overbroad in the opening specification | The [spending specification](../specs/spending.md) first locks identity after any batch, then permits corrections with draft/preview batches. The [suffix migration](../../supabase/migrations/20261001090000_spending_account_suffixes_and_cancellation.sql), `guard_spending_account`, distinguishes completed history from pending batches. Task 2. |
| R9 | P2: validation instructions mix local checks, live identity operations, and mutations | [Local testing](../local-testing.md) includes migration commands and smoke scripts that create Auth sessions; error smoke also persists observations, and transaction smoke sends a duplicate-create probe. These are not uniformly read-only. Task 3. |
| R10 | P2: recovery guidance lacks sufficient preconditions and verification boundaries | [Backup restore](../operations/backup-restore.md) gives an operator loading outline; the dry-run tool checks a file, not a destination database. [Kernel recovery](../operations/kernel-nta-repair.md#recovery) both resumes NTA writers and forbids mixing them with restored legacy values. Make forward recovery, historical cutover, and legacy rollback distinct. Tasks 3-4. |
| R11 | P2/P3: broad RLS and API statements overstate uniformity | Data model says admins can write shared tables, but spending/education revoke authenticated writes and use service-only RPCs; error tables also deny authenticated reads. API's error-code list omits `CONFLICT` and `DEPENDENCY_UNAVAILABLE`; the transaction-type update restriction is under Account Write APIs; old stored-price-only account-detail wording conflicts with staged quote reads. Tasks 1-2. |
| R12 | P3: current rules carry repeated facts and historical acceptance | Repeated viewport lists, formulas, cutover steps, and dated user deferrals create drift. Architecture's requirement to put reusable code in `shared/src/index.ts` also over-specifies file placement. Consolidate ownership without a code refactor or changing past evidence. Tasks 5-6. |

The first review's recommendations are refined here: authentication ambiguity is P2 rather than a demonstrated P1 vulnerability; `Cache-Control: no-store` already exists in [response handling](../../apps/api/src/utils/response.ts); API smoke authentication is not browser acceptance; backup precision is an implementation concern rather than something a prose change can solve. The snapshot fast-path discrepancy, spending exception, RLS qualifications, and secret-reveal exception are additional findings.

## Global constraints and review focus

- Remain on the existing `test` checkout; inspect HEAD/index/working tree again before execution and preserve unrelated changes.
- Use English repository prose and existing Simplified Chinese UI names. No new permissions system, provider, service, scheduler, or financial formula.
- A proposal in this plan does not override a maintained contract. Record approved resolutions in the maintained owners when implementation is requested; do not infer approval from old release evidence.
- Never print or load real secrets, personal statements, or live backups for documentation validation. Use synthetic examples and source inspection.
- Keep implementation, deployment, and authenticated visual acceptance separate. Documentation completion needs no application build or browser login.

Review the following five failure modes explicitly: a public/admin-only GET misclassified by method (Task 1); an option silently changing portfolio scope (Task 2/G2); an old snapshot accepted as a valid month boundary (Task 2); a verification command mutating shared TEST (Task 3); and a valid checksum mistaken for exact source-data recovery (Task 4/G1). Each task has corresponding acceptance checks below.

## Task 1: Clarify secrets, roles, and database access

**Modify:** `AGENTS.md`, `docs/auth.md`, `docs/architecture.md`, `docs/api.md`, `docs/data-model.md`, `docs/deployment.md`.

**Produces:** One consistent permission model and an explicit, narrowly bounded application-secret exception.

- [x] Replace the secret-printing CLI example with a description of backend in-memory retrieval and diagnostics that report only success/failure and safe metadata. Do not substitute another command that prints a value, connection string, verifier, or token.
- [x] Define infrastructure/service secrets (Supabase service key, database credentials, signing material, extra-password verifier) as never returned to clients. Separately permit only the stored account trading password through `POST /accounts/:id/trading-password/reveal`, after active-role and initialized extra-password checks. Admin updates retain the extra-password gate. No general secret-return exception, logs, backups, persistent browser storage, or ordinary read DTOs may expose these values. Preserve existing no-store response behavior; do not claim new rate limiting exists.
- [x] Rewrite Auth enforcement around explicit endpoint permissions: public `/health`; active viewer/admin ordinary reads and sanitized maintenance reads; admin-only users, gate settings, error tracking (including GET), ledger writes, and job triggers; own-preference PATCH and gated reveal are the documented viewer exceptions. Include paused/missing role rejection and existing self-access-change prevention.
- [x] Explain that application admin authority is enforced by Lambda, not a promise of direct SQL table privileges. Describe RLS/grants by protected category: legacy core tables, API-only spending/education writes, service-only RPCs, and admin-only operational errors. Preserve current grants; changing them is separate implementation work.
- [x] Review scenarios against `routes/router.ts` and the error route: anonymous health allowed; anonymous ledger denied; viewer FX read allowed; viewer error read/user management denied; viewer own preferences allowed; reveal without valid extra password denied. This step is a source-backed documentation check, not a live API test.

## Task 2: Reconcile product, API, financial-date, and display contracts

**Modify:** `docs/architecture.md`, `docs/api.md`, `docs/data-model.md`, `docs/local-testing.md`, `docs/specs/investment-overview.md`, `docs/specs/spending.md`; clarify `docs/specs/education-reserve.md` only where source-leg terminology needs precision. Link `docs/time-policy.md` rather than repeating its cutoff everywhere.

**Produces:** A single explicit scope table, exact monthly/repair semantics, and consistent UI acceptance.

- [x] Replace the contradictory purpose prose with the following distinctions. Dashboard, public holdings, monthly investment summary, and portfolio trend use current investment accounts. Account listing/totals and ordinary transactions exclude legacy education, retaining investment and daily-expense accounts. Explicit education history remains read-only where supported. Account detail is account-scoped. New education reserve entries never enter investment snapshots or valuations. Purpose reassignment continues to change historical membership without rewriting persisted snapshots.
- [x] Recommend preserving ordinary snapshot API compatibility: omitted `purpose` means all persisted account rows; explicit purpose filters rows; investment-facing UI requests `purpose=investment`; `trend` is investment-only. State the R5 optimized-path deviation as a known implementation gap until G2 passes. Do not describe a default-scope change as a documentation-only fix. Do not add an API parameter to public holdings merely because an internal helper accepts one.
- [x] Define monthly boundaries as `start = calendar day before selected month` and `end = min(calendar month-end, app business date minus one calendar day)`. Transactions stop at the same end. A selected earlier boundary row retains its date, has unavailable valuation, and emits `SNAPSHOT_DATE_MISMATCH`. The initialization baseline applies only when no earlier snapshot exists and opening entries can be valued; a mismatched existing row must not activate it. One unavailable account must not erase independently known account results.
- [x] Define repair coverage as existing snapshot dates plus every calendar date from first transaction through the last completed app business date for which required NZD/CNY valuation rates exist on or before that date. This is historical audit/repair coverage, not a change to the Tuesday-Saturday scheduled cadence. Include weekends/month ends, preserve as-of input selection, reject future prices/incomplete-day snapshots as the existing script does, and keep missing valuation inputs unavailable. `--from` limits affected dates, not the earlier input history used to calculate them.
- [x] Keep every stored curve point and every valid dated hover point. Exclude synthetic color crossings from tooltips; retain the connected current endpoint and real missing-data gaps. Remove current weekly/monthly hover requirements from local testing/data model; preserve original dated observations as historical evidence. Do not remove unused application helpers as part of this task.
- [x] State the spending identity rule once: existing transaction rows or batches in `committed`, `undone`, or `document` lock format/currency/identity. Draft/preview batches alone allow correction; their preview/token/decisions are invalidated and a new preview is required. Cancelled history alone does not satisfy the current completed-history guard. Keep imported row identity immutable regardless of editable classification/notes.
- [x] Clarify education source-leg examples without introducing automatic pairing: a tracked investment source records a withdrawal that reduces principal and assets together, not an investment loss; an imported daily-bank transfer is excluded from consumption; the education contribution is recorded once. Preserve separate native-currency totals, refund limits, and negative-balance warnings.
- [x] Complete the existing error-code list from the shared `ApiError` union and current HTTP mapping; place the immutable transaction-type rule under Transaction Write APIs. Describe account detail's `quoteMode=cached|refresh` with its current quote/cache fallback; historical snapshots still use stored prices. Consolidate later amendments into their owning endpoint sections rather than leaving conflicting appendices.
- [x] Consolidate existing write/retry semantics without inventing uniform idempotency: education edits/deletes use record versions; spending commit retries require the same token and decisions; identical Kernel actual-anchor retries are idempotent; transaction revision conflicts require refreshed preparation, while an unknown commit outcome requires checking saved records before retry. A generic automatic POST retry is not authorized by these contracts.
- [x] Check concrete examples: investment 100 plus daily cash 20 distinguishes all-account snapshots from investment 100; adding `includeTrend`/pagination must be recorded as R5 until repaired. With app business date `2026-10-30`, October's closing date is `2026-10-29`. A missing September 30 boundary with only September 29 available is unavailable, not a valid October opening. A pending-only spending batch permits correction, while an undone batch still locks identity.

## Task 3: Separate verification from live operations and historical cutovers

**Modify:** `docs/project-workflow.md`, `docs/local-testing.md`, `docs/deployment.md`, `docs/test-auto-deployment.md`, `docs/operations/kernel-nta-repair.md`; move already-recorded historical details into `docs/releases/test-release-history.md` only when they are not already recorded there.

**Produces:** Command-local preconditions and an unambiguous route through existing deployment controls.

- [x] Add a compact command-effect table to local testing; classify by observed behavior, not the words `verify`, `smoke`, or `dry-run`:

| Class | Examples | Required boundary |
| --- | --- | --- |
| Local synthetic/build | focused fixture scripts, typecheck/build | No live credentials/data; normal implementation validation |
| Disposable PostgreSQL | `verify:education-reserve-db`, `verify:spending-db`, snapshot SQL fixtures | Isolated loopback database; never shared TEST |
| Live reads with local output | `verify:snapshot-audit`, `verify-purpose-read-paths.ts`, Kernel repair dry-run | Confirm TEST target; protect local output; external provider requests may occur |
| Live identity/operational activity | `smoke-api-errors-test.ts` | Creates temporary Auth sessions and saves error observations; document scope and cleanup; never substitutes for user-login browser acceptance |
| Attempted financial write | `smoke-transaction-hotfix-test.ts` | Sends a duplicate-create request; expected rejection is not proof of read-only behavior. Do not run under generic read-only verification authorization; use isolated checks by default |
| Live writes/operations | apply-schema scripts, `fix:snapshot-audit`, repair `--apply`, backup invocation, role SQL, deploy/register/bootstrap | State exact side effects and target; use existing applicable authorization, backup, verification, and lock requirements |

- [x] Remove apply commands from routine validation sequences. Keep discoverable links to operator procedures with separate authorization preconditions. Existing push permission covers configured CI/automatic checks; it does not authorize arbitrary new smoke writes, migration application, or bypassing a failed gate. Reuse already-granted authorization within scope rather than asking repeatedly.
- [x] Label infrastructure command blocks as operator/bootstrap/recovery procedures, not an alternative routine TEST delivery path. Remove old mandatory migration bullets as present-tense release instructions; use full-manifest verification/registration as the current gate. Retain historical prerequisites where their historical context is useful.
- [x] Structure Kernel guidance into current repair, historical initial cutover, and recovery. Current repair requires verified schema/API/jobs compatibility, a reviewed dry-run, a protected backup, and authorized apply. Missing schema requires a separately authorized migration procedure. Do not infer current live cutover status solely from code or the old steps.
- [x] Prefer forward retry for pending NTA snapshot work: retain the pending date/token after failure and clear it only for the matching successful token. For a legacy rollback, require an operation-specific reviewed restore mapping, writer/schema compatibility, pending-state handling, and writer quiescence. Remove the contradictory unconditional instruction to resume NTA writers over legacy values. Disabling an instrument target is not proof that an already-running job has stopped; a deployment lock is not a database/job lock.
- [x] Check scenarios: a build request cannot trigger an apply script; a failed automation run cannot trigger manual deployment; a dry-run report does not authorize repair; API smoke does not satisfy browser acceptance; recovery instructions cannot resume incompatible writers. Preserve the five-viewports and real-login handoff exactly.

## Task 4: Make backup and recovery guarantees accurate

**Modify:** `docs/operations/backup-restore.md`, related summaries in `docs/data-model.md`, `docs/architecture.md`, `docs/deployment.md`; record G1/G3 as open in `docs/roadmap.md` without inventing an issue, release, or completed test.

**Produces:** Honest format guarantees, restore preconditions, and measurable recovery acceptance.

- [x] Document current version 7 as implementation state, not proof of the latest live backup. Distinguish single-statement table consistency, post-export checksum integrity, original numeric fidelity, and an actual restore rehearsal. None implies all the others. State that legacy numeric fields are not yet uniformly encoded as exact strings; do not call the whole bundle lossless until G1 is implemented.
- [x] Explain that `migrationHighWaterMark` is a format compatibility floor currently set in code, not a complete attestation of every migration applied to the source database. Select and record a compatible target schema/code revision before restore; use the deployment manifest for release approval. Do not replay historical migrations against a populated live database.
- [x] Define rehearsal steps: keep original file immutable; verify original-version checksums before normalization; use an isolated target with recorded schema version; resolve Auth mappings and schema-created singleton/seed conflicts explicitly; load in dependency order with one transaction and required deferred/self-reference handling; abort on unexpected conflicts rather than silently skipping rows. Keep external statement versions and SSM/Auth recovery separate. Do not claim the existing file dry-run loads a database.
- [x] Define success as matching row identities/counts and exact financial values from a trustworthy source, valid foreign keys/roles, preserved linked cash legs and snapshot structure, and expected holdings/valuation results. If only a legacy numeric JSON backup is available, disclose that source precision already lost cannot be reconstructed by converting numbers to strings. Builds and synthetic tests support code correctness but are not restored-data comparisons.
- [x] Recommend a lightweight operator policy: check backup status before any authorized destructive repair, investigate no success in the preceding 48 hours, and rehearse recovery at least quarterly and after a backup-format change. Mark these thresholds as proposed policy until this plan is approved; they create no automation, notification service, or guarantee of recovery time. Preserve the existing 30-day retention setting.
- [x] Check a synthetic precision example: ordinary JSON numeric parsing changes `12345678901234.123456` to `12345678901234.123` in the local runtime. The decimal-string representation must remain exact. Record this as evidence of the path's risk, not evidence that a particular live balance or backup is corrupt.

## Task 5: Reduce maintenance cost and fill proportional rule gaps

**Modify:** `docs/README.md`, `docs/project-workflow.md`, `docs/frontend-guidelines.md`, `docs/local-testing.md`, relevant specifications; clarify `docs/operations/superpowers.md` only where current versus dated evidence is ambiguous.

**Produces:** Clear ownership and concise, reusable acceptance guidance.

- [x] Maintain ownership: Auth owns access defaults/exceptions; API owns DTOs, parameters, errors, and compatibility; product specs own visible behavior/formulas; data model owns storage/invariants; time policy owns time conventions; local testing owns commands and viewport/login procedure; TEST contract owns deployment gates. Other documents summarize and link. On a material disagreement, report evidence and resolve the affected owner explicitly; source code or a historical record does not automatically override the intended contract.
- [x] Move dated acceptance and user deferrals out of repeatable local-testing instructions. Reuse existing release entries; preserve original date, scope, limitations, and pending acceptance. Do not create new delivery evidence for an undeployed documentation change. Keep historical links working and update incoming references when moving a section.
- [x] Link the canonical five-viewports instead of copying the list repeatedly. Retain the four fixed sizes and require the actual desktop width/height to be recorded; recommend `1440x1000` as a repeatable baseline without changing the existing desktop requirement into an unapproved hard constraint.
- [x] Add a concise forward-looking frontend baseline: labeled inputs, perceivable validation messages, keyboard-operable controls, visible focus, dialog focus entry/return, readable contrast, and explicit loading/empty/failure states. Apply proportionally to changed UI; do not claim existing pages were audited or initiate a redesign from this documentation task.
- [x] Describe `packages/shared/src/` as the home of reusable contracts/calculations, with `index.ts` as the public export surface where appropriate, rather than requiring all implementations in one file. Preserve current module boundaries; no code move is needed.
- [x] Keep Superpowers adaptation in Project Workflow and version/helper evidence in operations. Preserve the dated 15-skill/CLI coverage observations as historical; neither today's catalog nor a readable cache proves new CLI or helper acceptance. Retain proportional planning and actual-tool capability checks. No plugin update, reinstallation, or global model setting change.

## Task 6: Validate the documentation and report remaining gaps

**Files:** All changed Markdown, including this plan; no permanent checker framework is required.

- [x] Recheck branch/HEAD and review working, staged, and new-file contents against the execution baseline. Limit edits to the intended documentation. Verify that no secret, personal source data, or new operational authorization was introduced.
- [x] Check all relative file links and heading fragments in changed files and incoming references to moved sections, using ignored local tooling. Review explicit code/shell references against current files and package scripts. A link checker cannot establish semantic correctness or remote availability.
- [x] Run `git diff --check`; explicitly include untracked Markdown in whitespace/content review because ordinary `git diff` omits it. Review each R1-R12 disposition and the five focus scenarios. Keep unresolved code gaps open in the plan/roadmap.
- [x] Report documentation checks separately from application checks. Typecheck/build and browser acceptance are not applicable to documentation-only execution. If scope later includes G1/G2 code, use their focused tests plus `corepack pnpm typecheck` and `corepack pnpm build`; do not reuse documentation-only completion criteria.
- [x] Mark this plan Implemented only for its stated documentation scope after those checks. Record G1-G4 status individually. Commit/push/issue/deployment remain separately authorized under Project Workflow; documentation-only skip evidence is required only if delivery is subsequently requested.

## Implementation-gap register: retained in this plan, outside Tasks 1-6

### G1 — Lossless backup serialization (open, P1)

Update 2026-10-31: user separately authorized G1 local implementation and verification. Version 8, exporter migration, financial-string validation and isolated round-trip checks are implemented locally. Independent review found legacy aggregate-shape acceptance in v8; it was fixed and covered by regression verification. Online migration, deployment, commit and push remain unauthorized. This heading retains its original anchor; G1 is implementation-complete locally, pending operator migration/deployment. G2–G4 remain open.

Recommended implementation: add a new migration that serializes every authoritative financial numeric field to decimal text in the PostgreSQL export, before PostgREST/JavaScript decoding. Cover transactions, FX, prices, snapshots, quote cache, anchors, spending, and education; preserve nulls, signs, row order, existing precision/scale, and one-statement snapshot semantics. Do not stringify already-parsed JavaScript numbers or apply one universal rounding scale. Update `ledgerBackupBundle.ts`, `ledgerBackupRepository.ts`, and version-aware verification/restore logic to a new format version (next available version, currently 8), without rewriting historical migrations or weakening version 2-7 checksum validation. Reject numeric JSON values for fields required to be strings in the new format. A mismatched new writer/old exporter must fail validation rather than label lossy data as the new format.

Acceptance: an isolated PostgreSQL fixture exports high-significance values through the real RPC/JSON consumer and restores them with exact `numeric` equality; include positive/negative values, zero, nulls, maximum supported field precision, and current-format legacy fixtures. `12345678901234.123456` must survive where the column's declared type permits it. Check service-only RPC privileges, unchanged financial source rows, manifest/version compatibility, and original-version validation before normalization. Extend existing backup/database checks rather than add a framework. Migration application and TEST release require separate authorization, verification, and registration. No claim is made about precision already lost in historical backups.

### G2 — Snapshot option-independent scope (open, P2)

Update 2026-10-31: user authorized local G2 implementation while preserving G1. The fast path now requires explicit investment purpose; other snapshot scopes use their requested repository read and a separately investment-only trend. Regression first reproduced all-account 125 becoming investment-only 100, then passed after the fix. Portfolio-trend/loading/typecheck/build passed. Independent scoped review found no actionable issue; it inspected service/test changes and maintained contracts without live operations. G2 is implemented locally, not deployed; the heading retains its original anchor. G3/G4 remain open.

Recommended target: the `snapshots` array follows the explicit purpose filter, with omitted purpose retaining all-account compatibility; the optional `trend` is investment-only. `includeTrend`, `offset`, and `includeComparison` must not silently change the snapshot membership. In `getPortfolioSnapshotsResponse`, use the investment cached fast path only when its snapshot scope matches the request (for example, explicit `purpose=investment`); otherwise read the requested snapshot scope and build the investment trend separately. Preserve dates, order, limits, comparisons, cache isolation, and existing explicit investment callers.

Acceptance: use synthetic investment/daily/legacy-education snapshot rows and compare plain, trend-enabled, paginated, comparison-enabled, and explicitly filtered requests. Common snapshot IDs/dates must have equal scope totals across equivalent requests; trend remains investment-only. Cover omitted and explicit purposes, default parameters, and cached/uncached execution without live credentials. Extend the existing portfolio/loading verification entry points with a service-level seam if needed. This is a proposed contract resolution; approving documentation work alone must not be treated as authorizing the code change.

### G3 — Current-format full restore evidence (open verification item)

Update 2026-10-31: G3 local synthetic recovery verification completed. Existing G1/G2 code was preserved. The new script replays all 44 real migrations, exercises all 21 nonempty allowlisted tables and a second isolated target, and uses real exporter, gzip bundle, original checksum validation, dry-run CLI normalization and transactional restore. Exact source/target re-export equality plus expected cash/quantity/snapshot values, linked cash, derived anchors, realistic pending Kernel state, Auth/role dependencies and RPC privileges pass. Missing Auth users, corrupt checksums and late-failure rollback are covered. Real S3 bytes, online Auth remapping/provider configuration and SSM recovery remain operator prerequisites, not claimed verified.

The existing dry-run is file validation and normalized-output preparation. Earlier snapshot-cutover documentation records an isolated restore rehearsal; that scoped historical success is not proof of current version-7 end-to-end recovery. First reconcile available evidence with the current format/schema and reuse compatible evidence rather than asserting that no rehearsal has ever occurred. A new full recovery claim requires an isolated restore exercise under Task 4's acceptance criteria, with source/target schema versions, Auth mapping, singleton handling, exact numeric comparisons, S3 version availability, and pending Kernel state recorded. Use synthetic data for automated verification. Any exercise involving a real backup needs the applicable explicit data-access scope and protected local handling. This review did not run a restore or inspect live backup manifests.

### G4 — Extra-password abuse protection (proposed hardening, not a proven bypass)

User decision (2026-10-31): defer G4 because Auth implementation will change substantially. Reassess the threat model and requirements with that redesign; do not implement the earlier lockout proposal now.

Preserve the current active-role plus scrypt gate and no-store responses. Before implementing throttling, decide the attempt budget, cooldown, scope (user/account/IP), recovery behavior, persistence across Lambda instances, and secret-free audit fields. An in-memory-only Lambda counter must not be presented as global protection; shared lockouts can themselves deny family access. No WAF, database table, or lockout policy is added by this plan's documentation tasks. Record this bounded open decision rather than inventing a security guarantee.

## Document coverage

| Reviewed source | Planned treatment |
| --- | --- |
| [Project workflow](../project-workflow.md) | Command effects, rule ownership, proportional execution; retain adopted delivery authorization |
| [Architecture](../architecture.md) | Correct scope and secret exception; shared-module wording |
| [Auth](../auth.md) | Explicit endpoint exceptions and gate boundaries |
| [API](../api.md) | Scope, monthly dates, error codes, quote modes, misplaced rule, R5 limitation |
| [Data model](../data-model.md) | Repair dates, RLS categories, hover duplication, backup precision limit |
| [Frontend guidelines](../frontend-guidelines.md) | Proportional accessibility/state baseline and canonical links |
| [Time policy](../time-policy.md) | Retain cutoff/provider/calendar semantics; reference from corrected contracts |
| [Local testing](../local-testing.md) | Side effects, current acceptance, historical separation |
| [Deployment](../deployment.md) | Remove secret printing; clarify operator commands and historical migrations |
| [TEST automatic deployment](../test-auto-deployment.md) | Retain existing gates; clarify procedural links without relaxing controls |
| [Investment overview](../specs/investment-overview.md) | Preserve daily movement, profit, full-curve/daily-hover contracts |
| [Spending](../specs/spending.md) | Resolve identity-lock exception and historical cutover wording |
| [Education reserve](../specs/education-reserve.md) | Preserve arithmetic/domain separation; clarify source-leg example if needed |
| [Superpowers operations](../operations/superpowers.md) | Preserve dated coverage and compatibility ownership; no tooling changes |
| [Backup restore](../operations/backup-restore.md) | Fidelity limits, schema compatibility, restoration proof, operator policy |
| [Kernel repair](../operations/kernel-nta-repair.md) | Separate initial cutover, forward repair, and compatible rollback |

## Review and planning evidence

- Re-read maintained contracts and checked relevant route/service/repository/migration/UI sources. No live authentication, database, SSM, provider, deployment, or browser operation was performed.
- A local synthetic JSON-number round-trip reproduced precision loss for `12345678901234.123456`; no real financial value was used.
- The plan keeps one bounded documentation workflow and explicitly open implementation/evidence items. No recommendation is represented as already implemented or previously approved.
- Plan self-review checked all 16 requested sources, R1-R12 task coverage, the five failure scenarios, proposed versus established behavior, exact source symbols, and authorization boundaries. G1/G2 remain implementation gaps, G3 requires scoped evidence, and G4 is a hardening proposal; none is claimed resolved.
- Local Markdown validation scanned 30 tracked/new Markdown files and 248 relative links, including heading fragments: zero link errors. The new plan also passed explicit trailing-whitespace/final-newline checks. `git diff --check` passed; the plan was inspected separately because it is untracked and omitted by ordinary diffs.
- Only this plan was added to the version-controlled document area; the checker is ignored local scratch. Application typecheck/build, authenticated visual acceptance, and deployment were not required or performed for this planning-only change.

## Documentation execution evidence — 2026-10-31

Tasks 1-6 completed on the existing test checkout. The starting HEAD and index were unchanged; the pre-existing untracked plan was updated in place. All tracked changes are Markdown. Time policy semantics were reviewed and retained; no cutoff, schedule, financial formula, permission implementation, or application code was changed.

- R1-R12 have documented dispositions in their owning contracts. G1/G2 remain code defects to repair, G3 remains a current-format evidence verification item, and G4 remains proposed hardening. They are recorded in the roadmap and this plan, not claimed fixed.
- Independent whole-scope review inspected the working diff and untracked plan, maintained sources, and the five focus scenarios. It found command-local smoke authorization/nonmutation wording (P2) and incomplete historical-context migration (P3). Both were corrected: the two smoke instructions now describe actual side effects and required scope; API-error deferral and account-detail observations retain feature/date context in historical evidence. No finding was parked.
- Link/anchor validation passed across 30 tracked/new Markdown files and 281 local links; git diff --check passed. The untracked plan received explicit whitespace/final-newline review. Source review verified role exceptions, monthly boundary and calendar-repair semantics, spending identity states, current chart hover behavior, and the snapshot optimization limitation.
- Documentation-only validation follows Project Workflow instead of artificial TDD or application build checks. No application tests/build, browser acceptance, live reads/writes, restore rehearsal, plugin changes, issue creation, commit, push, or deployment was performed.
- Implementation: documentation complete. Deployment: not requested. Visual acceptance: not applicable to these changes. Open follow-ups remain G1-G4; completing this plan does not imply their resolution.

G1 verification: the new rejection regression failed before implementation and passes afterward; backup verification and isolated PostgreSQL precision tests passed. Final `corepack pnpm typecheck` and `corepack pnpm build` passed; local Markdown link/anchor validation and git diff --check passed. The reviewed v8 legacy-shape rejection regression passes after the fix. No live backup was inspected; the DB fixture proves the new wrapper against a synthetic predecessor, not every historical exporter or full-ledger restore.

G2 completion evidence (2026-10-31): scoped regression demonstrated RED (125 all-account versus 100 investment-only) before the condition fix, then GREEN across omitted/investment/daily-expense/education purposes, trend/pagination/comparison combinations, latest ordering, predecessor boundaries and bypass forwarding. Existing loading verification passed for cache identity/deduplication/invalidation. Final typecheck/build, G1 backup verification, Markdown link checks (30 files/281 links) and diff checks passed. Existing G1 changes remain present; no G1 source was edited in this task. No commit/push/deployment/online migration or authenticated visual acceptance was performed. G2 needs no schema migration; G1 migration and both deployments remain pending.

G3 review evidence: independent scoped source review identified five empty-table fixture categories and a stock instrument used for pending Kernel state. Added nonempty document/quote/monthly/job/provider fixtures, enforced every table nonempty, and used the actual Kernel target. The corrected full recovery check passed. No live environment or data was accessed, and no commit/push/deployment/online migration was performed. The restore-order constant was extracted unchanged for shared CLI/verification use.

G3 final verification: `corepack pnpm verify:backup-restore-db` passed with every table asserted nonempty; missing-Auth failure specifically matched foreign-key rejection and late-failure injection specifically matched division by zero, followed by zero-row assertions for every target table. Backup and portfolio-trend regression, typecheck, build, Markdown link/anchor checks and git diff --check passed. Earlier G1/G2 application source changes were preserved. Evidence is synthetic current-format recovery, not proof of external/live disaster recovery readiness.
