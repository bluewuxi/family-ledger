# UI Internationalization Phase 2 Local Evidence

Date: 2026-11-07. Baseline: test at 7bdcd5061177e66b8feda012b8f9fcaf7e7b7955. Scope follows the [Phase 2 plan](../plans/2026-11-07-ui-internationalization-phase-2.md) and [maintained contract](../specs/ui-internationalization.md).

Implementation is local and uncommitted. Deployment was not requested. Phase 2 local visual acceptance is complete: authenticated shell/groups and isolated auth/startup scenarios, with the documented browser-tool limits. Public builds remain Chinese; English switching remains restricted to Vite DEV on exact loopback hostnames. Phases 3–5 remain Not started.

## Implemented behavior

Bundled auth/navigation/errors/investmentGroups namespaces extend common/format/preview. Login, recovery and reset alias, ordinary/forced password change, session and startup failure, shell/shared controls and group maintenance use typed semantic copy. Route titles own routed presentation independently of singleton html.lang/application metadata. Source names, IDs, ordering, financial/date/currency semantics, roles and API contracts are unchanged.

Shared group parsers now expose additive typed local reasons while retaining exact Chinese messages and accepted inputs. Errors store safe descriptors and translate at render time. Unknown writes instruct users to reload/check before retrying; no language switch retries a mutation. Group 400 errors retain combined name/member guidance; 403, 404, 409 and dependency/transport outcomes remain actionable.

The direct groups route uses authenticated role eligibility and a translated instrument-loading/failure boundary. Viewers do not fetch group configuration. Editor keys, original revisions, drafts, members and pending state are independent of language. Delete and conflict reload use reactive native modal dialogs; underlying drawers are inert and ignore topmost focus/keyboard events. Native dirty-departure confirmations translate at invocation; browser beforeunload text is outside application control.

## Automated verification

Initial new namespace assertions failed for missing auth resources, then passed. Initial real React SSR check failed for untranslated English login, then passed after migration. Resource mutation, mapping/redaction, Unicode/UUID/parser compatibility and stable navigation checks pass. Stateful real-handler fixtures cover exact PUT/DELETE method/path/body/original revision; duplicate submission protection; 400/403/404/409/503/response loss; pending/draft/member/error preservation across language changes; delete cancel/confirm; login pending/error retranslation and clearing; forced-password validation; direct group loading/failure and viewer denial. Mocked hooks do not establish actual React DOM focus or authenticated acceptance.

The reviewed runner passed:

- verify:i18n-phase2, verify:i18n-phase2-client, verify:i18n, verify:i18n-resources and verify:i18n-client.
- verify:investment-groups, verify:investment-group-api and verify:investment-groups-client.
- verify:auth, verify:session-reads, file:apps/web/verify-interface-workflows.ts and verify:tooling.
- The complete 15-check core profile, including auth/access, health, holdings/dashboard/trend/snapshots, backup, deployment fixtures, time policy and transaction invariants.

Effect review covered changed UI/descriptor/parser/resource code and synthetic test dependencies before updating exact registry fingerprints. No runner approval or isolation gate was bypassed. The conservative changed-path planner retains known unmapped web/i18n/fixture paths; those are manually covered by the new checks, existing affected regressions, root lint/typecheck/build, docs and scoped browser inspection. Recommendations for disposable DB checks do not require running them for presentation changes with unchanged SQL/wire behavior; no shared DB or cloud operation occurred.

Root typecheck and production build passed after final implementation. Lint initially caught a fixture startup rejection handler and later an unused test assignment; both were corrected and the final lint rerun passed. Offline documentation consistency and diff whitespace checks passed. Final focused/production-render and typecheck reconciliation are recorded with the completion checks below.

## Isolated browser evidence

The DEV-only /fixtures/i18n-phase2.html mounts real migrated components with intercepted fetch, synthetic configuration/auth/API responses and per-document in-memory session storage. It never calls original fetch or installs a synthetic session in the real app. Logs exclude auth bodies. Browser scenarios use synthetic group writes only, never shared TEST writes.

The group create drawer was inspected in all 20 combinations: zh-CN/en, light/dark, and 320x740, 393x852, 430x932, 768x1024 and 1440x1000. Both mobile stacked footers and wider horizontal actions remained reachable; long English member/help text wrapped without panel overflow. An early desktop capture during resize was incomplete and was recaptured after layout settled.

Observed interactions:

