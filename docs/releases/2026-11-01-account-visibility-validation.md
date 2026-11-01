# Account Visibility TEST Delivery and Acceptance

Status: TEST schema, isolated CORS configuration, both manifest registrations, automatic application publication, authenticated acceptance, and one live backup/file restore preflight passed. Production is unchanged.

## Authorization and environment

The user authorized the four account-visibility TEST migrations, one dedicated viewer identity, changes to that identity's grants for verification, and final empty-scope/deactivation cleanup. Subsequent authorization covers commit/push, isolated TEST CORS infrastructure application, migration/infrastructure registration, automatic TEST delivery, temporary reactivation and final cleanup of the acceptance viewer, and one TEST backup with file restore preflight only. Production and actual database restoration are excluded. Existing family users' credentials and roles are not changed.

## Schema evidence

Read-only preflight confirmed a stable TEST stack, absent account-scope tables, required existing identity/education/functions, and the exact-decimal application-identity backup exporter. A private pre-change ledger export was retained under the ignored local acceptance directory.

The following files were applied together inside one repeatable-read transaction, with lock and statement timeouts:

- `20261101090000_account_access.sql`
- `20261101091000_scoped_spending_reads.sql`
- `20261101092000_scoped_cashflow_reads.sql`
- `20261101093000_account_access_backup.sql`

The transaction compared the complete pre-existing ledger-export digest before and after the migration, excluding only the newly added authorization tables and exporter marker. The digest was unchanged. Existing viewers initialized to selected scope without grants; administrators initialized to all scope. PostgREST schema reload was requested. File hashes and private checkpoints are retained locally; no secret, password, session token, or personal ledger data belongs in this record.

## Real PostgREST verification

A dedicated synthetic viewer was provisioned with a random temporary password kept only in process memory. Real login, forced password change, and subsequent normal opaque-session authentication were used for backend checks. No browser session was injected or authentication bypass enabled.

Passed through the local current API and real TEST PostgREST:

- Empty scope across ledger, dashboard, snapshots, spending, cashflow, and education.
- Selected ledger/spending accounts and the education fund; snapshot-header inner joins, comparisons, trend, monthly report, options, and combined queries.
- Dashboard valuation agrees with the independent selected account-detail valuation.
- Hidden-account detail returns not found; original statement files remain denied to viewers, including all-account viewers.
- All-account mode and revocation without logout.

Integration exposed a pre-existing GET RPC serialization problem: absent FX currency arrays were sent as the literal string `null`. The local repository now omits that optional argument so PostgreSQL uses its existing null default. The route regression failed before the fix and passed afterward; real integration, typecheck, and build passed. No additional SQL migration was needed.

## Browser handoff and limits

The local web URL is `http://127.0.0.1:5181/`. The API and browser auth-bypass flags are disabled. A local acceptance proxy limits automatic valuation refresh requests to actual cached quotes, avoiding external provider refresh while preserving real authentication, authorization, and PostgREST reads. Provider-refresh behavior is not part of this acceptance.

The user logged in as administrator and confirmed Settings readiness before inspection. Administrator account-scope editing was inspected at 320x740, 393x852, 430x932, 768x1024, and 1440x1000. All three resource groups, long synthetic email wrapping, keyboard focus, and save/close reachability were checked. The initial 28px select and narrow-screen grid overflow were corrected; the select now measures at least 44px and page scroll width equals client width at all five sizes, while the user table retains internal horizontal scrolling. Administrator dashboard loaded with real data and was visually inspected at desktop and 320px widths.

The user completed the dedicated credential reset, password change, and real viewer login, then confirmed Account Management readiness. Selected scope contained one existing investment account, one spending account, and the education fund. Account Management, dashboard, daily spending, education, and combined cashflow layouts were checked at all five sizes above, with no document-level horizontal overflow. Tables retain internal scrolling. The account drawer was read-only; no trading password was revealed. The spending history retained authorized parsed records while original CSV/PDF controls were absent. Selected-scope maintenance exposed only FX and snapshots; viewer Settings exposed no user management. No ledger entries were changed.

Live revocation cleared account rows and dashboard values without logout. Education showed no accessible account and no records; combined cashflow showed zero records and no old totals. The scope notice updated to `暂无可访问账户`. Regrant and revoke were repeated after the final fix, and normal selected-account loading recovered without an error.

