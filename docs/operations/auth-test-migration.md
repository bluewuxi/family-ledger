# TEST Authentication Migration Procedure

Status: Prepared on 2026-10-31; no execution authorized by this document. The user requested evaluation and sequencing, prefers CloudFormation-managed AWS resources, and will supply the initial administrator password at execution time. Existing uncommitted implementation is not a deployable approved release.

Read with [cutover](auth-cutover.md), [recovery](auth-recovery.md), [TEST delivery](../test-auto-deployment.md), and [workflow](../project-workflow.md#delivery-scope-and-workflow). Production is excluded.

## Strategy assessment

Use the existing application CloudFormation stack for resources, IAM, API routes/throttles and Lambda configuration. Do not create the auth table or IAM role manually and later attempt to reconcile drift. User rows and password verifiers are application data: provision them outside CloudFormation. Never put a password/verifier in template parameters, outputs, custom-resource payloads, change-set descriptions or Git.

Resolve the user-specified administrator email against the current TEST identity inventory and preserve that UUID. Keep the specific email/UUID mapping in ignored local operator material, not this shared runbook. Preserve the other existing users and their intended roles; do not invent extra users or change historical audit IDs.

Use a protected local masked input for the administrator's initial password. The user can enter it directly when execution begins; chat, command arguments, environment variables and files are unnecessary password transports. The existing tool treats all initial passwords as temporary (24 hours) and requires first-login change. If the provided password is intended as the final permanent password, explicitly settle that behavior before execution; do not silently bypass the approved first-change rule.

Other users receive independently generated random temporary passwords. If the administrator will reset them before use, discard the generated plaintext immediately and do not display/send it. Their initial 24-hour expiry is harmless: admin reset issues fresh temporary credentials later. Prefer keeping these users inactive until the admin resets and resumes them. Verify that this is the chosen initial access state rather than silently preserving active access with inaccessible credentials.

## Resource inventory

| Resource | CloudFormation action | Required checks |
| --- | --- | --- |
| `AuthTable` | Create on-demand DynamoDB table, `pk` string key, `expiresAt` TTL, encryption, PITR, retain on deletion/replacement | Correct TEST region/stack; TTL/PITR status; generated physical name from stack output |
| `ApiExecutionRole` | Create separate API runtime IAM role and scoped auth-table item permissions | API can perform required reads/conditional transactions; jobs cannot access auth table |
| Existing API Lambda | Update execution role, `AUTH_TABLE_NAME`, code as shown in change set | Correct table; environment secret values not exposed; measure scrypt latency/memory at configured 512 MiB |
| Existing API Gateway HTTP API/stage | Add explicit auth mutation routes, rate 5/second and burst 10 | Login, change-password and admin-reset integrations reach API; other routes still work |
| Existing CloudFront/web configuration | Update CSP and publish browser runtime config containing API URL only | No frontend Supabase identity dependency; preserve backend DB settings |
| Existing jobs | Update code if included in release; retain database access | Backup writer/exporter version alignment; schedules do not run during incompatible schema/code stages |
| Stack output | Add `AuthTableName` | Use actual output for local operator configuration; no hard-coded generated names |

No new Cognito, signing-key pair, authentication SSM secret, always-on server or financial DDB tables are needed. Existing SSM database/trading secrets and deployment locks remain.

## Execution prerequisites to finish locally

1. Implemented and isolated-verified: scripts/manage-auth-user.ts --random-password generates in process, hashes and releases plaintext references without output. No real user has been initialized.
2. Implemented and isolated-verified: activate-first-admin uses a service-role-only SQL RPC with revision checks, existing admin role and no other active admin. Apply 20261031110000_first_admin_activation.sql first. Provision deliberately sets access inactive; running it alone cannot produce a usable administrator. Preserve existing UUID, profile preferences and intended admin role. Do not allow a rerun to reset credentials implicitly.
3. Add a bounded disposable TEST DDB/Lambda integration check using synthetic identities and a distinct key prefix. Verify transaction conditions, expiry, rate counters, actual IAM and crypto resource use; delete only its own synthetic records. This check writes cloud data and needs execution authorization.
4. Confirm the maintenance mechanism for the existing stack and all affected scheduled jobs. Record exact previous settings and a restoration checklist. A maintenance page alone does not block API access. Pause writes/entry points and scheduled mutations through an explicitly reviewed operator mechanism; do not improvise broad IAM/network changes.
5. Freeze the exact reviewed release into a clean committed `test` revision when commit permission is provided. Read the live migration inventory, not just filenames; `20261031090000_lossless_ledger_backup.sql` is a prerequisite if absent. Do not replay already-applied migrations.

## Ordered TEST procedure

### 1. Inspect and prepare

Read current stack, region, API/table settings, running CI jobs, deployment lock, migration effects, identity/role inventory and scheduled jobs. Confirm the requested admin email maps uniquely to an existing UUID. Resolve email-normalization collisions before mutation. Record sanitized evidence and current release artifacts/configuration/grants needed for rollback.

Run required local build/auth/backup/deployment checks for the exact target revision. Secure a recoverable ledger backup with the currently deployed compatible exporter/writer, validate checksums, and retain a private identity mapping. Do not run the new v9 writer against an old exporter merely to obtain a backup.

### 2. Freeze automatic publication and enter maintenance

With explicit authorization, pause automatic TEST publication, wait for active runs to finish, and follow the shared deployment-lock procedure. Pausing the variable does not cancel a running deployment. Activate the reviewed maintenance/scheduler controls and record their original state. Do not continue if another operator/release owns the lock.

### 3. Apply and verify SQL

Use the Windows migration procedure with runtime-resolved SSM database credentials. Apply the missing migrations in reviewed dependency order:

- `202610310001_application_users.sql`: stable identities, normalized unique emails, access revisions and redirected audit foreign keys.
- Any required missing predecessor, including the lossless backup exporter migration, based on the live inventory.
- `20261031100000_auth_cutover.sql`: app-user backup export, retained function identity checks, obsolete policy removal and denial of legacy direct access.
- `20261031110000_first_admin_activation.sql`: service-role-only first-admin activation RPC with identity/role, active-admin and revision checks.

Verify UUIDs/roles/preferences/audit counts, no unexpected business changes, all relevant foreign keys/functions, RLS, direct old-token denial and trusted API/jobs database privileges. Keep maintenance active: the old API may no longer be compatible with the final grants.

### 4. Update the existing stack through CloudFormation

Prepare and inspect the exact TEST change set using the independently authorized operator execution role. Reject unexpected deletions/replacements or unrelated infrastructure changes. The existing `deploy:infra:test` path can also bundle/update API/jobs code; it is not a table-only command. Schedule this coordinated backend change after SQL readiness, inside maintenance. Alternatively a separately reviewed infrastructure-only stage must explicitly preserve current code artifacts; that variant is not prepared by the current template alone.

Execute the reviewed stack update under the project lock, wait for a stable successful state and inspect physical outputs. Confirm API role/table binding, routes, throttles, job role separation and unchanged intended schedules. Run synthetic DDB/Lambda integration checks, remove only their owned records, and record results. If any check fails, retain maintenance and resolve it before user initialization/publication.

### 5. Initialize users

Use the verified stack table output and TEST database. Provision the requested admin using the preserved UUID and protected password input, then explicitly activate the admin with a revision-checked update after verifying credential existence. Keep plaintext out of tool results and logs. Other users use generated, undisclosed temporary passwords and the agreed inactive state. Preserve history and preferences. Inspect only safe credential metadata (existence/version/change-required/expiry), never dump credential payloads.

Verify provisioning retries do not overwrite credentials, admin SQL access is active, and other users match the intended initial state. If initialization exceeds the 24-hour temporary-password window, reset through the approved operator process before acceptance.

### 6. Register the verified state and publish the web/release

Register both complete migration and infrastructure manifests for the clean exact commit, using sanitized evidence. Registration follows completed verification; it is not proof that operations ran. Do not modify SQL/config afterward without renewed verification and registration.

Restore automatic publication only under its explicit authorization, then use the configured TEST workflow for the same revision to publish/verify API/jobs and web assets. A necessary independently authorized stack update is not permission to bypass a blocked automated frontend publication. If the workflow is blocked, investigate the gate. Do not substitute an unapproved manual deploy.

Verify health, unauthenticated rejection, runtime config, HTML/assets and version alignment before opening ordinary access. Keep scheduled jobs paused until writer/exporter compatibility is verified.

### 7. Real user acceptance and restore normal operation

The user logs in as the requested admin and confirms the target page is ready; the agent must not substitute its own login for browser acceptance. Complete first password change, log in again, and verify Settings/user list and ledger history. Admin resets/resumes the other user when ready. Use an agreed test identity or explicitly authorized changes to existing users for viewer/reset/pause tests; restore intended access afterward.

Check login/logout, wrong password, expired/revoked sessions, temporary-session restrictions, admin/viewer boundaries, password reset/change, pause/resume, legacy token rejection, data/backup status and sanitized failure messages. Verify the five viewports: 320x740, 393x852, 430x932, 768x1024, and recorded desktop size (1440x1000 recommended).

Run an explicitly authorized v9 backup and validate its identity/financial data using isolated restore, never overwrite TEST for a recovery test. Restore the recorded maintenance/schedule settings and confirm subsequent job results. Disable obsolete Supabase sign-in paths only after acceptance and separate cleanup authorization; retain old identities during the rollback window.

## Failure handling and completion

At any failure, retain maintenance and record the failing stage. CloudFormation rollback does not roll back SQL, initialized passwords or web assets. Returning to the old release requires the reviewed compatible code/config/grants and working retained Supabase credentials. Preserve new business writes and UUIDs; do not restore a stale ledger to undo auth. See [cutover rollback](auth-cutover.md#partial-failure-and-rollback).

Completion evidence identifies exact commit, CloudFormation change set/result, migration checks, initialized users by safe identifiers, CI run, DDB/Lambda checks, backup result and separate real-login viewport acceptance. Record any deferred checks explicitly.

## Authorization boundary

This evaluation creates no resources or users. Execution needs explicit TEST scope for commit/push as applicable, CloudFormation/infrastructure and scheduler/config changes, SQL migration, user/credential initialization and first-admin activation, synthetic cloud tests, deployment registration/automation control and publication. These can be authorized together as one concrete TEST migration scope; do not ask again for each already-authorized step. Password entry and real-user browser login remain execution handoffs rather than additional design approval.