- A draft name and inactive-member selection survived switching; request counter stayed at 5. One synthetic save plus explicit configuration refresh increased it to 7, with original source names preserved.
- Delete confirmation initially focused Cancel. Switching translated the existing confirmation. Escape dismissed only the confirmation, retained its editor and returned focus to Delete; cancel/switch made no requests.
- A lost-response save retained its draft. Switching translated the already-visible unknown-result guidance; the request count stayed at 7.
- An open currency menu survived a real language-button click and translated its country labels; the selected currency and page-2 pagination remained unchanged.
- A 320px English login check exposed flex minimum-content overflow (352.34px panel). The corrected panel measured 273px in the 320px viewport; the final brand measured 141px within the corrected panel (brand right 268px, panel right 289px). English Family Ledger wrapped onto two lines.

Native window.confirm caused the browser automation adapter to time out during a synthetic dirty-discard check. It is a blocking browser dialog, not the reactive pilot confirmation. Do not claim that native-dialog automation passed. Stateful dirty/busy protections remain covered by existing fixtures. Public/auth form layouts, shell collapse/mobile navigation and complete confirmation/error matrices retain the authenticated/remaining visual gate below.

## Review and remaining acceptance

One independent review inspected working diffs and relevant untracked files against project/auth/group contracts. It found language clicks closing an open currency menu. A regression reproduced the failure, the handler was corrected, the regression passed, and a real browser click verified retention. Mechanical whitespace findings were corrected. The review's initial SSR-only coverage warning was addressed by stateful handler fixtures and the browser scenarios above. No other material defect was identified in reviewed error mapping, group entry, parser/revision, title or public-gate behavior.

Authenticated acceptance was requested asynchronously with the existing local URL and a normal-login handoff. No protected real page was inspected without confirmation. Full real-login shell/list/nonsubmitted-drawer coverage, auth layouts and remaining keyboard/error combinations are pending; isolated screenshots and synthetic sessions are not substitutes. Browser tooling provided DOM/request-counter evidence, not a real-network recorder. Existing Phase 1 acceptance does not waive this gate.

Deferred page bodies include dashboard/distributions, holdings, securities CRUD, accounts, transactions, spending/education, Settings administration and extra-password workflows. Caller-owned labels on those pages remain deferred; original artwork, user/source names, self-language labels and browser-controlled prompts are intentional exceptions. No whole-app bilingual completion or public English release is claimed.

Execution ruling: keep the progress ledger in existing ignored .local/i18n-phase2 rather than create a worktree/.superpowers directory, following the project checkout and authorization rules. If that scratch directory is removed, this evidence and the maintained plan preserve completed work and outstanding acceptance. No additional behavioral ruling or deferred code defect remains.

## Production bundle and completion checks

Production JavaScript totals 1,126,551 bytes raw and 340,071 bytes gzip. Compared with the Phase 1 evidence totals (1,105,394 / 331,627 bytes), the delta is +21,157 raw and +8,444 gzip bytes. The baseline uses the recorded Phase 1 result, not a new baseline rebuild. After the authenticated shell corrections, CSS is 94.82 kB / 17.52 kB gzip in the final build report after the final Retry correction. Bundled dictionaries are intentional; no lazy resource service was added.

Production asset inspection found no Phase 2 fixture name/banner/token, foundation preview markers or rendered language-switch class. Real-component production rendering ignores stored English, does not read language storage, rejects English switches and exposes no language controls. The isolated HTML/CSS entry is outside production build inputs.

No issues, commits, pushes, deployments, migrations, infrastructure/configuration changes or shared writes occurred. Implementation and isolated verification are complete; authenticated/remaining visual acceptance is pending. Public switching remains withheld, and later phases are not unlocked by this qualified acceptance.

Final reconciliation passed after the last test changes: root typecheck, new Phase 2 checks and verification-tooling fixtures. Root lint passed; the production build passed for final application code. The final reviewed inventory reports no stale audit diagnostics. The user agreed to log in and confirm readiness; authenticated target-page confirmation remains outstanding. Final source-copy audit found no hardcoded Chinese in the migrated auth, shell, shared and pilot components audited; original Chinese brand lettering lives intentionally in BrandName/resources. There are no uncommitted delivery actions to verify.

## Authenticated read-only follow-up (2026-11-07)

The user explicitly confirmed normal login and /instruments?tab=groups readiness and requested read-only acceptance. The existing user-owned browser tab was actually on /instruments; the visible Group management tab opened the requested query route. No bypass banner was present, and no bypass flag/configuration was changed. No credentials were entered or read by the agent. The configured local environment file has neither bypass flag enabled; the existing process environment was not independently introspected.

Scoped result: authenticated shell/group read-only acceptance passed. The full Phase 2 visual status remains partial because the complete auth/startup/forced-session layout matrix is not certified by this follow-up.

