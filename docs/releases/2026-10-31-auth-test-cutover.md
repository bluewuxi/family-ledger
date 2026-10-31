# TEST Authentication Cutover — 2026-10-31

Status: In progress. Operator explicitly authorized commit/push, CloudFormation updates, SQL migrations, user initialization and required deployment registration. Production excluded.

Issue: #120. Exact release commit and CI run are recorded when available.

## Completed preparation

- Local auth/backup/deployment verification, typecheck/build and independent reviews passed as recorded in the implementation plan.
- TEST preflight found two retained identities and a unique requested administrator. Private mapping and pre-cutover public-schema pg_dump archive are in ignored local operator storage; archive directory verified.
- TEST automatic publication paused; existing runs were complete and no stale lock existed.
- Dedicated CloudFormation operator role created in a separate stack. IAM writes limited to the new TEST API runtime role; existing runtime roles are read-only. CI role permissions unchanged.
- Original Lambda concurrency was captured privately; API/jobs reserved concurrency set to zero for the maintenance window. This blocks invocations rather than presenting an unimplemented maintenance page. Original settings must be restored after compatible backend/SQL readiness.
- Application identity, final cutover and first-admin activation SQL applied. Checks: two stable identities, zero public foreign-key/function dependencies on auth.users, zero public/anon/authenticated direct table grants. Secrets were resolved in memory and never logged.

## Pending execution and acceptance

- Inspect and execute the exact reviewed TEST change set, then verify auth-table/IAM/config and live synthetic auth behavior.
- Initialize admin through private interactive input; other user receives an undisclosed random temporary password and inactive access.
- Register complete migration/infrastructure manifests at a clean committed revision; resume configured automatic publication and monitor it.
- Real-user browser acceptance remains pending. No bypass or operator-created test session substitutes for the user's login/readiness handoff.
- Restore original API/jobs concurrency and verify scheduled operations/backup compatibility. Retain all old Supabase identities during the rollback window.

No live completion claim is established by this in-progress record. Private backup contents, user mappings, generated passwords, tokens, AWS credentials and service secrets must not be attached here.
