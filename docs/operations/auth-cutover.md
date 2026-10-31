# Authentication Cutover

For the concrete TEST sequence and CloudFormation-first/user-initialization strategy, use [TEST authentication migration](auth-test-migration.md).

Use with the [approved design](../specs/2026-10-31-auth-migration-design.md), [TEST release contract](../test-auto-deployment.md), [migration procedure](../project-workflow.md#applying-database-migrations-on-windows), and [recovery procedure](auth-recovery.md). These instructions are preparation only; each live migration, provisioning, independent infrastructure/configuration operation and release needs its applicable authorization. Production remains operator-run.

## Preparation

Record the exact target commit and current environment state. Confirm all historical referenced identities have reviewed unique normalized emails and existing UUIDs. Keep any private mapping in ignored local storage. Obtain a recoverable ledger backup and verify its original checksums. Rehearse the migrations and restore against disposable resources; keep old Supabase users during the rollback window.

The additive migration `202610310001_application_users.sql` preserves identities and redirects foreign keys. The final `20261031100000_auth_cutover.sql` follows the lossless-backup migration, adds identities to the version-9 exporter, redirects retained creator checks, drops obsolete user policies and disables direct anon/authenticated access. Do not register a final migration manifest before its final effects are applied and verified.

Independently provision and verify the retained, encrypted, PITR-enabled auth table and API IAM/throttle configuration. API code requires `AUTH_TABLE_NAME`. Jobs retain their database/export access and receive no auth-table permissions. Review the actual change set; automatic code-only deployment is not authorization for this infrastructure change.

## Maintenance window

1. Pause normal access and ensure no release/registration overlaps. Follow the shared deployment lock procedure.
2. Apply the additive migration and verify UUIDs, email normalization, audit foreign keys and preferences. Provision fresh temporary credentials. Do not copy Supabase password hashes.
3. Apply the final cutover migration. Verify no application foreign keys/functions depend on `auth.users`, no old JWT can read private tables/views/RPCs, RLS remains enabled, and service-role API/jobs still work.
4. Register the complete exact migration manifest and independently verified infrastructure/configuration manifest. Any later mutation invalidates that attestation and requires re-verification/registration.
5. Publish the coordinated API/frontend version only through its authorized delivery path. Clear old browser session state. Accept opaque tokens only; users log in again.
6. Verify both roles, restricted first login, change/reset, logout, pause/resume, preferences, historical records, jobs and the version-9 backup/restore path. Authenticated visual acceptance uses real user login at all five required viewports, recorded separately.
7. Only after acceptance, independently disable old provider sign-in paths. Do not delete historical identities or credentials as an unreviewed cleanup step.

## Partial failure and rollback

Keep maintenance active if final SQL, API or frontend are mismatched. Retry only after observing actual schema/table/config state. Never bypass an automatic deployment gate or replace it with manual publication.

A Git revert alone cannot undo schema, grants or credentials. Returning to Supabase Auth requires explicitly restoring a compatible application/config/grant set, verifying retained Supabase accounts and their working credentials, and denying the new provider. New DDB passwords were not synchronized to Supabase; use secure operator recovery as needed. Invalidate opaque sessions. Preserve all business writes and user UUIDs; do not restore a stale ledger backup merely to reverse authentication.

Record which stage failed, what was verified and any remaining browser acceptance. No live success is established by the local migration/fixture tests.