Browser acceptance exposed missing CORS exposure of `x-account-scope` in the local adapter. The local adapter and API Gateway template now expose this revision header. A regression guard failed before the change and passed afterward. Independent follow-up review identified session-refresh failure blocking invalidation; views now remount immediately and again after successful identity refresh, because publishing that identity invalidates in-flight reads. Failure/success ordering fixtures, loading checks, final typecheck/build, and SAM template lint passed. The reviewer reported no unresolved material issue in the final fix.

Cleanup passed: the dedicated viewer has selected scope with zero grants, inactive access, and invalidated sessions. Reloading the browser returned to login. Temporary viewport overrides were reset. Private cleanup evidence remains in the ignored acceptance directory.

At the end of local acceptance, TEST application code was still the previous version. The subsequent authorized publication below completed the coordinated API/web/jobs upgrade and release prerequisites.

## Authorized TEST publication

Tracked under [issue 121](https://github.com/bluewuxi/family-ledger/issues/121). Release preflight confirmed stable TEST infrastructure, matching hashes for all four applied migrations, complete policy coverage, and administrators in all-account mode. Typecheck, build, account-scope/client fixtures, and deployment-tool verification passed again before commit.

Push deployment was paused with no active release. An operator change set based on the currently deployed packaged template preserved every existing application code location and parameter; its sole executable change was `LedgerHttpApi` modification without replacement. The change set added CORS exposure of `x-account-scope`. Stack update completed, the live API exposes that header, and the applied original template matches the reviewed candidate and current source infrastructure shape. No IAM, runtime, scheduler, database, or application code changes were included in this independent step.

Implementation commit `a26fc2a` and preparation evidence commit `37090cf` were committed on `test`. Both complete migration and infrastructure manifests were registered against clean `37090cfcb1d5328fb7a111b430e10d371f0308cd`. Repository-local `#121` was used as the evidence reference to fit the standard SSM size limit without dropping any of the 52 migration paths/hashes. Automatic deployment was restored to enabled before push.

[CI and automatic TEST deployment](https://github.com/bluewuxi/family-ledger/actions/runs/41261925399) passed for `37090cf`; the deployment's `last-success` record matches. API health/auth rejection, public runtime configuration, exact HTML/entry assets, and CloudFront publication verification passed. No manual application deployment substituted for the workflow.

## Deployed authenticated acceptance

The user logged into the real TEST site and confirmed administrator Settings readiness. The scope editor passed `320x740`, `393x852`, `430x932`, `768x1024`, and `1440x1000` checks. All three resource groups loaded, selects measured at least 44px high, long identity text wrapped, save/close were keyboard reachable, and document width did not overflow. No scope was saved during this inspection.

The dedicated viewer was temporarily reactivated with its existing user-managed password and the same three acceptance resources. After administrator logout, the user logged in as the viewer and confirmed readiness. Account Management showed exactly one investment account and passed all five viewports above. Dashboard, spending, education, and combined cashflow were additionally inspected at desktop and 320px. Dashboard account count was one; the spending filter contained only the authorized account; education was read-only; authorized statement detail exposed no original CSV/PDF controls.

With the deployed browser still logged in, the viewer's scope was emptied. Refresh removed the old account and updated the notice to `暂无可访问账户`, demonstrating cross-origin revision invalidation. Dashboard values and account count became zero. Education removed its cumulative overview and showed no accessible account/no records; combined cashflow showed zero records without prior totals.

Final cleanup verified empty selected scope, inactive access, and invalidated sessions. Reload returned the real TEST browser to login. Viewport overrides were reset. Existing family roles/credentials and ledger entries were not edited. Original signed-file URLs expire after five minutes; this acceptance concluded after that pre-cutover issuance window. Previously downloaded files remain outside revocation control.

## Deployed backup and file recovery preflight

One authorized invocation of the deployed TEST backup Lambda succeeded at `2026-11-01T01:42:34.686Z`. Its actual version-10 S3 bundle included policies, all three grant tables, and scope audit records. Decompressed content matched S3 checksum metadata; bundle checksums and identity/reference validation passed. `verify:backup` and `restore:backup:dry-run` passed for the untouched file (6,010 rows, three application identities). No destination database was loaded or restored. Private object identifiers, financial payloads, and detailed checkpoints remain ignored local artifacts.
