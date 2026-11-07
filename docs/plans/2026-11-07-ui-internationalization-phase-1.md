# UI Internationalization Phase 1 Implementation Plan

> **For agentic workers:** After explicit implementation authorization, use `superpowers:executing-plans` for inline execution, or `superpowers:subagent-driven-development` if the user chooses delegated execution. Track the checkboxes below. Project compatibility rules override automatic commits and worktrees.

**Status:** Approved and locally implemented. Phase 1 validation/review and scoped foundation acceptance are recorded in [local evidence](../releases/2026-11-07-ui-internationalization-phase-1.md). Phase 1 commit/push and automatic TEST delivery were subsequently authorized under [#136](https://github.com/bluewuxi/family-ledger/issues/136); later phases remain unauthorized.

**Goal:** Establish a verified Chinese/English frontend foundation while preserving the current Chinese application and withholding the public language switch.

**Architecture:** Bundle typed TypeScript resources with one application i18n instance. Initialize browser-local language before React renders, independently of authentication and server preferences. Extend existing presentation helpers with explicit locale arguments; migrate application callers only in their later workflow phases.

**Tech Stack:** Existing React 19, strict TypeScript, Vite, Corepack/pnpm and assertion/esbuild verification scripts; add only `i18next` and `react-i18next` as direct runtime dependencies during authorized implementation.

**Spec:** [Approved design](../specs/2026-11-07-ui-internationalization-design.md), [approved phased roadmap](2026-11-07-ui-internationalization-roadmap.md), and maintained [frontend guidelines](../frontend-guidelines.md).

## Baseline and required handoff reading

Planning inspected `test` at `bc51878b116318656a545207190076226e937505`, with a clean index and working tree. Re-record branch, HEAD, index, working tree and untracked files before execution; preserve unrelated changes. Use this checkout, with no implicit branch/worktree creation, issue, commit, push, deployment, migration or shared-data writes.

Every executor reads [root instructions](../../AGENTS.md), [web instructions](../../apps/web/AGENTS.md), [script instructions](../../scripts/AGENTS.md), [project workflow](../project-workflow.md#superpowers-compatibility), the design and roadmap. Also read [architecture](../architecture.md#code-organization), [auth](../auth.md#password-and-session-lifecycle), [preferences API](../api.md#user-preferences-api), [financial values](../data-model.md#financial-values), [time policy](../time-policy.md), [investment overview](../specs/investment-overview.md), and [local testing](../local-testing.md#verification-entry-point). Shared/API implementation changes are not planned; if genuinely required, stop to reconcile scope and read those directories' AGENTS.md before expanding the plan.

Observed integration points:

- `main.tsx` waits for runtime configuration, clears legacy auth storage, then renders one router. Keep that configuration precedence and router identity.
- `PreferencesProvider` mounts inside the authenticated subtree and its key changes on user/scope changes. Language must live outside that provider and must not call the preferences endpoint.
- Number helpers hardcode `zh-CN`; prices allow four decimals, amounts three, whole amounts zero, and percentages exactly one. Percent inputs are percentage points; callers own the percent suffix.
- `timeFormat.ts` already delegates business dates and timestamp formatting to shared helpers. `spendingFormat.ts` preserves decimal strings without a Number conversion.
- Existing assertion/esbuild checks and the effect-audited verification registry support focused checks without a new framework. `verify-time-policy.ts` currently checks Chinese text in the time-helper source; replace only that brittle assertion with behavioral resource-backed assertions when moving the text.

## Global constraints

- Supported language IDs: `zh-CN` and `en`; English display locale: `en-NZ`; default: `zh-CN`. No system-language detection.
- Product display names are `金财屋` and `Family Ledger`; original logo artwork is preserved.
- Browser-local choice survives logout; storage failure retains an in-memory choice. No per-account language field, server preference write or cross-device synchronization.
- Switching never reloads, changes routes, remounts the application, clears caches, refetches ledger data or submits forms.
- Locale never selects report currency, gain-color scheme, timezone, business date or sort order. Preserve Shanghai `06:00`, viewer-local timestamp display and timezone-free calendar dates.
- Use complete sentences, semantic typed keys, explicit domain mappings and safe interpolation. Preserve source/user content and identifiers. Chinese fallback is not translation completeness.
- No remote resource backend, detector plugin, translation platform or lazy-loading infrastructure.
- Public switching stays unavailable until Phase 5 readiness. Phase 1 does not translate login, navigation, business workflows, API errors or chart call sites.
- Repository prose and identifiers remain English; Chinese is allowed for translation copy and quoted UI labels. Current Chinese-only production guidance remains valid, with only a narrowly described development foundation added.

## Review focus

1. Throwing storage getters/read/write operations must not prevent language initialization or lose the session's chosen language (Task 2).
2. A stored English choice on a non-preview build must not expose a partially translated application (Tasks 2 and 5).
3. Missing plural forms or mismatched parameters must fail even if runtime fallback produces readable Chinese (Task 3).
4. Blank/invalid numbers, signed rounded zero and large exact spending strings must keep their existing meaning (Task 4).
5. Repeated switches must not remount stateful children or trigger requests; dates near midnight/DST/cutoff must keep their original semantics (Tasks 4 and 5).

## File and interface map

| Files | Responsibility |
| --- | --- |
| `docs/specs/ui-internationalization.md` (new at implementation) | Foundation conventions, initial glossary, formatter contract and migration coverage ledger; link approved overall design without claiming complete delivery |
| `apps/web/src/i18n/language.ts` | Pure language validation, display-locale mapping, defensive storage adapter and preview eligibility |
| `apps/web/src/i18n/resources/{zh-CN,en}/{common,format,preview}.ts`, `resources.ts`, `types.d.ts` | Bundled namespace resources and i18next key typing |
| `apps/web/src/i18n/instance.ts`, `LanguageProvider.tsx` | Singleton initialization, persistence, language subscription and document metadata |
| `apps/web/src/i18n/DevelopmentLanguagePreview.tsx` | Loopback-development-only controls and synthetic foundation samples; no ledger requests |
| `apps/web/src/main.tsx` | Initialize foundation before existing render; stable provider above router |
| `apps/web/src/lib/numberFormat.ts`, `timeFormat.ts` | Backward-compatible explicit-locale presentation |
| `apps/web/verify-i18n.ts`, `verify-i18n-resources.ts`, `verify-i18n-client.ts` | Lifecycle/formatter, resource mutation, and bundled client/gate fixtures |
| `apps/web/src/i18n/resourceValidation.ts` | Pure completeness diagnostics, used by verification only and not imported by app startup |
| `apps/web/src/i18n/typecheck.ts` | Compile-only positive and expected-error resource-key examples; no runtime import |
| `apps/web/package.json`, `pnpm-lock.yaml`, root `package.json`, `tsconfig.verification.json`, `scripts/verification/registry-data.json` | Dependencies, check aliases, checking scope and reviewed effects |
| `scripts/verify-time-policy.ts`, `docs/local-testing.md`, `docs/frontend-guidelines.md` | Preserve time behavior checks; document foundation verification/preview boundaries |
| Roadmap, documentation map and this plan | Evidence-based Phase 1 status and handoff only |

New paths above are planned, not existing deliverables. No `App.tsx`, auth client, preferences API, schema, deployment configuration, chart or workflow migration is planned.

## Task 1: Define conventions and financial terminology

**Files:** Create `docs/specs/ui-internationalization.md`; narrowly update `docs/frontend-guidelines.md`.

**Interfaces:** Establish namespaces `common`, `format`, `preview`; subsequent workflows add their own namespace when migrated. Resource shape is nested string leaves with semantic camelCase keys, not Chinese source text as keys.

- [x] Write the foundation contract with language/storage/release-gate behavior from this plan and links to the maintained owners. Describe it as Phase 1 only, not whole-app bilingual support.
- [x] Add a glossary table containing Chinese label, English term, semantic key proposal, definition and owner link. Cover total assets, net assets, cumulative net investment, lifetime investment profit, period investment profit, unrealized gain/loss, latest change, available cash, price, quantity, exchange rate and valuation date. Distinguish account/portfolio profit from position unrealized gains; period profit has no return percentage. Preserve existing Chinese wording and do not standardize distinct metrics onto one key.
- [x] Record exact initial conventions: `common.productName` is `金财屋` / `Family Ledger`; self-language controls are always `中文` / `English`; no flags. `format.localTimeNote` takes `value`; `format.businessDayCountdown` takes `date` and `duration`; `format.hoursMinutes` takes zero-padded `hours` and `minutes`. English copy: `{{value}} (local time)`, `Business day {{date}} ends in {{duration}}`, `{{hours}}h {{minutes}}m`. Chinese output remains identical to existing helpers.
- [x] Create a coverage ledger: foundation resources/helpers covered here; login/shell/shared errors and pilot deferred to Phase 2; investment and other workflows retain the roadmap's phases. Track source-data/original-artwork exceptions with file/scope and reason; no blanket CJK ban or blanket exception for all Chinese strings.
- [x] Review every glossary definition against investment/API/data contracts and every convention against the approved design. Run the documentation check and `git diff --check`. No automatic commit.

## Task 2: Add typed resources and a defensive language lifecycle

**Files:** Create language/resources/typing/instance files from the map and `apps/web/verify-i18n.ts`; update dependency, check registration and TypeScript files.

**Interfaces:** Export `type UiLanguage = "zh-CN" | "en"`, `type DisplayLocale = "zh-CN" | "en-NZ"`, `parseUiLanguage(value: unknown): UiLanguage | null`, `getDisplayLocale(language: UiLanguage): DisplayLocale`, and `isLocalLanguagePreview(dev: boolean, hostname: string): boolean`. Storage access is injected as `getStorage: () => Pick<Storage, "getItem" | "setItem">`; catch getter as well as method failures. Use key `family-ledger.uiLanguage`. Export `initializeI18n(): Promise<void>` (idempotent), `getUiLanguage(): UiLanguage`, `setUiLanguage(language: UiLanguage): Promise<void>`, and `subscribeLanguage(listener: () => void): () => void` from the singleton adapter.

- [x] Before dependency installation, verify compatible published versions/peer requirements against the existing React/TypeScript/Vite setup using official package metadata. Record chosen versions in the implementation evidence; add only the two selected runtime packages to the web workspace and update the lockfile with pnpm. Do not install a detector or test framework.
- [x] Write failing assertions for absent/invalid/unsupported storage values, valid `zh-CN`/`en`, getter/read/write throws, browser-global absence, repeated initialization, and a rapid `en -> zh-CN -> en` sequence with final state `en`. Model throwing storage without credentials or real browser storage.
- [x] Register `verify:i18n` as `tsx apps/web/verify-i18n.ts`, classify its full import graph as local-fixture, review audit fingerprints and add it to verification typechecking before running it. Run through `verify:checks -- run --check verify:i18n`; capture the intended failing assertion, not merely a registry or setup failure.
- [x] Implement the language adapter and one initialized application instance, using complete bundled resources, Chinese fallback, explicit supported languages, a default `common` namespace and React-safe text interpolation (no translated HTML). Type resource keys using the selected library's supported TypeScript augmentation; valid keys compile, an invalid key fails under `@ts-expect-error` checks. Keep checks independent of application startup side effects.
- [x] Implement release gating: Phase 1 effective language is forced to Chinese unless Vite `import.meta.env.DEV` is true and hostname is exactly `localhost`, `127.0.0.1` or `[::1]`. In permitted local preview, read stored choice before render. Else ignore stored English without deleting it, and reject an English switch by retaining Chinese. This is a temporary release gate, not authentication or deployment configuration.
- [x] On storage write failure keep the successful in-memory language; reload without readable storage returns Chinese. Do not use navigator language, change auth state, call the API, or implement cross-tab event synchronization in this phase. Browser-wide persistence means subsequent loads/accounts in the same browser origin use the same choice.
- [x] Run lifecycle assertions and web typechecking. Assert production/non-loopback cases remain Chinese with stored `en`; loopback-development cases restore `en`. Record results.

## Task 3: Prove resource completeness independently of fallback

**Files:** Create `resourceValidation.ts`, `apps/web/verify-i18n-resources.ts`, compile-only key checks; update root aliases, verification types and reviewed registry.

**Interfaces:** `validateResources(resources: unknown): ResourceDiagnostic[]`, with diagnostics `{ language: string; namespace: string; key: string; rule: "shape" | "missing" | "empty" | "interpolation" | "plural" }`. Read raw resource objects, never resolved translations. Initial namespaces are those from Task 1; unknown/missing namespaces fail.

- [x] Add mutation fixtures that delete a key, add an English-only key, insert whitespace-only text, replace a string with an object, alter `{{value}}` to `{{amount}}`, and remove a required English plural category. Each must return the exact offending language/namespace/key and rule; intact resources must return no diagnostics.
- [x] Add a synthetic count message with Chinese `other` and English `one`/`other`, all using `{{count}}`. Derive required cardinal categories through `Intl.PluralRules` for each supported language. Accept differing locale-specific suffix sets; reject missing required categories and unknown suffixes. Optional `_zero` may be present with matching parameters; ordinal/context variants are not supported by the Phase 1 convention.
- [x] Implement recursive semantic-key comparison, string/non-empty checks and interpolation-name set equality, normalizing plural families rather than comparing suffixed keys naively. Fail unsupported resource shapes rather than silently skipping them. Keep full sentences as leaves.
- [x] Register `verify:i18n-resources` as `tsx apps/web/verify-i18n-resources.ts` with reviewed local-fixture effects. Demonstrate failing mutation checks before implementing the validator, then all checks passing. Compile valid/invalid resource-key examples with the normal web typecheck.
- [x] Add a narrowly scoped hardcoded-text review checklist for the new preview/provider and moved time sentences. Preserve source data and original branding; do not claim untranslated pages have passed completeness checks.

## Task 4: Extend formatting without changing existing callers

**Files:** Modify `numberFormat.ts`, `timeFormat.ts`, `scripts/verify-time-policy.ts`; extend `apps/web/verify-i18n.ts`; document formatting in the foundation contract. Read `spendingFormat.ts` without changing its algorithm.

**Interfaces:** Add trailing `locale: DisplayLocale = "zh-CN"` to all public number helpers. Add fourth argument `language: UiLanguage = "zh-CN"` to `formatLocalDateTime(value, fallback = "-", timeZone?)`; add trailing language arguments to `formatLocalDateTimeNote(value, fallback)`, `formatAppBusinessDayCountdown(now = new Date())`, and `formatHoursMinutes(totalMinutes)`. Existing argument order and default outputs stay compatible. Add `formatCalendarDate(value: string | null, fallback = "-", language: UiLanguage = "zh-CN"): string` for future migrated callers: valid Chinese dates retain ISO text, English dates use `DD Mon YYYY`, null uses fallback, invalid dates retain original text. Validate calendar components; never parse a date-only value as a viewer-zone instant.

- [x] Capture baseline Chinese assertions before edits: `formatDisplayPrice("1.23456") === "1.2346"`, amount `"1.23456" -> "1.235"`, percent `12.34 -> "12.3"` (no scaling or `%`), signed percent `0.01 -> "0.0"`, signed amount `-0.0001 -> "0"`, whole amount `-0.1 -> "0"`, null/blank -> `"--"`, invalid numeric text unchanged. Include unsigned negative-zero output as observed rather than silently normalizing it.
- [x] Add both-locale assertions preserving precision, sign, grouping and missing-value behavior. Verify `formatSpendingAmount("9007199254740993.1200") === "9,007,199,254,740,993.12"` and preserve its distinct em-dash fallback. English and Chinese currently share decimal/group separators; do not rewrite exact-string spending formatting through Number or Intl rounding.
- [x] Add timestamp tests with explicit `Pacific/Auckland`, `Asia/Shanghai` and `UTC`, including NZ DST boundaries. Assert a locale change changes presentation only. Test calendar date `2024-02-29`, invalid `2025-02-29`, and month/year boundaries without day shifts. Test Shanghai instants immediately before/at `06:00`; business date/end instant are identical across languages. `formatHoursMinutes(201)` remains `03小时 21分` in Chinese and becomes `03h 21m` in English.
- [x] Implement explicit-locale helpers, using existing shared timestamp/business-day functions and fixed-language translation lookup for time sentences. Do not have pure helpers read mutable global language; consuming React components will pass active language when migrated. Add no shared-package React/i18next dependency, currency conversion, input parsing, sorting or chart-unit change.
- [x] Replace the time-policy source-text assertion with output assertions that retain the same protected Chinese behavior. Review affected audit fingerprints and run `verify:i18n`, `verify:time-policy`, `verify:dashboard`, and `verify:portfolio-trend` through the reviewed runner. Existing defaults must pass unchanged; new English assertions must pass.
- [x] Document future caller rules: subscribe via the language hook, pass explicit language/locale, include it in memoized label/formatter dependencies, keep report currency code explicit, preserve percentage-point versus ratio semantics, and migrate chart scaling/tooltips together in Phase 3. This task does not migrate those call sites.

## Task 5: Integrate stable startup and local-only preview

**Files:** Create `LanguageProvider.tsx`, `DevelopmentLanguagePreview.tsx`, `apps/web/verify-i18n-client.ts`; modify `main.tsx`; update registry/aliases/types and local testing guidance.

**Interfaces:** `LanguageProvider({ children }: { children: ReactNode })` wraps the existing router without a language key. `useUiLanguage(): { language: UiLanguage; displayLocale: DisplayLocale; setLanguage: (language: UiLanguage) => Promise<void> }` subscribes to Task 2's singleton. `DevelopmentLanguagePreview(): ReactNode` returns nothing outside the eligibility gate and is imported only through a DEV-guarded dynamic import.

- [x] Write client fixtures for provider subscription cleanup, idempotent initialization, stable child/router identity, and no auth/cache/network calls from switching. Use the existing esbuild/assertion fixture pattern; do not mistake a stubbed hook fixture for real React state/focus acceptance.
- [x] Integrate initialization before both successful application render and runtime-config error render. Keep runtime config loading/error behavior and existing auth cleanup. Attach metadata synchronization once: `html.lang` is the effective language, title remains `金财屋 · Family Ledger` in Chinese for compatibility and is `Family Ledger` in English; application-name meta values use the translated product name. Page-specific titles remain Phase 2+. Startup failure copy migration is likewise Phase 2; do not mask startup errors as language failures.
- [x] Render an opt-in, initially collapsed development preview panel outside the router, available only under the exact Task 2 gate. Its labelled `中文` / `English` buttons are `type="button"`, have selected state, and switch without navigation. Show a prominent localized partial-translation notice and synthetic formatting/resource samples. No extra route, URL override, auth bypass, environment flag or production config field. Expand the panel explicitly for checks; it must not obscure ordinary login or page controls.
- [x] Include isolated preview-only state probes: unsaved text, selected ID, page number, filter, an open dialog, and a resource-key-plus-parameters error. Switching must retain values/dialog/focus and retranslate the error. These probes exercise the foundation; they are not the complete Phase 2 business-workflow pilot or a general API-error abstraction.
- [x] Register `verify:i18n-client` as `tsx apps/web/verify-i18n-client.ts` after import/effect review. Verify dev-loopback/non-loopback/production gate matrix, no preview control in production rendering, stored-English production startup in Chinese, and no language-triggered ledger requests. Inspect production bundle output to confirm the preview component/control code is eliminated; dictionaries may remain bundled.
- [x] Browser-check the isolated samples in both languages/themes and the five required viewports. For authenticated read-only regression, obtain agreement, provide local URL, wait for real user login and target readiness, then confirm no remount/extra ledger request and unchanged route/draft state on switches. Do not submit forms or mutate shared TEST records. Record foundation coverage and untranslated workflow exclusions explicitly. Storage-denied synthetic fixtures prove the new adapter only: existing auth/theme storage behavior is not silently certified or refactored.

## Task 6: Verify Phase 1 and hand off without starting Phase 2

**Files:** Update this plan, `docs/local-testing.md`, `docs/README.md`, `docs/roadmap.md`, and the phased roadmap with actual evidence; add a dated local acceptance record only if acceptance is performed.

- [x] Run `corepack pnpm verify:checks -- list` and `corepack pnpm verify:checks -- plan --changed`; reconcile unresolved paths. Review effects/fingerprints of changed fixture imports before running checks; never refresh hashes without review or bypass a blocked runner.
- [x] Run the three new focused checks and time/dashboard/trend checks through `corepack pnpm verify:checks -- run --check <id>`; also run affected `verify:auth` and `verify:session-reads` for startup/session independence. Run `verify:tooling` if registry/tooling changes require it. Success is exit 0 with all selected checks executed; record failures/not-run checks accurately.
- [x] Run `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build`, `corepack pnpm verify:docs`, and `git diff --check`. Record production bundle size versus the pre-implementation baseline from the same build command; do not add lazy loading based on an assumed size problem.
- [x] Review committed-since-baseline scope (if any), working/index diffs and all new files against design requirements, not HEAD alone. Verify no server preference, auth permission, financial calculation, stored data, deployment configuration or public switch changed. Review key typing and raw-resource mutation evidence separately from Chinese runtime fallback.
- [x] Record implementation, deployment and visual acceptance independently. If login or viewport acceptance is unavailable, mark it pending/deferred, not passed, and preserve the corresponding exit-gate qualification. Deployment remains not requested. Do not mark the phase fully accepted with unresolved required evidence.
- [x] Update only evidence-backed Phase 1 progress. Handoff includes dependency versions, glossary/resource conventions, preview procedure, formatter signatures, verification results, bundle comparison and outstanding defects/acceptance. Phases 2–5 remain Not started; no pilot implementation or later-phase detailed planning follows automatically.

## Phase 1 exit checklist

- [x] Valid/default/invalid/unavailable storage, first-render behavior, logout-independent lifetime and production gating verified.
- [x] Invalid keys, missing/empty translations, interpolation defects and locale-specific plural incompleteness are detectable.
- [x] Existing Chinese formatter behavior retained; English formatting, exact spending values and date invariants covered.
- [x] Development preview demonstrates reactive presentation/state retention without ledger side effects; public switch absent.
- [x] Required code checks, scoped review and qualified visual evidence recorded; no claim of complete English application support.

## Planning review and authorization

This plan reuses the approved architecture; its directory names, storage key, preview gate and explicit formatter signatures are proposed implementation choices for review. Phase 1 coverage maps to Tasks 1 (rules/glossary), 2 (library/lifecycle), 3 (completeness), 4 (format strategy/invariants), and 5–6 (preview/integration/evidence). No detailed later-phase work is included.

Planning self-review checks scope coverage, interface consistency, failure cases, effect boundaries and file ownership. The user approved this plan and explicitly authorized inline implementation on 2026-11-07. Implementation stayed inline; one fresh-context final review found a validator defect subsequently fixed with RED/GREEN coverage. See local evidence for checks, scoped acceptance, bundle comparison, rulings and limits. No delivery operation or later-phase work follows automatically.