- Inspected the real group create drawer in zh-CN/en at 320x740, 393x852, 430x932, 768x1024 and 1440x1000, in native dark styling and temporary local light styling (20 combinations). Footer actions remained reachable, labels wrapped, all 16 noncash member controls remained present and the drawer had no horizontal overflow.
- Inspected real group lists, horizontal table behavior, expanded/collapsed desktop navigation, translated compact controls and mobile overlays. Source group/security names remained unchanged; the securities page body remains outside migrated scope.
- Verified Tab from Save wraps to Close, Shift+Tab from Close wraps to Save, and Escape closes an unchanged drawer and restores focus to Create group. No save was activated. Opening the existing S&P500 editor and switching language retained its original name and four selected members; Escape closed it without a discard prompt or mutation.
- Found a mobile layout defect: the new language-control child auto-placed in the second grid column, horizontally scrolling/clipping navigation; its added height also let Settings overlap Logout. The fix assigns a full-width language row, bounds the menu width, wraps long navigation labels and sizes rows to their content. The failing 320px English menu was observed before the fix; afterward scrollWidth equalled clientWidth, Settings ended at 600px and Logout began at 616px. Both languages and the wider mobile sizes were rechecked. Compact desktop language buttons were also bounded to their available width.
- Light inspection used a temporary local stylesheet overlay derived from the existing light rules because browser evaluation is read-only and saving an account theme would exceed this check. Preliminary captures with an incomplete override were discarded; corrected captures included the English branding rules and light native controls. The override was removed byte-for-byte using the final stylesheet backup; only the intentional navigation fixes remain.
- Restored original English language, expanded desktop sidebar and native dark styling, closed drawers/mobile navigation, retained /instruments?tab=groups and reset the viewport override. The user-owned tab was preserved. No group, instrument, transaction, password or server preference was submitted, and there was no commit/push/deployment.

The browser adapter does not expose a network recorder/resource-timing surface, so exact real-session switch-only request counts are not claimed. Controlled request-count/transport evidence remains in the isolated fixtures. This follow-up does not claim native discard-dialog automation or live failure/password-mutation acceptance.

After the CSS correction, root lint/typecheck/build, all five i18n checks and investment-groups-client passed again. Documentation consistency and whitespace review also passed. JavaScript totals and gate/fixture marker checks remain unchanged; CSS totals above reflect the correction. No unresolved material defect was observed in the inspected authenticated scope.

## Final isolated auth/startup acceptance (2026-11-07)

The user explicitly requested completion of the remaining auth/startup visual scope with isolated password/failure scenarios and shared data kept read-only. That scope passed. This supersedes earlier pending/partial auth/startup statuses in this execution history. It completes local Phase 2 acceptance, not whole-app English support or delivery authorization.

The separate localhost fixture document intercepted every application fetch, returned synthetic config/auth/API responses and used per-document in-memory sessionStorage. It never called the original fetch. The real logged-in 127.0.0.1 app was left on its group page. No real credentials, account preferences, passwords or shared ledger data were submitted. No auth request bodies were logged. The fixture now derives its surface from the actual memory-router location and uses the real App/ProtectedApp session boundary for loading and failure; startup layout mounts the actual StartupFailure component. Existing bundled startup success/failure checks independently verify bootstrap ordering.

### Layout matrix and visual review

Eight surfaces were checked at each of the 20 combinations: login with passwordChanged/logoutUnconfirmed feedback, administrator-contact recovery, reset-route alias, ordinary password change, forced password change, startup configuration failure, session dependency failure and persistent session loading. Each received browser DOM bounds/overflow/lang/theme/resource-key checks: 160 layout checks, no remaining defect. Twenty representative screenshots were inspected, one per combination, covering every surface across the set; this is not a claim that all 160 renders were individually screenshot-reviewed. Additional screenshots cover validation/errors, the corrected Retry target, success feedback and narrow-screen footer reachability.

| Language/theme | 320x740 | 393x852 | 430x932 | 768x1024 | 1440x1000 |
| --- | --- | --- | --- | --- | --- |
| English/light | Login feedback | Recovery | Reset alias | Ordinary password | Forced password |
| English/dark | Ordinary password | Forced password | Startup failure | Session failure | Session loading |
| Chinese/light | Session failure | Session loading | Login feedback | Recovery | Reset alias |
| Chinese/dark | Recovery | Reset alias | Ordinary password | Forced password | Startup failure |

All eight surfaces received layout checks in every cell; the table names the representative screenshot. Long English text wrapped without horizontal panel overflow. A tall 320px login retained ordinary page scrolling: keyboard focus reached Forgot password, with its footer bottom at 697.22px in the 740px viewport after scrolling. Email -> Password keyboard order was verified. No focus trap was introduced on nonmodal auth pages.

