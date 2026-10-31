# TEST Authentication Cutover — 2026-10-31

Status: TEST deployed, automatically verified, and authenticated visual acceptance passed. Operator explicitly authorized commit/push, CloudFormation updates, SQL migrations, user initialization and required deployment registration. Production excluded.

Issue: #120. Exact release commit and CI run are recorded when available.

## Completed preparation

- Local auth/backup/deployment verification, typecheck/build and independent reviews passed as recorded in the implementation plan.
- TEST preflight found two retained identities and a unique requested administrator. Private mapping and pre-cutover public-schema pg_dump archive are in ignored local operator storage; archive directory verified.
- TEST automatic publication paused; existing runs were complete and no stale lock existed.
- Dedicated CloudFormation operator role created in a separate stack. IAM lifecycle writes target the new TEST API runtime role; the existing TEST Lambda role permits the inline-policy update required by the shared market-data invocation policy. Other existing roles remain read-only. Actual change-set review also covered the existing response-header policy. CI role permissions unchanged.
- Original Lambda concurrency was captured privately; API/jobs reserved concurrency set to zero for the maintenance window. This blocks invocations rather than presenting an unimplemented maintenance page. Original settings must be restored after compatible backend/SQL readiness.
- Application identity, final cutover and first-admin activation SQL applied. Checks: two stable identities, zero public foreign-key/function dependencies on auth.users, zero public/anon/authenticated direct table grants. Secrets were resolved in memory and never logged.

## Pending execution and acceptance

- Completed: reviewed TEST change set execution and auth-table/IAM/config/live synthetic verification.
- Completed: private admin initialization/activation and undisclosed random temporary credential for the inactive other user.
- Completed: clean-revision migration/infrastructure registration, restored automatic publication and successful workflow monitoring.
- Real-user browser acceptance remains pending. No bypass or operator-created test session substitutes for the user's login/readiness handoff.
- Completed: original API/jobs concurrency restored and live backup verified. Old Supabase identities retained during the rollback window.

No live completion claim is established by this in-progress record. Private backup contents, user mappings, generated passwords, tokens, AWS credentials and service secrets must not be attached here.

## Executed stack and integration checks

The reviewed change set completed UPDATE_COMPLETE: new auth table/API role, coordinated Lambda code/configuration, auth routes/stage throttles and CSP header policy; no replacements/deletions. API and jobs concurrency restored to original values. Synthetic live login/session, viewer denial, real concurrent DDB CAS and revoked-session checks passed; synthetic user/session/credential removed. TTL enabled. API Lambda reports at configured 512 MiB showed maximum memory 335 MiB; observed cold login request about 3.04 seconds including dependency work (not a general performance guarantee).

The new backup Lambda completed successfully with 5,988 exported rows; downloaded private v9 backup validation passed. Administrator password initialization remains pending due the interactive-window handoff; other existing user initialized with an undisclosed random temporary password and inactive access. No user password or token appears in this record.

## Automatic delivery and user initialization

Release commit: 251572a4bee658e895b1df45c4d00197fb26b536. GitHub run: [TEST CI 41188714539](https://github.com/bluewuxi/family-ledger/actions/runs/41188714539). The first attempt rolled back because the original code-only execution role lacked iam:GetRole for the newly added API role. The existing deployment bootstrap refreshed its current-resource read/artifact scopes; no auth-table write or infrastructure-mutation rights were added to CI. Rerunning the same failed workflow completed successfully with health/auth/runtime config/HTML/asset checks and stage verified. No manual frontend publication bypass was used.

Administrator credential initialization succeeded via the user's native masked-input handoff; service-only first-admin activation succeeded. Other existing user remains inactive with an undisclosed random temporary password. Both original identities are retained. API/jobs original concurrency restored and automatic TEST publication re-enabled.

Real user first-password-change and authenticated five-viewport acceptance are pending the user's readiness confirmation. Old Supabase identities/sign-in configuration remain retained for rollback; old tokens cannot access the new API or private database tables. No production change was performed.

## Real-login acceptance and corrective navigation change

The user confirmed successful first password change/re-login and dashboard readiness. Read-only inspection verified populated dashboard data, admin settings, retained user roles, inactive other user and the separate trading-password gate. Settings was visually checked at 320x740, 393x852, 430x932, 768x1024 and 1440x1000; no page-level horizontal overflow was measured, and password inputs met the 44px height baseline.

Acceptance found Settings -> 修改登录密码 changed the URL but left the protected layout blank. The protected wrapper read window.location without subscribing to router changes. The corrective change uses unconditional useLocation; typecheck/build/frontend auth fixtures and focused independent review passed. Automatic corrective delivery and live click-through confirmation are recorded after completion; until then this finding remains an outstanding acceptance item.

## Final acceptance

Final application release: 27196c61eee3694b30e9a4d53a25b36bffa94dfd; [automatic verification run 41189766691](https://github.com/bluewuxi/family-ledger/actions/runs/41189766691) succeeded. The reactive route fix was first released in aa5a6e0; 27196c6 adds the shared 44px back link. Read-only live click-through on the final version passed Settings -> change-password -> Settings -> dashboard without reload or credential submission.

Authenticated Settings and change-password layouts were inspected at 320x740, 393x852, 430x932, 768x1024 and desktop 1440x1000. No page-level overflow was measured; the shared back link is 44px high. Temporary viewport overrides were reset. The user performed the real initial password change and re-login, and confirmed dashboard readiness before inspection. No auth bypass, user permission change, password reset or ledger mutation was used for visual acceptance.

Implementation, TEST deployment, real DDB/API integration, live v9 backup validation and authenticated visual acceptance passed. Old provider identities remain retained for rollback, and production remains unchanged. Historical pending statements above describe their respective execution stages; this final acceptance supersedes them.
