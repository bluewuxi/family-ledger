# First-read failure investigation

**Status:** Confirmed client race fixed locally; focused checks, typecheck/build, independent review and administrator read-only browser acceptance passed. No commit, push or deployment requested or performed. Deployed TEST reproduction remains unverified.

## Scope and baseline

- Started on clean `test` at `d3f28ce4645690a4812118819ba5e75a88c04808` in the existing checkout.
- Follow-up to the [manual testing observation](2026-11-01-manual-testing-follow-up.md#authorized-test-migration-and-resumed-acceptance). The earlier missing auth-table configuration and instrument activity migration were separate resolved issues.
- Authorization covered investigation, necessary corrections and local verification only. No shared ledger records, preferences, users, grants, passwords or schema were changed. No bypass or synthetic browser session was used. The user performed normal administrator login and confirmed settings readiness, including after local services had stopped between work periods.
- Maintained boundaries: [Auth](../auth.md), [API](../api.md), [workflow](../project-workflow.md), and [browser acceptance](../local-testing.md#authenticated-browser-acceptance).

## Confirmed reproduction and cause

The development entry point uses React StrictMode. AuthProvider's effect invokes `loadSession()` twice during initial mounting. Its cleanup suppresses the old effect's React state updates, but does not suppress `authClient.publish()` inside that request. If the live effect completes first, private pages mount and start reads while the other session request is still pending. The second successful, unchanged session response previously called `clearReadCache()` unconditionally. That advanced the cache generation, so successful private responses were discarded as obsolete and page helpers converted the exception into a generic request failure.

This is a response-order condition, not a claim that every first read fails. In-page navigation does not normally remount AuthProvider. Private reads on an already mounted page are also susceptible if they overlap session revalidation.

Normal-login browser evidence on November 1 used the local web/API pair and temporary, development-only console instrumentation. It recorded response status/envelope success, scope equality and generation transitions without tokens, passwords, request bodies or private response payloads. The instrumentation was removed before final validation. The following times are UTC from the captured browser log:

| Time on 2026-11-01 | Evidence |
| --- | --- |
| 09:23:29.197 / .201 | Two session restoration calls begin. |
| 09:23:29.602–.603 | First publication establishes identity; generation becomes 2. |
| 09:23:29.651–.652 | `/me` and `/settings/preferences` start at generation 2. |
| 09:23:29.652 | Second publication reports same token, user and scope; generation becomes 3. |
| 09:23:30.011 / .086 | Both GETs return HTTP 200, `success: true`, identical scope revision 0. |
| 09:23:30.012 / .087 | Read completion sees started generation 2 versus current 3. Settings visibly shows `设置请求失败，请稍后重试。`; preferences and administrator controls are absent. |
| 09:23:35.507–09:23:36.003 | User-facing refresh starts preferences at generation 3; HTTP 200 completes at generation 3, then user and gate reads resume. No new login is needed. |

No HTTP/network or dependency failure, token mismatch, stale scope or scope-change refresh caused this captured settings failure. The local response did not expose an `x-request-id` value to this client (null); no request ID is claimed. This is sanitized boundary evidence, not a full Network/HAR export, and does not retroactively classify every earlier occurrence.

The transaction page starts `/transactions/balances` on page mount, independently of its list/reference reads. Its error state is displayed later inside the drawer. Refreshing the list does not reload balances; the balance retry does. Thus a successfully displayed list with a balance error does not establish a newly failing drawer-time request. The historical drawer failure was not naturally reproduced in this investigation; its shared client path was covered with controlled ordering. The original-code browser sample showed 78 records and a successful balance read.

## Correction and isolated verification

Only `authClient.publish()` changes executable application behavior. It retains invalidation for null sessions, changed credentials, identity, role, expiry, password-change restriction or full account-access policy. An equivalent session publication still updates subscribers but does not clear in-flight reads. This preserves StrictMode and existing restoration calls rather than hiding the race with an automatic read retry.

The API's token checks, scope checks, refresh/remount flow, logout invalidation and successful-write invalidation remain unchanged. Completed private API responses still have zero cache lifetime; subsequent reads reauthorize on the server.

`verify:session-reads` bundles the real auth/API/cache modules with isolated storage and deferred synthetic HTTP responses. Before the fix, all eight controlled cases (four paths, two session-response orders) rejected HTTP 200 with `数据已更新，请重新加载。`; each explicit retry succeeded. After the fix all pass. Additional cases preserve rejection after logout, identity/token changes, role changes, expiry, restricted-session changes, policy revision changes, same-revision policy-content changes, policy removal and writes. They distinguish network errors, dependency 503, unauthorized 401, `STALE_SCOPE` and `SCOPE_CHANGED`, and verify a late restore cannot revive logout. Token replacement exercises `STALE_SESSION` rejection.

Passed checks:

- `corepack pnpm verify:session-reads`
- `corepack pnpm verify:auth`
- `corepack pnpm verify:account-access-client`
- `corepack pnpm verify:loading`
- `corepack pnpm verify:transaction-table`
- `corepack pnpm typecheck`
- `corepack pnpm build`

These are local fixtures/builds with no live writes. Expected synthetic dependency/error diagnostics in negative fixtures are not test failures. Independent review inspected the working diff and new fixture and found no actionable defects; its optional full-policy test suggestion was added and passed.

## Administrator browser acceptance on November 2

Both local services were restarted with bypass explicitly false. The user logged in normally and confirmed settings readiness. Final source no longer contained diagnostic instrumentation.

At each of `320x740`, `393x852`, `430x932`, `768x1024` and `1440x1000`, fresh settings, accounts and transactions navigation loaded without the refresh/retry controls. Settings preferences, users and gate status appeared; account rows and amounts populated; transactions showed 78 records with account/instrument options. Opening `新增交易` -> `Hong新账户` displayed `可用资金：CNY 601.319` without retry. The drawer was canceled without saving. Screenshots checked responsive settings/accounts/drawer presentation; list content was checked through the rendered DOM. Tables retained their horizontal scroll containers and mobile drawers retained visible cancel actions.

Desktop in-page navigation from transactions to accounts to settings also succeeded. Three additional settings reloads completed without the failure. This finite acceptance sample is not an estimate of historical failure frequency. Temporary viewport overrides were reset and the browser returned to settings.

Logout, identity switch and actual access changes were tested with isolated fixtures rather than changing shared users or signing into a restricted viewer. Restricted-viewer browser acceptance remains user-deferred. The deployed TEST website was not tested or changed. Subsequent network/dependency failures remain possible and should be diagnosed separately if observed.

## Authorized delivery

The user subsequently authorized committing and pushing this fix to test, monitoring CI and automatic TEST deployment, and completing release checks. Tracking: issue #123. Local acceptance above remains distinct from deployed-site authenticated acceptance. Deployment evidence will be recorded in the issue after the configured workflow finishes.