The session-error Retry button was visually found below the 44px target. It now uses the existing secondary-button styling and an explicit button type, with a 44px minimum direct-panel action height. Reinspection measured 44px height at 320px, with coherent dark/light styling. Its existing retry callback and request behavior are unchanged.

### Isolated interaction evidence

- Empty and invalid email, empty current password, short/overlong Unicode password and mismatched confirmation produced localized accessible errors without auth mutations. Validation-only request count stayed at 3 (synthetic bootstrap and session restoration).
- Login 401 rejection made count 3 -> 4; switching translated the visible rejection and left it at 4. Explicit 403/429/503 responses showed access, throttling and dependency guidance; each switch retained count 4. Raw synthetic server messages were not displayed.
- A forced password failure showed complete recovery guidance; fields cleared after the request as specified. Switching translated the already-visible error without another request (4 -> 4).
- A delayed synthetic password operation remained pending/disabled while language changed. After the original response it navigated to login with translated passwordChanged feedback. Exactly one /auth/change-password request was recorded. The browser redacts password values, so exact retained-value/Unicode-boundary assertions rely on the stateful client/auth fixtures, rather than inferred lengths from redacted DOM.
- Synthetic logout failure made one /auth/logout request and navigated to the local-logout/server-revocation-unconfirmed warning. The real user session was not involved. Reset-route recovery returned to the login view through its actual link.
- Session 403 failure translated on switch with count 3 -> 3. Explicit Retry alone added one session read (3 -> 4). Persistent loading translated with count 3 -> 3. Startup text and document title translated with count 3 -> 3.
- A delayed login retained its masked fields and disabled pending button across switching, with exactly one exercised login POST. The original request completed session acquisition and navigation; no language-triggered replay occurred. The log contains one additional bootstrap login POST, explicitly excluded from the exercised-action count.

Only synthetic fixture mutations were exercised. A delayed-response wait initially exceeded the browser locator deadline; the subsequent observed success confirmed the same original request completed. Fixture bootstrap delay was separated from exercised-request delay to make the scenario repeatable. These are tooling/fixture corrections, not a live-auth recovery action.

### Final validation and status

After the Retry/fixture changes, root lint, typecheck and production build passed, plus reviewed i18n/i18n-resources/i18n-client/i18n-phase2/i18n-phase2-client, auth, session-reads, investment-groups-client and tooling checks. Exact effect fingerprints were reviewed for the render-only Retry change and the intercepted fixture dependencies. Production asset inspection again found no fixture/preview/control markers. Current JavaScript totals are 1,126,594 raw / 340,072 gzip bytes (+21,200 / +8,445 vs recorded Phase 1); CSS is 94.82 kB / 17.52 kB gzip.

The isolated tab was closed and viewport override reset. The real user-owned tab/session/data remained untouched by these scenarios. Remaining limits are the already-recorded lack of a real-network recorder and native discard-dialog automation, not an unfinished auth/startup visual matrix. No unresolved material defect was observed in Phase 2's inspected scope. Public switching remains disabled outside the exact local DEV gate, and Phases 3–5 remain Not started. No commit, push, deployment, migration or shared-data repair was performed.

## Authorized TEST delivery

After local acceptance, the user explicitly authorized committing/pushing Phase 2 to test and monitoring CI and its configured automatic TEST deployment through verification. [issue #137](https://github.com/bluewuxi/family-ledger/issues/137) is the durable delivery record for the exact release commit, workflow result and publication evidence after completion. This supersedes the earlier implementation-only delivery limit; no migration, repair, manual deployment or later-phase work is authorized.

Before delivery, root lint/typecheck/build, docs/diff review and all 24 selected reviewed core/focused checks passed again. The additional unchanged verify:docs-tests entry is classified unreviewed in the local runner and was not bypassed; hosted CI independently runs its configured documentation fixtures. Automatic deployment was confirmed enabled, and the unchanged migration/infrastructure source scope was reviewed.

The first delivery run stopped in CI before deployment: the existing complete-migration approval codec fixture used the current commit and wall-clock timestamp, making its compressed size vary around the 4 KB SSM limit even with an unchanged manifest. The failure reproduced locally after the Phase 2 commit. The corrective fixture pins those two metadata fields to the first release commit and a fixed timestamp, separately checks generated approval metadata, and retains every current migration entry, legacy gzip compatibility, manifest mismatch detection and oversized-record rejection. Production encoding, its size limit, approval records and deployment gates are unchanged. Current migration approvals have little size headroom; any future registration must still pass the production size guard. The exact reviewed effect fingerprint was updated after inspecting this assertion-only change. Issue #137 records subsequent verification and publication outcomes.
