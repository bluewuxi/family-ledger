# Historical TEST Releases

This record preserves release evidence and one-time procedures from 2026-09-06 through 2026-10-26. Statements about environment contents, backup formats, permissions, and outstanding checks apply to their dated scope. Commands below are historical context, not a current deployment checklist or authorization to repeat a cutover. Use [current deployment guidance](../deployment.md), the [TEST contract](../test-auto-deployment.md), and [project workflow](../project-workflow.md) for new operations.

## Automatic TEST delivery commissioning (2026-10-26)

Enabled on 2026-10-26 under issue #113. Commit `285647ead75168d06fe97725d2be80543839dd3d` passed the [first complete automatic release and identical-commit retry](https://github.com/bluewuxi/family-ledger/actions/runs/40244295679). CloudFormation reached `UPDATE_COMPLETE`, Lambda readiness and CloudFront invalidation completed, and live health, unauthorized rejection, public configuration, HTML and JS/CSS entry-asset checks passed. The retry reported unchanged backend artifacts and produced the identical combined artifact digest `bf05fc84796fad47378bfd5063e7de59c6b0fa1115c739e99d3b767bed98cc30`. Push deployment remains enabled. Typecheck, build, core business checks and deployment policy/publication tests passed in GitHub on Node 22.

Bootstrap verification confirmed template/parameter parity and database readiness: exact bodies for 36 current migration-defined functions, absence of three retired functions, a valid unique opening-balance index and restricted price-RPC execution. No historical migrations were replayed or financial rows modified. Eight IAM boundary simulations confirmed that deployment credentials cannot read server secrets, write approvals, deploy production or manage their IAM permissions.

Independent bootstrap changes stabilized invocation-policy and API integration references without changing effective IAM permissions, the resolved OpenAPI definition, live integration settings or the four schedules. The automatic execution role has no IAM/API/DNS/runtime configuration writes. CloudFormation validation/reference reads and access to existing rollback code packages are scoped to existing resources. Completed update rollback and subsequent recovery were exercised during commissioning; the workflow does not automatically roll back a failed application smoke check. Authenticated visual acceptance remains separate; this delivery changed no application UI. Production was not deployed.

## Test transaction balance hotfix (2026-10-12, issue #112)

Applied `202610120002_single_account_opening_balance.sql` after confirming no existing duplicate opening balances. The partial unique index is valid; no financial records were rewritten. Committed and pushed the API/web hotfix to `test`, reviewed a non-replacing CloudFormation change set, and deployed infrastructure and web assets. CloudFormation reached `UPDATE_COMPLETE`, the API Lambda update was successful, and CloudFront invalidation completed. Live checks confirmed health, unauthorized rejection, viewer/admin balance access, Hong NZD cash balance `80094` matching account detail, and HTTP 400 `VALIDATION_ERROR` for a duplicate opening balance. Stage-one database readiness passed. Typecheck, build, focused transaction balance checks and disposable PostgreSQL index tests passed. Browser/mobile verification was skipped at the user's request. Production was not deployed.

## Total-assets daily ratio and connected live curves (2026-10-08, #108)

Historical implementation boundary from the [investment overview specification](../specs/investment-overview.md): the 2026-10-08 snapshot-maintenance scope added no database tables, migrations, historical rebuild, snapshot editing, or repair controls. Subsequent loading-performance work was a separate scope.

Implementation commit `6511c76` was pushed to `test`. The reviewed change set had no deletions or replacements; scheduler changes were target dependency references without schedule-expression changes. The change set was executed directly, CloudFormation reached `UPDATE_COMPLETE`, API Lambda was active with a successful update, web deployment succeeded, and CloudFront invalidation completed.

