# UI Internationalization Phase 2 Implementation Plan

> **For agentic workers:** After explicit implementation authorization, use `superpowers:executing-plans` for inline execution or `superpowers:subagent-driven-development` if delegated execution is selected. Follow the checkboxes and project compatibility rules; no automatic commits or worktrees.

**Status:** Implemented — locally validated; Phase 2 local visual acceptance complete. See [execution evidence](../releases/2026-11-07-ui-internationalization-phase-2.md).

**Goal:** Make authentication, the application shell, shared controls and one complete investment-group management workflow bilingual in local preview, proving stable interaction and actionable error translation.

**Architecture:** Extend the existing singleton, typed bundled resources and local-only gate. Store language-independent error descriptors and translate at render time. Migrate the existing group manager/editor as the pilot, including its route-loading boundary, without translating the remaining investment screens.

**Tech Stack:** Existing React 19, TypeScript, Vite, i18next 26.7.2, react-i18next 17.1.13, pnpm and reviewed assertion/esbuild fixtures. No new runtime dependency or test framework.

**Spec:** [Approved overall design](../specs/2026-11-07-ui-internationalization-design.md), [phased roadmap](2026-11-07-ui-internationalization-roadmap.md), [maintained foundation](../specs/ui-internationalization.md), [frontend guidelines](../frontend-guidelines.md), [Auth](../auth.md), and [investment-group behavior](../specs/investment-overview.md#custom-investment-groups-local-implementation).

## Baseline, prerequisite evidence and authority

Planning baseline: clean `test` checkout at `7bdcd5061177e66b8feda012b8f9fcaf7e7b7955`. Reinspect HEAD/index/working/untracked changes before execution. Use the existing checkout and preserve unrelated work.

[Phase 1 evidence](../releases/2026-11-07-ui-internationalization-phase-1.md) records the three i18n checks, affected regressions, lint/typecheck/build, independent review and scoped bilingual/theme/five-viewport foundation acceptance. Its logout/storage behavior used fixtures; its visual evidence covered the synthetic foundation panel, not migrated workflows. Those limits are not Phase 2 acceptance. The existing public gate and formatter signatures are implemented and reusable. Phase 1 delivery authorization does not extend to this phase.

Read [root AGENTS.md](../../AGENTS.md), [web](../../apps/web/AGENTS.md), [shared](../../packages/shared/AGENTS.md) and [scripts](../../scripts/AGENTS.md), plus [workflow](../project-workflow.md#superpowers-compatibility), [architecture](../architecture.md#code-organization), [API response contract](../api.md#response-contract), the investment-group API section, [group design](../specs/2026-11-06-investment-groups-design.md), [time policy](../time-policy.md), [financial values](../data-model.md#financial-values), [frontend guidelines](../frontend-guidelines.md) and [local testing](../local-testing.md#authenticated-browser-acceptance). API instructions were inspected during planning; no API implementation change is currently needed.

The subsequent user request authorizes Phase 2 implementation, validation and review. No new dependencies were required. Issues, commits, pushes, deployments, migrations, shared TEST writes and later-phase planning remain excluded.

## Scope and pilot decision

The proposed pilot is **investment-group maintenance**, from direct `/instruments?tab=groups` entry through configuration load, empty/list states, create/edit drawer, member selection/movement, validation, save/delete, stale conflict, explicit reload and return link. It already has a real form, a drawer, meaningful error paths and isolated regression checks. This is the Phase 2 roadmap's one pilot, not execution of Phase 3. Dashboard distributions, security CRUD, valuation/charts, accounts and transactions remain outside this plan.

Included authentication is login, administrator-contact recovery (including the reset-route alias), self-service/forced password change, session-loading/failure, logout feedback and startup configuration failure. Administrator reset controls embedded in Settings, user/access management and extra-password workflows remain Phase 4. Recovery here does not add email reset or registration.

Shared coverage is explicit: shell navigation/brand/footer, document titles, loading and empty defaults, pagination, back-link accessible names, currency country labels, drawer close/dismissal copy, and workflow-departure prompts. Caller-supplied business labels remain the responsibility of their workflow phase. Shared control translation does not certify the pages containing those controls.

## Global constraints

- Language IDs `zh-CN` and `en`; display locales `zh-CN` and `en-NZ`; Chinese default and browser-local persistence independent of account/logout.
- Keep Phase 1's exact Vite DEV + loopback gate (`localhost`, `127.0.0.1`, `[::1]`). Public builds remain Chinese even with stored English. No deployment/env/auth configuration change.
- Offer `中文` / `English` controls at login and in the shell only inside that gate. Retain the partial-translation notice. No public release switch before Phase 5.
- Switching preserves route/query, drafts, selected IDs, page/filter state, open overlays, focus, pending operations and session. It must cause zero additional ledger/auth requests, cache invalidations, form submits or automatic retries.
- Preserve source/user names, instrument names, original artwork and stable IDs. Preserve Chinese business wording, formulas, order, currency, gain colors, permissions and date semantics.
- Complete sentences and typed semantic keys; plain `{{identifier}}` interpolation only. No raw `error.message` translation, HTML interpolation or arbitrary server error text in migrated surfaces.
- Preserve admin-only group configuration access, original-revision writes, canonical validation and no automatic replay. TEST data is real family data; all mutation/error injection runs in isolated fixtures.
- No later-phase implementation, financial/schema changes, new localization service, cross-device sync or new framework.

## Review focus

1. A failure already visible when language changes must retranslate without rerunning validation or a request (Tasks 1, 3, 5).
2. Language renders must not close/reinitialize navigation, drawer, draft or pending write, including rapid switches (Tasks 2, 4, 5).
3. Direct pilot entry with slow/failed instrument reads must not render the untranslated securities branch or a usable incomplete member selector (Task 5).
4. Native form validation and blocking confirmation dialogs can otherwise keep browser-language copy or prevent live retranslation (Tasks 3–5).
5. Distinguish revision conflict, invalid input, access denial, dependency outage and uncertain mutation outcome without exposing raw payloads or replaying writes (Tasks 1, 5).

## File map and dependency order

| Files | Responsibility |
| --- | --- |
| New `apps/web/src/i18n/uiErrors.ts` | Typed presentation descriptors and code/context mapping |
| New `apps/web/src/i18n/resources/{zh-CN,en}/{auth,navigation,errors,investmentGroups}.ts`; existing `common.ts` | Complete Phase 2 copy; glossary additions |
| Existing `resources.ts`, `instance.ts`, `resourceValidation.ts`, `typecheck.ts` | Register/check new namespaces; metadata ownership |
| New `apps/web/src/components/LanguageSwitch.tsx`, `BrandName.tsx`, `RouteDocumentTitle.tsx`, `StartupFailure.tsx` | Gated controls, brand presentation, title ownership and localized bootstrap failure |
| Existing `main.tsx`, `App.tsx`, `lib/authContext.tsx` | Startup/session presentation with stable router/provider identity |
| Existing `pages/LoginPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `ChangePasswordPage.tsx` | Entire in-scope auth flow |
| Existing `lib/navigation.ts`, `components/Layout.tsx`, `PageBackLink.tsx`, `LoadingState.tsx`, `PaginationControls.tsx`, `PlaceholderTable.tsx`, `CurrencySelect.tsx` | Shared presentation; stable navigation IDs |
| Existing `components/Drawer.tsx`, `lib/useEditDismissal.ts`, `lib/useWorkflowDeparture.ts` | Localized dismissal without changing dirty/pending rules |
| New `components/ConfirmationDialog.tsx` | Reactive nonblocking confirmation for pilot delete/reload |
| Existing `pages/InstrumentsPage.tsx`, `components/investments/InvestmentInstrumentTabs.tsx`, `InvestmentGroupsManager.tsx`, `InvestmentGroupEditor.tsx` | Complete pilot and its enclosing entry/loading/error boundary |
| Existing `packages/shared/src/investmentGroups.ts` | Add typed local validation reasons without changing accepted inputs/messages |
| New `apps/web/verify-i18n-phase2.ts`, `verify-i18n-phase2-client.ts`; existing group/i18n checks | Mapping, bilingual surface, state and transport fixtures |
| New `apps/web/src/fixtures/I18nPhase2Fixture.tsx` | Isolated real-component browser scenarios, DEV-only with no real transports |
| Root `package.json`, `tsconfig.verification.json`, `scripts/verification/registry-data.json` | Register/typecheck/effect-review checks |
| `apps/web/src/styles.css`, maintained i18n/frontend/local-testing docs, roadmap/map | Necessary English wrapping/control layout and accurate coverage/evidence |

Tasks execute in order. File lists are exhaustive planned scope; discover a required dependency before editing it and record any narrow addition in this plan. No refactor of unrelated large pages. Execution adds only the isolated fixture HTML entry and its separate CSS to the file map; these reuse the existing Vite fixture mechanism without changing Vite configuration.

## Task 1: Establish reactive error descriptors and namespace coverage

**Interfaces:** In `uiErrors.ts`, export a discriminated `UiErrorDescriptor` union containing semantic `key` and key-specific safe `params`, `UiErrorContext = "login" | "session" | "changePassword" | "groupLoad" | "groupSave" | "groupDelete"`, `describeUiError(error: unknown, context: UiErrorContext): UiErrorDescriptor`, and `translateUiError(error: UiErrorDescriptor, language: UiLanguage): string`. Keys are restricted to `errors` resources; parameters must never contain credentials, raw exception messages, traces or request bodies. Store descriptors in component state and translate on render.

- [ ] Add both-language resources for error keys covering invalid credentials, session expired, forbidden, password change required, rate limit, service unavailable, missing API config, stale session/scope, scope refresh, unknown failure, group conflict/not-found/invalid input, and uncertain write outcome. Context distinguishes login rejection from current-password rejection; preserve the existing password-change recovery guidance as a complete sentence.
- [ ] Write mapping assertions for `AuthClientError` and `ApiClientError` codes/statuses: `MISSING_SESSION`/401, `FORBIDDEN`/403, `PASSWORD_CHANGE_REQUIRED`, 429, `DEPENDENCY_UNAVAILABLE`/503, `MISSING_API_BASE_URL`, `STALE_SESSION`, `STALE_SCOPE`, `SCOPE_CHANGED`, group `CONFLICT`/409, `NOT_FOUND`/404, and `VALIDATION_ERROR`/400. Unknown read failures use safe retry guidance; unknown save/delete outcomes explicitly require checking before retry and never imply definite rollback.
- [ ] Test an arbitrary Error containing a secret-like marker and malformed thrown values: neither output nor descriptor contains the marker. Translate the same descriptor in both languages without changing it or executing a request. Known group API 400 retains the existing combined name/member guidance; do not infer finer database reasons from message strings.
- [ ] Add `InvestmentGroupInputError extends Error` and `InvestmentGroupInputReason = "invalid_request" | "invalid_revision" | "invalid_name" | "invalid_members" | "duplicate_members"` in shared `investmentGroups.ts`. Replace existing parser throws with typed errors retaining their exact Chinese messages and rules. This is additive local error metadata, not a new HTTP envelope. Web maps `reason`, never message text; API behavior remains unchanged.
- [ ] Assert trim/code-point limits, UUID normalization, duplicate members, invalid revision/extra keys retain previous success/failure behavior and messages. Existing API catches still yield the same code/status/message; no schema or wire-contract change is required. Keep local duplicate-name hint a typed descriptor separate from parser failure.
- [ ] Add namespaces to resources, singleton namespace configuration and validator allowlist together; extend mutation/type checks for each namespace. Register `verify:i18n-phase2` (`tsx apps/web/verify-i18n-phase2.ts`) with reviewed local-fixture effects and verification TypeScript inclusion. Demonstrate failing assertions before implementation, then run the check and existing resource/shared-group checks through the runner until passing.

## Task 2: Translate shell navigation and own document titles

**Interfaces:** `LanguageSwitch(): ReactNode` uses existing `useUiLanguage` and gate, returning null outside local preview. `BrandName({ className? }: { className?: string }): ReactNode` preserves Chinese styled lettering but renders `Family Ledger` for English; original image assets are unchanged. Navigation descriptors use stable `group: "overview" | "investment" | "family" | "tools" | "about"` and typed `labelKey`, not translated strings as identity. Preserve `getNavigationItem(path)` for icon lookup.

- [ ] Add fixtures asserting route destinations/group membership unchanged, `tools` still renders bottom utilities, `about` remains out of primary navigation, and English labels/tooltips/accessible names resolve without resource keys or Chinese fallback. Update source-coupled existing navigation checks where needed without weakening route/access assertions.
- [ ] Translate shell labels, mobile controls, collapsed tooltips, logout, footer motto, brand accessible names and local-debug banner (without enabling bypass). Include gated language controls in expanded desktop/mobile shell, with an accessible compact placement when collapsed. Retain sidebar/collapse state and stable keys; language is not a dependency of navigation-close effects.
- [ ] Introduce `RouteDocumentTitle(): ReactNode` inside the existing router. Resolve title keys for public auth routes and all existing route families, with specific account-create/detail/holding-detail and group-tab matches preceding broad parent matches. Translate document titles only, not out-of-scope page bodies; unknown paths get product-only fallback. Use `{{page}} · {{product}}` when a page is known.
- [ ] Resolve ownership with `instance.ts`: singleton continues `html.lang` and application-name metadata; route component exclusively owns routed titles after mount. Bootstrap failure owns its title outside the router. Remove unconditional language-change title resets that would overwrite the active route title; preserve product fallback before route mount.
- [ ] Assert a language switch changes title/lang but not pathname/query/history length, mounted child identity, sidebar state, session or request counts. Register `verify:i18n-phase2-client` (`tsx apps/web/verify-i18n-phase2-client.ts`) with effect review; run RED/GREEN client fixtures and Phase 1 client checks. Confirm production rendering exposes neither switch nor English even with stored `en`.

## Task 3: Migrate complete login, recovery and password-change states

**Interfaces:** Auth context exposes `error: UiErrorDescriptor | null` in place of rendered strings; request effects keep their existing dependencies. `StartupFailure(): ReactNode` uses `auth` resources under the existing provider. Form state remains local; no password/error persistence is added.

- [ ] Translate login branding, explanatory text, inputs/placeholders, loading, recovery link, `passwordChanged` success and `logoutUnconfirmed` warning. Translate recovery and the reset-route alias consistently. Translate ordinary/forced password-change guidance, inputs, return link, pending state, validation and logout. Do not migrate Settings' administrator reset form.
- [ ] Add explicit localized validation to these forms with `noValidate` and accessible errors while preserving required/email constraints. Use `input.validity` flags for email rather than inventing a different email grammar; never display browser `validationMessage`. Password change retains 8–128 Unicode code points, max 512 UTF-8 bytes and matching confirmation. Empty current-password fields must block requests. Keep existing post-request clearing and temporary-session restrictions; language alone clears nothing.
- [ ] Store validation and request descriptors, translating on render; do not concatenate raw errors with guidance. Replace auth-context presentation strings and App session-loading/retry copy without changing auth/session request behavior. No language or translation-function dependency may be added to session-fetch effects.
- [ ] Extract/translate bootstrap configuration failure within the provider, retaining runtime-config precedence and safe existing troubleshooting guidance. No new initialization retry or error logging of request bodies.
- [ ] Fixtures cover first stored-English local render, both recovery URLs, empty/invalid email, password boundary/mismatch, invalid credentials, permission/rate/dependency errors, forced password change, logout warning and bootstrap failure. Switch while fields/errors/pending requests are present: values and pending state survive, error translates, and only the original request completes. Use synthetic auth transport for password/logout mutations; preserve actual session-generation and invalidation behavior in existing auth/session checks.
- [ ] Run new mapping/client checks and existing `verify:auth`, `verify:session-reads`, `verify:i18n-client` through the reviewed runner. Do not claim live password-reset/change acceptance from fixtures.

## Task 4: Translate shared controls and reactive confirmations

**Interfaces:** Keep existing public control props compatible. Default `LoadingState`/`LoadingBlock` labels are resolved during render only when `label` is absent. `PageBackLink` interpolates its caller-supplied destination in localized return copy. New `ConfirmationDialog({open,title,message,confirmLabel,onConfirm,onCancel,busy?})` uses strings resolved each render; callbacks execute once and no ledger operation occurs on open/switch/cancel.

- [ ] Translate pagination full sentences and zero state with correct count parameters; currency country labels map from unchanged currency codes; placeholder empty state and drawer close labels use shared resources. Preserve caller-provided text, pagination arithmetic, currency selection and list IDs. No language-triggered `onPageChange`/`onChange` calls.
- [ ] Translate existing `window.confirm` dismissal messages at invocation in `Drawer`, `useEditDismissal` and `useWorkflowDeparture`. Browser beforeunload text is browser-controlled and documented as an exception. Native dialogs block interaction, so live switching is not claimed for them; next invocation uses current language. Keep dirty baselines/pending protections and blocker decisions unchanged; translation dependency changes must not retrigger navigation confirmation.
- [ ] Use the new nonblocking confirmation only for pilot delete and conflict-reload, where an already-open confirmation must retranslate. Follow existing focus containment, Escape/cancel, initial focus on Cancel, labelled dialog and return focus. Make nested drawer/dialog handling topmost-only so Escape cancels the confirmation, never both layers; inert underlying drawer while confirmation is open. Closing it restores focus inside the retained drawer.
- [ ] Fixtures cover zero/one/multiple pages, language change with nonzero offset, open currency menu, dirty/busy dismissal, route query departure, nested dialog focus return, single confirmation dispatch and cancel-with-no-request. Preserve existing behavior checks; no new test framework. Perform browser keyboard checks because mocked hooks alone cannot establish focus behavior.
- [ ] Run new client checks plus existing `verify:investment-groups-client` and `verify:interface-workflows` if present in the inspected inventory; resolve actual IDs before execution. Record any unmapped source checks rather than bypassing the registry.

## Task 5: Migrate the complete group-maintenance pilot

**Interfaces:** Keep API routes, `InvestmentGroupConfiguration`, mutation DTOs and `load/save/deleteInvestmentGroup` signatures unchanged. Manager/editor error state becomes `UiErrorDescriptor | null`; original revision/name/member refs and stable editor key remain independent of language. `ConfirmationDialog` handles delete/reload confirmation; successful user-confirmed mutations retain existing refresh behavior.

- [ ] Translate list help, columns/actions, empty/loading/read-error/retry states, drawer titles/fields/help/buttons, inactive/member status, move warning, duplicate-name validation, unknown-result guidance, conflict/reload and delete confirmation. Use whole-sentence interpolation for current group and source instrument names, retaining original names and IDs. Keep 1–32-code-point trimmed names, empty groups, noncash/inactive member rules and canonical server authority.
- [ ] In `InstrumentsPage`, explicitly handle requested group-tab instrument-loading and failure before rendering the manager. Derive role eligibility from authenticated session while preserving server checks; restricted/viewer users never request group configuration. Show translated loading/retry or access guidance for this branch, not an untranslated securities screen or an empty member selector caused by a failed instrument read. Once ready, translate the enclosing title, tabs and return-to-distribution link. Preserve route/query handling and existing instrument-list behavior outside this branch.
- [ ] Retain errors as descriptors including client parser reasons. Avoid native required-field validation copy in the group form using explicit accessible validation; match shared parser behavior. Conflict still disables save/delete until deliberate reload; reload confirmation drops the draft only after confirmation. Delete confirmation explicitly says members become ungrouped and securities/transactions remain.
- [ ] Write synthetic complete scenarios: empty/configured load; read failure/retry; create empty group; Unicode name boundaries and duplicate names; move an inactive noncash member; successful rename/member edit; delete cancel/confirm; 400 combined validation, 403, 404, 409, 503 and rejected transport after save. Assert exact method/path/body/original revision, one request per confirmed action, no retry on switch, and retained draft on failure. Delay responses and unmount to verify existing stale-result guards.
- [ ] Repeat switches with an open editor, member selection, dirty draft, error, pending save and open confirmation. Assert stable IDs/revision, focus, route/query, zero extra load/save/delete requests, and retranslated error/confirmation. Explicit user save/retry/reload is allowed to fetch as before; do not confuse those requests with language effects.
- [ ] Test viewer/restricted-session direct links do not fetch configuration or expose member counts; API authorization fixtures continue to pass. No dashboard distribution translation or security form migration is added. Return navigation is checked for destination/query preservation; untranslated destination content is outside pilot acceptance.
- [ ] Run new Phase 2 fixtures, existing `verify:investment-groups`, `verify:investment-group-api`, `verify:investment-groups-client`, i18n and auth/session checks with reviewed effects. Existing API behavior needs no new structured reason: its combined validation response remains equally actionable in both languages. If implementation discovers a lost actionable distinction, stop to amend this plan/API contract rather than parse arbitrary message text.

## Task 6: Verify real components, isolated writes and visual acceptance

**Files:** Add the DEV-only fixture from the map, extend focused checks and local-testing guidance; record evidence under `docs/releases/2026-11-07-ui-internationalization-phase-2.md` when work is actually performed (use execution date if later).

- [ ] Build an isolated fixture entry using real migrated components with synthetic auth/API adapters and a transport that rejects every unexpected request. Load it through the existing local preview mechanism only under the Phase 1 gate. Do not install a mock session in the real app, enable auth bypass, read secrets or point fixture writes at the configured API. Production bundle must omit fixture/control code.
- [ ] Exercise all write/error scenarios from Task 5 and password-change outcomes in this fixture. Verify React component identity, state, focus and request logs in a real browser in addition to assertion fixtures. Provide a development-only language control inside the active modal/drawer focus boundary so switching does not require breaking focus containment. Keep those controls out of production and ensure opening/closing does not overwrite drafts.
- [ ] Obtain agreement for authenticated acceptance, provide local URL, wait for actual user login and target readiness, and keep both bypass flags disabled. Inspect real shell, group list and nonsubmitted drawer; do not save/delete groups, change/reset passwords, or write preferences on shared TEST. If needed for visual theme coverage, use a temporary local DOM theme override without preference requests and restore it afterward.
- [ ] Record all 20 language/theme/viewport combinations at `320x740`, `393x852`, `430x932`, `768x1024`, and `1440x1000` (or actual recorded desktop size). Cover login/recovery/password-change layout, expanded/collapsed/mobile navigation, long English labels, shared controls, pilot list/drawer/errors/confirmation and keyboard focus/return. Public/auth-state fixtures and real-login scenarios must be labelled separately; synthetic forced-session checks are not authenticated acceptance.
- [ ] Record switch-only request counts with a browser network recorder if available; otherwise state that limit and retain instrumented fixture evidence. Compare route/query, form values, selected members and pending state before/after. A real logout/password change is not necessary to prove the code and must not be performed merely for screenshots.
- [ ] Audit hardcoded application-owned copy by the explicit scope above, including placeholders, aria labels, titles and failure paths. Record remaining source/branding/browser-dialog exceptions and deferred workflows. Resource parity alone cannot prove coverage. Never report the entire Instruments page or all Settings/auth administration as bilingual.

## Task 7: Final validation, review and Phase 2 handoff

- [ ] Inspect `corepack pnpm verify:checks -- list` and `corepack pnpm verify:checks -- plan --changed`; manually reconcile unresolved paths using Phase 1's documented discovery limitations. Review imported effects and fingerprints before registry updates; no approve-all refresh or blocked-run bypass.
- [ ] Run `corepack pnpm verify:checks -- run --check verify:i18n-phase2 --check verify:i18n-phase2-client --check verify:i18n --check verify:i18n-resources --check verify:i18n-client --check verify:investment-groups --check verify:investment-group-api --check verify:investment-groups-client --check verify:auth --check verify:session-reads`. Run affected existing shared-interface/navigation checks discovered in the inventory and `verify:tooling` for changed registration. Success requires every selected check executed with exit 0; report skipped/blocked checks accurately.
- [ ] Run `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build`, `corepack pnpm verify:docs` and `git diff --check`. Use root typecheck (Phase 1 recorded TS6310 with the package-local alternative). Inspect production bundle for absent DEV fixtures/switch UI and retained Chinese gate. Measure bundle delta without adding loading infrastructure.
- [ ] Review all changes since the execution baseline, unstaged/staged diffs and new files against contracts. Check shared parser compatibility, session invalidation, original revision, no automatic retries, descriptor safety, title ownership, untranslated pilot boundaries and public gating. Review code and actual evidence separately; uncommitted files count.
- [ ] Update foundation coverage/glossary, frontend/local-testing guidance, roadmap/map and this plan only from evidence. Record implementation, deployment and visual acceptance independently. Deferred/waived/blocked acceptance is never passed and does not unlock public English. Existing Phase 1 acceptance does not waive new UI checks.
- [ ] Handoff namespaces, typed error mapping, route-title rules, pilot coverage/exceptions, checks, bundle delta and remaining defects. Phase 3–5 implementation and detailed planning remain Not started. No delivery operation follows automatically.

## Exit and planning review

Phase 2 is accepted only when auth/shell/shared owned text and the complete pilot are bilingual in local preview, existing errors retranslate, state/focus and request isolation are verified, actionable failure distinctions are preserved, required checks and scoped visual evidence are recorded, and public switching remains unavailable. Pending visual evidence must qualify status explicitly.

Plan self-review maps roadmap scope to Tasks 1 (errors/resources), 2 (shell/titles), 3 (auth), 4 (shared controls), 5 (pilot) and 6–7 (acceptance/handoff). Review-focus cases have explicit tests. No API schema migration or broad backend localization is planned. Proposed choices for user review are the group-maintenance pilot, typed local parser errors, and nonblocking pilot confirmations. Recommend inline execution because these tasks share error/resource/state interfaces; delegated execution is available if selected after plan review.

## Execution record (2026-11-07)

Tasks 1–5 are implemented. Tasks 6–7 have automated verification, independent review and scoped isolated browser evidence; the user subsequently confirmed normal login/readiness, and scoped authenticated shell/group acceptance passed. Remaining auth/system visual coverage is still pending. The detailed evidence record owns exact checks and coverage limits. Unchecked visual/login steps remain outstanding; the phase is not fully visually accepted. The plan checklist is retained as the original acceptance inventory, not a claim that every scenario ran.

Baseline was test at 7bdcd5061177e66b8feda012b8f9fcaf7e7b7955 with existing user planning changes in docs/README.md, docs/roadmap.md, the design/roadmap and this untracked plan. Those changes were preserved. The ignored progress ledger is .local/i18n-phase2/progress.md; no commits or delivery actions occurred.

Execution ruling: use the repository's existing ignored .local directory for progress/evidence instead of adding a .superpowers workspace or a worktree. This follows the project checkout/authorization rules and keeps scratch artifacts out of version control.

Authenticated follow-up: inspected both languages/themes at all five drawer viewports, existing member retention, keyboard entry/containment/return, mobile menus and collapsed/expanded desktop shell. Fixed discovered mobile grid placement/overlap and compact language-button width; required checks passed again. Temporary light-theme CSS was restored and the original dark/en/expanded state and viewport were restored. See the evidence record for the exact scope and network-recorder limit.

Final auth/startup follow-up: local Phase 2 visual acceptance is complete. Eight real-component surfaces received 160 layout/bounds checks across the 20 language/theme/viewport combinations, with 20 representative screenshots plus interaction captures. Isolated browser scenarios cover validation, errors, pending/success/logout outcomes, session loading/retry and startup titles. The fixture now follows memory-router navigation and mounts the actual App session boundary. The only application correction was a styled, 44px session Retry control. All password/auth mutations stayed synthetic; no shared writes or delivery operations occurred. See final evidence for sampling, redaction and network-recorder limits. The original unchecked inventory above is historical; this execution record and dated evidence own completion status.

## Authorized TEST delivery

The user subsequently authorized committing and pushing Phase 2 to test and monitoring CI plus automatic TEST deployment through publication verification. [issue #137](https://github.com/bluewuxi/family-ledger/issues/137) records the release commit, workflow results and final publication evidence. This supersedes implementation-only delivery exclusions above; migrations, repairs, independent configuration, manual deployment/recovery and later-phase work remain unauthorized. No working-tree content outside Phase 2 is included.