Daily movement eligibility is unchanged, but its percentage now divides by current total investment assets, including cash and instruments excluded from the numerator. Both trend tabs use connected color-aware curve series for the live endpoint; regression fixtures cover same-day saved close/live pairs, zero crossings, and actual gaps. At delivery these contracts were recorded in AGENTS.md, the API documentation, and the investment overview specification; their current maintained owners are the [investment overview specification](../specs/investment-overview.md#dashboard-composition-and-trends) and [API documentation](../api.md#dashboard-read-api). This supersedes the denominator introduced in #107.

Typecheck, full build, dashboard, portfolio-trend, time-policy, and database-readiness checks passed. A server-side diagnostic using test data returned total assets CNY `5201534.46`, daily movement `35340.28`, and the corrected percentage `0.68`; quotes can change between diagnostic runs. Live HTML/runtime configuration and all six entry assets matched the local test build. API health returned HTTP 200, and unauthenticated dashboard requests returned HTTP 401. Authenticated responsive visual checks remain deferred at the user's earlier request; chart verification here is fixture-based, not browser visual acceptance.

## Trading-day movement correction (2026-10-08, #107)

Implementation commit `16e69a1` was pushed to `test`. The reviewed change set had no deletions or replacements; scheduler changes were target dependency references with unchanged schedule expressions. The change set was executed directly, the stack reached `UPDATE_COMPLETE`, API Lambda was active with a successful update, web assets were deployed, and CloudFront invalidation completed.

Typecheck, full build, dashboard verification, time-policy verification, and the read-only database readiness smoke check passed. Live HTML, runtime config, and all six entry assets matched the local test build; API health returned HTTP 200 and unauthenticated dashboard requests returned HTTP 401. A server-side service diagnostic against test data returned CNY daily movement `-8043.72` and percentage `-0.75`, excluding September 30 Chinese quotes and October 6 NZ fund data under the new eligibility rule. This diagnostic refreshed the ordinary dashboard quote cache but did not mutate investment ledger data. Authenticated responsive UI verification remains deferred at the user's request.

## Dashboard display hotfix (2026-10-08, #106)

Implementation commit `41dac5e` was pushed to `test` and released using `deploy:web:test`. This frontend-only release rounds dashboard monetary totals, restores vertical chart cursors and daily tooltips, and bounds recent trades to the trend panel height with a persistent full-history link. No API, job, schema, or infrastructure deployment was required.

Typecheck, full build, portfolio-trend verification, and dashboard verification passed. CloudFront invalidation completed. Live entry HTML, runtime configuration, and all six referenced JS/CSS assets matched the local test build byte-for-byte; API health returned HTTP 200. Authenticated responsive visual verification was deferred at the user's request.

## Education reserve release procedure

Historical procedure for the completed 2026-10-04 release (#101). Do not replay it as a current deployment checklist. New migration/data operations require separate authorization and the current TEST deployment gates.

The 2026-10-04 education release uses additive migration `20261004090000_add_education_reserve.sql`. Existing education accounts start with an inactive logical fund; fresh empty installations initialize an active fund. No old accounts, transactions, or snapshots are deleted.

1. Inspect test data and create a complete version-5 pre-migration backup with checksum/restore dry-run verification. Retain a private reviewed seven-record mapping under ignored `tmp/education-reserve/`.
2. Apply the additive schema using `corepack pnpm apply:education-reserve-schema:test`. This includes the expanded atomic backup export; existing education writes remain unchanged while the fund is inactive.
3. Validate and review the implementation, create the GitHub issue, commit to `test` referencing it, and push. Deploy API, jobs (including version-6 backup handling), and web using the normal change-set/infra/web workflow. Verify runtime config and assets.
4. Run `corepack pnpm migrate:education-reserve:test -- --backup <verified-backup.json.gz> --mapping <private-mapping.json>` for a dry run; add `--apply` for atomic cutover. The script compares protected rows to the backup and again under its account/transaction lock. Changes since backup require a new backup/review. Reruns on an active fund verify provenance and create no duplicates.
5. Reconcile seven migrated records and exact native balances/spending, verify protected account/transaction/daily/snapshot rows are unchanged, take a version-6 post-cutover backup, and verify restoration. Check endpoint health and unauthorized access boundaries. Close the issue after successful deployment verification.

Restore both reserve tables with deferred self-reference checks in one transaction; do not disable legacy guards in normal operation. Reverting application code does not undo education cutover. Before any rollback, preserve new entries and reconcile them; never delete them or re-enable legacy writes without a reviewed recovery plan. Authenticated responsive acceptance for this release subsequently passed at all five required sizes; see the [completed release record](#education-reserve-and-shared-cashflow-release-2026-10-04).

Production deployment uses SAM/CloudFormation templates under `infra/aws` when explicitly run.

### Snapshot view verification — 2026-09-22

The initial additive account-purpose/header/view migration was applied to the test database. All 119 snapshots (2026-05-22 through 2026-09-21) passed exact USD, percentage, FX, metadata, timestamp and warning-multiset comparison in one read-only repeatable-read transaction. All 952 account snapshot rows had headers. No empty snapshots or populated legacy NZD aggregate columns existed in this dataset. A rolled-back source metadata update verified header synchronization. The original aggregate table and writer remained in place during this phase.

### Test cutover completed — 2026-09-23

The staged rollout first kept synchronized headers and `portfolio_snapshots_v` alongside the original table, then performed the separately verified cutover below. This summary was relocated from the architecture document; it records the original rollout, not a new operation.

After a five-hour pause, fresh verification included the newly written 2026-09-22 snapshot: all 120 snapshots and 960 account rows passed exact parity. A new ledger backup and public-schema archive were taken and validated; the archive was restored and the cutover rehearsed locally before applying it to test. Compatible API/jobs/web code was deployed first, with the destructive migration released separately.

The transaction committed successfully. `portfolio_snapshots` is now an invoker-security view, account rows reference headers, and no active database function writes aggregate rows. Post-cutover header and account-row hashes exactly matched the fresh restored backup, including IDs and timestamps. Repository reads covered all 120 dates; the authenticated local dashboard loaded without a server error. The deployed test API health and web runtime configuration passed checks. A new version-2 backup passed restore dry-run validation.

Pre-cutover backup objects under the test backup bucket:

- `backups/test/2026/09/23/family-ledger-test-2026-09-23T00-29-19-379Z.json.gz` (content SHA-256 `26078fd15d43320f92f8d737dcbc369e93fa1c8ffe4388bde5925270d114449b`).
- `backups/test/2026/09/23/pre-cutover-public-75133348.dump` (archive SHA-256 `751333482AD54C7024A768F18FA614F79C93F72C690A557B1161CC179EF2FFA2`).

Atomic retries, concurrent writers, permission enforcement, cascade behavior, edge-case aggregation, and failed-parity rollback were exercised in isolated restored databases. UI checks covered 320×740, 393×852, 430×932, 768×1024, and desktop; real account edits were not saved for testing. Typecheck, build, and focused purpose, snapshot, dashboard, trend, account-detail, backup, and time-policy checks passed. Production was not deployed.

### Separate snapshot cutover release

The `test` branch deploys only to test, which contains real data. There have been no production releases.

The procedure below records the completed one-time cutover. Do not rerun it on the current test database. Future routine restore rehearsals use post-cutover version-2 backups as specified in `docs/operations/backup-restore.md`; version-1 backup restoration is outside operational scope.

1. Apply the additive migration with `psql -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20260922090000_add_account_purposes_and_snapshot_view.sql`.
2. Run `scripts/verify-portfolio-snapshot-view.sql`. Any exact mismatch blocks cutover; investigate without overwriting historical valuations.
3. Deploy compatible API/jobs/web code first. Reads use stored headers and account rows; the RPC name stays unchanged. Backup code accepts the legacy export and retains its aggregate/NZD rows until cutover.
4. Create and validate a fresh S3 ledger backup and a public-schema `pg_dump` archive. Rehearse restoration and the cutover in an isolated database. Auth is an external dependency; local rehearsals use minimal Auth fixtures, not real password/session data.
5. Run the separate `20260922091000_cut_over_derived_portfolio_snapshots.sql` using `psql -X -v ON_ERROR_STOP=1 -f ...`. Its explicit transaction locks all three snapshot relations, synchronizes headers, checks exact parity and account integrity, redirects the FK, replaces the RPC/export, drops only the original table, and renames the view. Lock timeout or any assertion/dependency failure rolls everything back. Never use broad `CASCADE`.
6. Confirm view reads, header FX reads, backup export, and absence of aggregate writes. `NOTIFY pgrst` refreshes schema metadata. Run writer/retry/concurrency/permission fixtures only in the isolated restored database; do not regenerate real historical valuations as a smoke test.

Rollback after a committed cutover requires an operator-reviewed restore from the pre-cutover archive, reconciling any newer writes. Do not drop the view and reload an older backup blindly.

## Spending statements rollout (historical: 2026-09-24)

The spending migration and PDF infrastructure were deployed to test on 2026-09-24 under issue #90. Rollout order: fresh backup, `20260923090000_add_spending_statements.sql`, then infrastructure/API/jobs and web deployment. The new backup exporter must be present before the version-3 backup job runs. Hash checks confirmed investment accounts, instruments, transactions, and monthly reviews were unchanged by the migration.

`StatementBucket` is a separate generated-name private S3 bucket with AES256 encryption, public access blocked, TLS-only access, versioning, and Retain deletion/replacement policies. The API receives its name through `STATEMENT_BUCKET_NAME`; deployment does not require hard-coded bucket names. Upload CORS allows the configured web origin and the local development origin. CloudFront CSP `connect-src` allows this bucket's HTTPS regional domain for presigned CSV/PDF uploads; this policy change requires infrastructure deployment, not just a web build. After deployment, reload the page and verify that preview uploads are no longer blocked by CSP. IAM grants object upload/read/version-read for the statements prefix, with no delete permission.

Signed PDF upload and read URLs expire after five minutes. Signed uploads bind exact file length, type, and checksum metadata; the API verifies a maximum 10 MiB, PDF signature, and SHA-256 before linking the returned object version. Replacement and unlinking retain old objects; no lifecycle expiration is configured for this bucket. Database backup does not copy PDF bytes. Restore requires retaining this bucket and its versions (or separately copying/remapping the objects into the replacement environment).

After rollout verify viewer/admin access, manual entry/query totals, PDF upload/view/replacement, version-3 backup, and the authenticated mobile checks. Do not use the supplied personal statement as seed/test data.

The original spending migration used the previous specification: it stores no balances or reconciliation fields and uses an explicit is_spending flag for totals. It was revised before its first deployment and creates the three new business tables without altering existing investment tables.

Test rollout evidence: CloudFormation reached `UPDATE_COMPLETE`; the reviewed change set had no resource removals or replacements. Live authenticated checks passed for CRUD, duplicate rejection, inclusion defaults/overrides, totals across pagination, completion reopening, viewer write protection, and signed PDF upload/read/replacement/unlink with invalid-file and size rejection. Temporary ledger records and Auth users were removed; synthetic PDF versions remain under the retention policy. Web runtime configuration and the spending route returned successfully. Authenticated browser checks remain skipped at the user's request.

The pre-migration version-2 backup was generated at `2026-09-24T00:15:49.846Z`; the post-deployment version-3 backup at `2026-09-24T00:22:39.640Z`. Both passed restore dry-run validation. Production and personal-statement import were not part of this rollout.

## CSV import redesign rollout (completed 2026-09-27)

The new code requires `20260926090000_redesign_spending_imports.sql`. This migration locks/checks all three spending tables are empty, then replaces their schema and RPCs in one transaction. It fails if any records exist. No backfill or old spending-data conversion is implemented. Existing investment tables are not altered. Preserve the applied original migration file.

This is a breaking spending API/schema cutover. On an authorized release: validate and back up, stop old spending writes, confirm emptiness, apply the new migration (which refreshes PostgREST), deploy compatible API/jobs/web and the S3 lifecycle changes, then verify before allowing personal imports. The backup job must use version 4 after the new exporter is installed. Old nonempty spending backups are rejected; empty historical spending tables need no conversion. Do not change the shared schema solely for local UI testing while the old API is deployed.

New uploads use `statements/pending/`: current and noncurrent versions expire after seven days; abandoned multipart uploads after one day. Previews expire after 24 hours. Successful confirmation copies an exact version into the retained `statements/<batch>/` prefix before linking it. Confirmed/unlinked copies remain retained, including rare copies left by a failed database commit. The API has no delete permission. CSV and PDF bytes are not included in database backups; retain the bucket/versions separately.

Verify all three bank layouts and encodings with anonymous files, CN versus NZ date interpretation, permissions, exact-version storage, import retry/undo, classification/chart totals, version-4 backup restoration and authenticated mobile layouts. Released to test on 2026-09-27 under issue #91. The empty-table guard passed; schema/API/jobs/web and pending-object lifecycle were deployed. CloudFormation reached UPDATE_COMPLETE. Health, unauthenticated access rejection, runtime configuration and all current web entry assets passed. Fresh pre-release version-3 and post-release version-4 backups passed payload/checksum validation; investment account, instrument, transaction and monthly-review checksums were unchanged. Remaining UI/mobile and personal CSV import acceptance will be performed by the user, who requested skipping further UI checks. No personal files were imported.

## Spending suffix/cancellation release: fresh re-import (completed 2026-10-01)

The user-authorized reset and release completed in test under #96 (implementation commit fc17648). Before deployment, a fresh deployed-job backup was downloaded and checksum-validated; the API was temporarily paused and in-flight requests allowed to finish. The reset removed 941 imported rows and 5 import batches, retaining all 3 spending accounts. No manual rows or standalone PDF document batches were present. Protected account/investment table hashes were unchanged within the reset/migration transaction. This reset is complete; do not repeat it for a routine deployment.

During the authorized deployment window, stop spending writes and capture a recoverable database backup. Record the import batch IDs, delete statement_rows linked to those CSV import batches, then delete their account_statements history (including pending/cancelled/undone batches). Preserve spending_accounts, manual rows with null statement_id, standalone PDF document batches, and all investment data. Perform the database cleanup transactionally and verify no CSV import batches or imported spending rows remain, then apply the additive migration and deploy matching API/jobs/web. Verify that previously used CSV hashes no longer block re-import.

Original private S3 objects remain retained under the existing policy; do not delete source versions as part of this database reset. They will no longer be linked from cleared history. Do not run cleanup during local development or as an unrequested production action.

Release verification: CloudFormation reached UPDATE_COMPLETE; API concurrency was restored. Schema/suffix fields/cancel RPC, empty imported rows/history, health, unauthenticated read/write rejection, runtime configuration and current web entry assets passed. Pre/post backups both passed version-4 checksum and restore dry-run validation; spending accounts, investment accounts, instruments, transactions and monthly reviews had identical pre/post checksums. Authenticated UI/mobile checks remain pending user login. Production was not changed.

Recoverable backups from this release (private backup bucket):

- Before reset: `backups/test/2026/10/01/family-ledger-test-2026-10-01T06-43-47-695Z.json.gz` (payload file checksum `817b73a883909794a84ba2c9371c6337a6680577271a338248ec677e8065ef37`).
- After deployment: `backups/test/2026/10/01/family-ledger-test-2026-10-01T06-47-51-938Z.json.gz` (payload file checksum `c7843f708e2e152a2e40f7270b205fd27e2d98c44a3d92544ee619cea35b18d4`).

### Test Kernel market-data release (2026-10-02)

The Kernel S&P 500 (Unhedged) market-data source was released to test under issue #97. The additive migration created the disabled `KERNEL_SP500_UNHEDGED` NZD PIE instrument, the anchor table, estimated-price provenance, the atomic anchor RPC, and updated backup and price-selection functions before the matching API/jobs code was deployed. CloudFormation reached `UPDATE_COMPLETE`, the API and price-job Lambda updates succeeded, and the web runtime configuration and health endpoint passed.

The initial rollout saved Kernel unit price `6.67` on `2026-09-30` against the same-date raw `USF.NZ` close `23.7959995270` NZD and produced an estimated `2026-10-01` price of `6.6422506514` NZD. Subsequent comparison with additional Kernel observations and official USF NTAs showed that Kernel's date follows the US trading date and must align with the following NZX session. The same-date baseline and its derived estimate were therefore superseded by the alignment hotfix documented below. Responsive UI verification was skipped at the user's request. Production was not changed.

The recoverable pre-migration version-4 backup is `backups/test/2026/10/02/family-ledger-test-2026-10-02T03-06-57-162Z.json.gz`. The post-release version-5 backup is `backups/test/2026/10/02/family-ledger-test-2026-10-02T03-14-42-537Z.json.gz`; checksum validation and restore dry-run passed with one Kernel anchor, one exact Kernel price, and one estimated Kernel price.

### Kernel proxy-session alignment hotfix (2026-10-02)

The test environment received the issue #98 alignment hotfix after comparison with additional Kernel observations showed that a Kernel valuation date corresponds to the following New Zealand morning's NZX session. Migration `20261002120000_align_kernel_proxy_dates.sql` and matching API, job, shared, and web code were deployed. CloudFormation reached `UPDATE_COMPLETE`, the price-job Lambda update completed successfully, the CloudFront invalidation completed, the live health endpoint returned HTTP 200, and the stage-one database smoke check passed. Production was not changed.

The append-only legacy `2026-09-30` / `2026-09-30` anchor remains for audit history. A corrected winning revision stores Kernel unit price `6.67` for valuation date `2026-09-30` with the `USF.NZ` raw open `23.6000003815` from proxy session `2026-10-01`. Rebaselining removed the invalid same-date-close estimate and stored `6.7545054467` for Kernel valuation date `2026-10-01`, derived from the `2026-10-02` proxy-session open. Automatic updates are enabled for `KERNEL_SP500_UNHEDGED`.

A manual deployed `update-prices` invocation recorded `Kernel Estimate (USF.NZ)` as succeeded with one unchanged row skipped and no provider error. Yahoo Finance and FundRock also succeeded. The overall invocation was marked failed only because Eastmoney returned `fetch failed`; no Kernel data was rolled back or corrupted, and the existing scheduled retry policy remains applicable to that independent upstream failure.

The pre-hotfix version-5 backup is `backups/test/2026/10/02/family-ledger-test-2026-10-02T08-21-09-176Z.json.gz` (3,940 rows; content SHA-256 `14192625a7b1b018f4ab6b1fb0a9943abda95898f9625fa61aedec6de86fda52`). The post-deployment version-5 backup is `backups/test/2026/10/02/family-ledger-test-2026-10-02T08-35-55-606Z.json.gz` (3,951 rows; content SHA-256 `97408ae70a9a03e8ca78c78b0e207d2d1d0887265562dd8714f5cd71254c509b`); its object metadata, payload checksum, primary-key checks, internal-reference checks, and restore dry-run passed. Responsive browser verification was skipped at the user's request.

### Education reserve and shared cashflow release (2026-10-04)

Issue #101 was deployed to test after explicit authorization. The additive education schema was applied before API/web deployment; CloudFormation reached `UPDATE_COMPLETE`. The reviewed migration then copied all seven legacy entries and activated the logical fund. The original account, transactions, daily data, instruments, and snapshots were retained with protected-row comparisons passing. A repeat migration made no duplicate entries. Education totals reconcile exactly to CNY 2,109,800.62 remaining and CNY 90,199.38 net education spending.

Typecheck, build, focused education and isolated PostgreSQL concurrency checks, spending, purpose isolation, holdings, monthly-summary, time-policy, and backup verification passed. Deployed runtime configuration, current entry assets, health, and unauthenticated education/cashflow rejection passed. After the user logged in locally, education and daily-spending layouts passed at 320x740, 393x852, 430x932, 768x1024, and 1440x1000. Education filters retained lifetime totals; the combined report separated domains and excluded reserve transfers from consumption. No records were changed during browser acceptance.

The pre-cutover version-5 backup is `backups/test/2026/10/03/family-ledger-test-2026-10-03T22-16-22-928Z.json.gz` (3,989 rows). The deployed backup Lambda successfully produced the post-cutover version-6 backup `backups/test/2026/10/03/family-ledger-test-2026-10-03T22-43-55-756Z.json.gz` (3,998 rows). Both passed checksum and restore dry-run verification. Production was not changed.

### Family cashflow and transaction UI release (2026-10-06)

Issue #103 was deployed to test from implementation commit `dbd25b6`. The reviewed CloudFormation change set had no removals or replacements; the stack reached `UPDATE_COMPLETE` and CloudFront invalidation completed. Live runtime configuration matched the deployment output, all current entry assets returned HTTP 200, API health returned HTTP 200, and unauthenticated education, cashflow and transaction reads returned HTTP 401.

Typecheck, build, family cashflow URL/filter checks, spending, education reserve, transaction table, time policy and backup verification passed. Authenticated read-only local acceptance covered all five required viewport sizes. The verified backup and protected ledger comparisons are recorded in the local acceptance evidence; restore dry-run was not an actual database recovery rehearsal. No database migration, financial record writes or production deployment were performed.

### Investment overview performance and trend release (2026-10-08)

Issue #105 was deployed to test from implementation commit `b15def0`. The [consolidated specification](../specs/investment-overview.md) includes the final one-year profit default, profit/assets tabs, full curves with sparse interactive nodes, trend beside recent trades, shared cumulative investment performance, and read-only snapshot browsing in data maintenance. API, data-model, local-testing, and roadmap documentation were reconciled with the merged behavior.

The reviewed change set contained no deletions or resource replacements. Scheduler changes concerned dependency references; schedule expressions were unchanged. CloudFormation reached `UPDATE_COMPLETE`, API/jobs deployment succeeded, the web release completed, and CloudFront invalidation completed. Live runtime configuration and entry HTML matched the test build; all six current JS/CSS assets matched the local output byte-for-byte. API health returned HTTP 200. Unauthenticated dashboard, holdings, and paginated snapshot-comparison requests returned HTTP 401 with `UNAUTHORIZED`. The read-only stage-one database readiness check passed.

Typecheck, build, holdings, dashboard, dashboard-quote-timeout, portfolio-trend, portfolio-snapshots, account-purposes, and time-policy verification passed. Authenticated local dashboard acceptance covered all five required viewport sizes, tab/range retention, sparse node interaction, and existing colors. Separate authenticated holdings/snapshot-tab acceptance and a logged-in deployed browser check are not claimed. No database migration, historical rebuild, financial ledger mutation, or production deployment was performed.

## API Error Tracking and Log Retention

Apply `202610120001_api_error_tracking.sql` before deploying the error-tracking API/UI. The API receives `API_ERROR_LOG_GROUP` from the template; its CloudWatch read policy grants only `logs:FilterLogEvents` on the current environment's API group. The frontend uses the existing API/auth configuration. Local CloudWatch checks require an explicitly configured log group/region and AWS read credentials; no fallback redirects to another environment.

`ProjectLogRetention` manages all six explicitly named project Lambda log groups (API, four scheduled jobs and the retention helper) with `RetentionInDays: 30`. The helper creates missing groups and updates existing groups idempotently, avoiding same-name CloudFormation resource conflicts or a manual import. Delete requests preserve groups and their policy. The helper role is restricted to these exact names. The template applies independently to test/prod and does not touch unrelated account log groups. Future project log groups must be added to the target list and IAM resources.

A read-only inventory on 2026-10-12 found five existing test Lambda groups in the configured region, all without retention. No prod groups were found in that inventory. Issue #109 subsequently deployed implementation commit `11ceee1` to test: the additive migration and API/jobs/web release succeeded, CloudFormation reached `UPDATE_COMPLETE`, and all six test groups were verified with `retentionInDays=30`. The reviewed change set contained no deletions or replacements. Production was not deployed. AWS expires older logs asynchronously; expired raw logs cannot be restored through the UI, while saved handling summaries remain available. There is no automatic CloudWatch scan or notification job.

Apply the test migration using `corepack pnpm exec tsx scripts/apply-api-error-schema.ts`; it skips an already-installed schema and checks tables, functions and access restrictions. Live error API checks use `corepack pnpm exec tsx scripts/smoke-api-errors-test.ts`: no email is sent; temporary test admin/viewer sessions are closed locally afterward. The check observes one CloudWatch page and reads summaries/details without editing handling states. Health, unauthorized rejection, viewer rejection, admin query and event-detail reads passed. Stage-one database readiness also passed. Authenticated browser layout verification was deferred by the user.

CloudFront invalidation completed. Live HTML, runtime configuration and all six entry JS/CSS assets matched the local release. A repeated live error query observed zero new events, confirming deduplication against the first query. Typecheck, build and the focused logging, PostgreSQL and retention checks passed before deployment.

## Staged Investment Loading and Account Detail Release (2026-10-12)

Issue #110 deployed implementation commit `a38f899` to test. The additive `latest_price_candidates(jsonb)` migration was applied with service-role-only access and PostgREST schema reload; no persisted financial rows or historical snapshots were modified. The reviewed CloudFormation change set contained no removals or replacements. It was executed directly after review; the stack reached `UPDATE_COMPLETE`. Web publication and CloudFront invalidation completed.

Typecheck, build, loading/cache/retry, account-detail, account-secrets, dashboard, holdings, portfolio-trend, transaction-table, quote-timeout, time-policy and API-error-logging checks passed. Read-only stage-one database readiness passed. Live entry HTML, runtime config and all six entry JS/CSS assets matched the release output byte-for-byte. Health returned 200; unauthenticated accounts/totals, cached dashboard, cached holdings and cached account-detail requests returned 401 with `UNAUTHORIZED`.

Local authenticated account-detail refinements were reviewed with the user. Full cross-page authenticated responsive acceptance, an authenticated deployed browser check, and comparable real-world before/after latency measurements remain outstanding; this release does not claim those results. Production was not changed.

### Batch-price JSON hotfix (2026-10-12)

Issue #111 deployed `d609ea8` to test. GET RPC array parameters are explicitly serialized to JSON so the installed JSONB batch-price function no longer rejects a PostgreSQL array literal with `22P02`. Local transaction balance retry recovered while preserving the open edit form.

Real test-database GET RPC, loading, holdings, transaction-table, typecheck and build checks passed. The reviewed change set had no deletions or replacements, the stack reached `UPDATE_COMPLETE`, and web publication/CloudFront invalidation completed. Authenticated deployed cached holdings, dashboard and account totals returned successful results using temporary test sessions that were closed locally afterward. No email, schema change, financial record mutation or production deployment occurred.

## FundRock date repair (2026-09-06)

Historical evidence relocated from the data model: after a full ledger backup, TEST history repair corrected 27 transposed FundRock dates and rebuilt 107 daily snapshots from 2026-05-22 through 2026-09-05. Uncollected prices from failed provider runs were not fabricated; valuations carried the latest stored published price. This records the original repair and is not authorization to repeat it.

## Historical local verification observations

Moved from the repeatable local-testing runbook on 2026-10-31. These observations retain their original scope and do not authorize or satisfy future acceptance. Relative scratch paths name historical local artifacts.

The user requested skipping remaining authenticated UI/mobile checks for this release (2026-09-27) and will perform acceptance testing in test. Local desktop transaction view and manual-entry form opened successfully; mobile and populated chart/preview checks are not claimed.

Local dashboard visual checks passed on 2026-10-08 at 320x740, 393x852, 430x932, 768x1024, and desktop using the existing authenticated session. Verified one-year default, preserved range on tab changes, hidden permanent dots, selected-node tooltip, no tooltip on unselected dates, current-value tooltip, stacked narrow panels, 44px tabs, and no page-level horizontal overflow. Holdings and snapshot-tab visual acceptance from the broader investment overview remains separate.

For the 2026-10-12 loading/account-detail work, local account-detail browser checks covered chart range isolation and the revised navigation/layout. These checks do not establish authenticated visual acceptance for every affected page or a measured real-world speedup; no before/after percentage is claimed.

### Cashflow UI visual acceptance — 2026-10-06

Authenticated read-only checks covered daily spending, education, cashflow reports, and transactions at 320x740, 393x852, 430x932, 768x1024, and 1440x1000. Checked mobile navigation, page overflow, table scroll containers, the three entry drawers, footer/pagination, draft date application, empty results, scope switching, advanced filters, and linked cash-row expansion. No financial records were submitted, imported, edited, or deleted. Viewer-role and intentional server-failure scenarios were not exercised in this browser session.

Fixed narrow-screen tab clipping, scope button wrapping, background leaf contrast, 24px mobile cash-row expansion buttons, empty-result pagination wording, and the transaction form hint grid span. Screenshots and layout measurements are retained locally in ignored `tmp/ui-visual-acceptance/`.

For API Error Tracking on 2026-10-12, the user deferred authenticated visual verification; it is not claimed as passed.
