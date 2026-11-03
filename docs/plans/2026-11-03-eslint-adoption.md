# ESLint Adoption Implementation Plan

> **For agentic workers:** After implementation is explicitly authorized, use superpowers:executing-plans to execute the checklist. Follow repository workflow overrides; this document does not authorize delegation, commits, pushes, or deployments.

**Status:** Implemented locally on 2026-11-03. ESLint, cleanup, CI configuration, and local core verification completed. The API-error fixture failure was resolved in the follow-up below; authenticated visual acceptance remains pending. No commit, push, or deployment performed.

**Goal:** Add reproducible, repository-wide ESLint checks that catch JavaScript, TypeScript, React Hooks, and asynchronous programming mistakes without introducing a formatting migration.

**Architecture:** One root flat configuration supplies syntax checks for all maintained JavaScript/TypeScript and selected type-aware checks for the four application/library source trees. Root commands and the existing CI validation action use the same configuration.

**Tech Stack:** ESLint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks, globals; existing React 19, TypeScript, Corepack/pnpm 9.15.4, Windows development and Node 22 Linux CI.

**Spec:** The proposed decisions below form the design for this draft. They are recommendations, not previously approved requirements. Maintained contracts: [architecture](../architecture.md#code-organization), [project workflow](../project-workflow.md), [local validation](../local-testing.md#validation), and [frontend guidelines](../frontend-guidelines.md).

## Scope and baseline

- Inspected the existing clean `test` checkout on 2026-11-03; 323 tracked JavaScript/TypeScript source files were present.
- Root and workspace packages have no lint command or direct ESLint dependency. No tracked ESLint, Biome, Prettier, or Stylelint configuration was found.
- All four workspaces use strict TypeScript. The root tsconfig contains project references; the web tsconfig includes only `src`. Many standalone scripts and web verification files are outside those projects.
- `.github/actions/validate/action.yml` runs typecheck, build, verification tooling, documentation checks, and the fixed core profile. Lint must supplement these checks.
- `scripts/verification/registry.ts` currently permits only `tsx` and `tsc` runner steps. `registry-data.json` audits both root `package.json` and `pnpm-lock.yaml`; dependency/command setup necessarily invalidates their fingerprints, even before source cleanup.
- `scripts/verification/selection.ts` currently recommends only typecheck/build as baseline commands and does not recognize `eslint.config.mjs`. Integrate lint into recommendations without extending the executable runner.
- This task creates only this plan. Future implementation needs a separate instruction. No issue creation, commit, push, deployment, migration, live data access, or browser acceptance is included here.

## Proposed approach and alternatives

1. **Recommended: syntax baseline everywhere plus selected typed checks in product source.** Catch common defects and unsafe Promise use while keeping standalone tooling independent of TypeScript project discovery. This is the proposed initial implementation scope.
2. **Syntax checks only.** Lower setup and cleanup cost, but misses floating/misused Promises in API, jobs, and browser code; insufficient as the long-term baseline for this repository.
3. **Full strict type-checked presets everywhere.** Broader diagnostics, but requires project coverage for numerous scripts and likely substantial unrelated cleanup. Defer until the initial baseline has evidence and stable runtime cost.

No Prettier, formatting preset, import sorter, Husky, lint-staged, custom ESLint rule, or new test framework is proposed. Do not add blanket complexity, file-length, naming, explicit-return-type, quote, semicolon, or indentation rules. Defer accessibility, Fast Refresh, React Compiler, import-boundary, and security plugins to separately justified work; lint does not prove authorization, secret safety, decimal precision, or tax correctness.

## Global constraints

- Stay on the existing `test` checkout; inspect HEAD and staged/unstaged/untracked changes before implementation. Do not create branches or worktrees without explicit authorization.
- Read root `AGENTS.md`, `docs/project-workflow.md`, and all applicable local `AGENTS.md` files before touching their areas. In particular, application cleanup requires `apps/web/AGENTS.md`, `apps/api/AGENTS.md`, `apps/jobs/AGENTS.md`, or `packages/shared/AGENTS.md`; tooling cleanup requires `scripts/AGENTS.md`.
- Repository prose, comments, and identifiers remain English. Preserve Simplified Chinese UI text and permitted source quotations.
- Preserve financial calculations, dates, permissions, error handling, request cancellation, and user-visible behavior. Read affected maintained contracts before any corrective source edit.
- Use root development dependencies only. Keep the existing pnpm major and application runtime versions; do not upgrade React, TypeScript, Vite, or deployment runtime as a lint prerequisite.
- Select mutually compatible stable package releases at execution time, verify package engine/peer ranges against the installed TypeScript version and local/CI Node, and lock resolved versions in `pnpm-lock.yaml`. Prefer the supported ESLint major compatible with the whole plugin set; never force incompatible peers. If no supported set fits, report the concrete compatibility conflict before expanding scope.
- Existing verification commands, financial fixtures, and real-login/viewport requirements retain their authority. No bulk suppression baseline or blanket directory disable is acceptable.

## Configuration contract

Create `eslint.config.mjs` at repository root using flat configuration. Use an explicit configuration root derived from the configuration file URL so type-aware linting does not depend on the shell working directory.

### Files and environments

| Scope | Checks and environment |
| --- | --- |
| All maintained `**/*.{js,mjs,cjs,ts,tsx,mts,cts}` | ESLint recommended correctness rules; TypeScript recommended only for TypeScript files |
| `apps/web/src/**/*.{ts,tsx}` | Browser globals; React Hooks rules; typed checks using the web tsconfig |
| `apps/api/src/**/*.ts`, `apps/jobs/src/**/*.ts` | Node globals; typed checks using their nearest tsconfig |
| `packages/shared/src/**/*.ts` | Runtime-neutral globals; typed checks using the shared tsconfig |
| `scripts/**/*.{ts,js,mjs,cjs}`, `apps/web/verify-*.ts`, `apps/web/vite.config.ts`, root configuration modules | Node globals; syntax-only checks, no type-service project requirement |
| `apps/web/public/**/*.js` | Browser globals; syntax-only checks, including `theme-init.js`; use script source type for this classic bootstrap |
| Other maintained source files | Syntax-only baseline; explicitly classify their runtime before adopting globals |

Do not globally merge browser and Node globals. Configure CommonJS files as CommonJS. Apply typed parsing only to the four listed source scopes, using `parserOptions.projectService: true`; do not use a broad `allowDefaultProject` escape hatch or alter build tsconfig includes to satisfy lint.

Scope every imported preset explicitly: TypeScript parser/rules must not leak into JavaScript, and typed rules/project service must not leak into scripts or configuration files. Declaration files remain covered by the TypeScript preset; inspect ambient declarations for legitimate unused-signature bindings before adding exceptions. Only `theme-init.js` is known to be a classic script; do not force future public ES modules into script mode.

Coverage limitation: syntax-only TypeScript files outside existing compiler projects receive neither compiler undefined-name diagnostics nor typed Promise checks. Keep `no-undef` off for TypeScript as recommended by typescript-eslint; enabling it is not a substitute for TypeScript project coverage. Inventory and document these files at implementation time. Expanding compiler coverage is separate work, not an implicit lint prerequisite. Likewise, browser/Node globals do not enforce runtime imports or global boundaries in TypeScript when `no-undef` is off; do not claim they do.

Global ignores cover `**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.vite/**`, `**/.aws-sam/**`, `**/coverage/**`, `.git/**`, `tmp/**`, `.local/**`, and `**/*.tsbuildinfo`. Audit the tracked file inventory against these patterns so maintained source is not accidentally excluded. Do not ignore all dot-directories or all `public` files. SQL, YAML, Markdown, HTML, CSS, and inline Lambda code in infrastructure templates are outside this ESLint scope and retain existing checks.

### Rules and severity

Use `@eslint/js` recommended and `typescript-eslint` recommended as the base. Do not enable `strictTypeChecked`, `stylistic`, or the entire React Hooks recommended preset in this initial adoption. The current React preset includes compiler-related diagnostics beyond the two Hooks checks selected here.

| Rule / policy | Initial setting |
| --- | --- |
| Base recommended correctness rules, including debugger and unreachable-code detection | Error; preserve TypeScript preset compatibility overrides |
| `no-undef`, `no-unused-vars` on TypeScript | Off; compiler handles names only in existing checked projects, TypeScript-specific rule handles unused bindings everywhere |
| `@typescript-eslint/no-unused-vars` | Error; `args: all`, `argsIgnorePattern: ^_`, `caughtErrors: all`, `caughtErrorsIgnorePattern: ^_`, `ignoreRestSiblings: true`; no general variable-ignore pattern |
| `@typescript-eslint/no-explicit-any` | Error; use real types or validated `unknown`; narrow documented exceptions for unavoidable integration/mock boundaries |
| `eqeqeq` | Error with `always` and `{ null: ignore }`, preserving intentional null/undefined checks |
| `prefer-const` | Error |
| `react-hooks/rules-of-hooks` | Error, web source only |
| `react-hooks/exhaustive-deps` | Error, web source only; manually review closures and effect lifetimes |
| `@typescript-eslint/no-floating-promises` | Error, typed scopes only; `ignoreVoid: false`, `checkThenables: true` to include Promise-like SDK query builders as well as native Promises |
| `@typescript-eslint/no-misused-promises` | Error, typed scopes only; retain checks for void-return callbacks including JSX attributes |
| `@typescript-eslint/await-thenable` | Error, typed scopes only |
| `no-console` | Off; server/operator structured logging is legitimate and browser logging needs separate policy |
| Unused ESLint disable directives | Error via `linterOptions.reportUnusedDisableDirectives` |

Explicitly enable only the three listed typed rules on top of the syntax preset. A Promise started from an event handler should have a real rejection handler that preserves existing user feedback; adding `void`, an empty catch, or a type assertion is not a fix. Preserve safe existing `void promise.catch(...)` flows after inspecting how their resulting Promise is treated by the selected rule version.

The existing `AccountsPage.tsx` uses both `void loadAccounts()` and async JSX callbacks; `loadAccounts` already catches failures internally. A rule diagnostic is not evidence of an actual unhandled rejection. Inspect the entire callee, including code before `try` and inside `catch`/`finally`, before choosing a correction. Avoid redundant error handlers and duplicate UI feedback. A narrowly documented exception may preserve an established internally handled callback after review; do not use a global JSX exemption or refactor every callback merely for stylistic uniformity. Similarly, mount-only effects and session reads need lifecycle reasoning, not automatic dependency-array expansion.

All enabled rules are blocking. No permanent warning-only bucket or generated suppression file. A necessary exception uses the smallest `eslint-disable-next-line` scope, names the rule, and explains the technical reason in English; temporary exceptions also state a removal condition. Do not disable a rule across API, jobs, shared, or web to make the initial scan pass.

### Commands and integration

- Root `lint`: `eslint . --max-warnings 0`.
- Root `lint:fix`: `eslint . --fix --max-warnings 0`; local opt-in only, never invoked by CI.
- Do not add a lint cache initially, workspace command duplication, or implicit lint execution inside application builds.
- Add `pnpm lint` to `.github/actions/validate/action.yml` after dependency installation, preferably before typecheck/build subject to Task 1's clean-checkout resolution check. If build output is required, run lint after build. Keep all existing validation steps and deployment gates unchanged.
- Invoke lint directly, like typecheck/build. Do not extend the audited verification runner to execute ESLint just for this adoption. Documentation must say the fixed core profile alone does not include lint.
- Update change-based recommendations in `scripts/verification/selection.ts` to include `corepack pnpm lint` for non-documentation changes, in the same validated order as CI, and classify exact root `eslint.config.mjs` as shared tooling. Documentation-only recommendations stay unchanged. Add focused fixture assertions in `scripts/verify-verification-tooling.ts`; lint is a baseline command, not a new registry check or runner tool.

## Implementation checklist (see final evidence and limitations below)

### Task 1: Establish configuration and measure the baseline

**Files:** Create `eslint.config.mjs`; modify root `package.json`, `pnpm-lock.yaml`, and reviewed fingerprints in `scripts/verification/registry-data.json`.

**Interface:** Root `lint` and `lint:fix` commands, with the scopes and severities above.

- [x] Record starting branch, HEAD, worktree changes, local Node version, CI Node resolution, and installed TypeScript version; read applicable guidance.
- [x] Check official package engines/peers and install the five root development dependencies through Corepack/pnpm with compatible explicit versions. Record the selected versions and rationale in implementation evidence.
- [x] Add the flat configuration and root commands. Inspect effective configuration with `corepack pnpm exec eslint --print-config <file>` for a web TSX file, API file, jobs file, shared file, standalone script, web verification script, Vite config, and `theme-init.js`.
- [x] Review the root script diff and dependency/lockfile changes for actual command effects, then update only their corresponding audited fingerprints. Confirm unchanged verification commands and classifications; run `corepack pnpm verify:tooling`. This is mandatory setup work, not conditional on later source fixes. Do not bypass a stale audit or run an automatic refresh of all fingerprints.
- [x] Run a non-fixing full scan and capture per-rule/per-area counts in ignored local output. Confirm every tracked supported source extension is either checked or deliberately excluded as generated output. Record runtime; no baseline count or runtime estimate is claimed by this plan.
- [x] Prove selected rules with temporary stdin probes and representative existing filenames: a conditional Hook, missing dependency, floating native Promise/Promise-like query, bare `void` Promise, async void callback, and awaiting a non-Promise must fail with their intended rule IDs. Corrected examples, including an explicitly caught Promise, must pass. Confirm standalone scripts have no project-service inclusion errors, browser JS rejects an undeclared Node-only global, and the theme bootstrap is included. Use local temporary files only when parser behavior requires them; remove them before delivery. Lint probes must not execute imports, SDK queries, or application code.
- [x] Test typed lint on a clean checkout state with no generated workspace `dist` or tsbuildinfo files; require resolved shared types rather than silent error/any types. Do not delete user outputs for this check: use a temporary source copy in ignored local storage when needed. If selected project-service versions cannot resolve existing project references before build, place the CI lint step after build and document that prerequisite instead of disabling typed diagnostics. Use the same validated ordering locally.

**Acceptance:** Configuration resolves on Windows and Linux-compatible paths, intended positive/negative probes behave correctly, and the initial existing violation inventory is explicit. Existing violations may remain at this intermediate checkpoint; it is not completion.

### Task 2: Resolve existing findings without changing contracts

**Files:** Only source files identified by Task 1; conditionally `scripts/verification/registry-data.json` when reviewed source fingerprints change.

**Interface:** The complete `lint` command reaches zero errors and zero warnings without hiding maintained source.

- [x] Separate mechanical unused-binding/const changes from typed boundary and effect/Promise findings. Read the applicable local instructions and owning business/auth/time/UI contracts for each affected area.
- [x] Before editing source, record the actual per-rule counts and affected files, distinguishing real defects, safe established patterns, and mechanical cleanup. If reaching the proposed gate requires broad callback/effect rewrites, stop that expansion and present the measured scope for a separate decision. Do not manufacture hundreds of suppressions or silently downgrade rules. This plan makes no unmeasured promise that full cleanup is small.
- [x] Preview fixes on a small explicit file set using ESLint `--fix-dry-run`; apply only reviewed mechanical changes. Do not run a blind repository-wide autofix or delete side-effectful initializers merely because their bindings are unused.
- [x] Resolve type findings with existing DTOs and boundary validation. Preserve runtime behavior and financial precision; use narrowly explained exceptions only where justified.
- [x] Review Hook findings manually for stale closures, stable callbacks, subscriptions, cancellation, retries, and duplicate network requests. Never add dependencies mechanically or suppress a real behavior defect to reach zero lint.
- [x] If a correction changes effect/async behavior, reproduce the defect with an existing focused fixture where practical, implement the correction, and rerun it. A product-contract change or broad refactor requires a separate decision; report it instead of silently expanding lint adoption.
- [x] Review every changed audited dependency for its actual effects before updating its fingerprint. Preserve registry classifications and commands; no blind fingerprint refresh. Run verification tooling to confirm the registry remains valid.
- [x] Run `corepack pnpm lint` and affected focused checks. Record any justified exception and remaining acceptance needs.

**Acceptance:** Zero unsuppressed diagnostics, no unjustified disable comments, no unrelated source churn, and affected business/async verification passes. If unresolved genuine defects prevent that result, report the blocker rather than weaken the gate.

### Task 3: Add the gate, document it, and verify the complete change

**Files:** Modify `.github/actions/validate/action.yml`, `scripts/verification/selection.ts`, `scripts/verify-verification-tooling.ts`, the affected reviewed fingerprints in `scripts/verification/registry-data.json`, root `AGENTS.md`, `docs/project-workflow.md`, `docs/local-testing.md`, and the validation summary in `docs/test-auto-deployment.md`; update this plan's status/evidence. Modify other maintained contracts only if an explicitly authorized behavior correction requires it.

**Interface:** The documented local required checks and shared CI action both include the same non-fixing lint command.

- [x] Add the CI lint step without changing triggers, permissions, deployment eligibility, or manual deployment procedures.
- [x] Add recommendation fixtures proving that application changes include lint/typecheck/build, root ESLint configuration changes receive shared-tooling recommendations with no unmapped-path diagnostic, and documentation-only changes remain documentation-only. Implement the minimal selection changes, review their effects, refresh only affected audit fingerprints, and run verification-tooling fixtures. Keep runner step allowlists and the fixed core membership unchanged.
- [x] Add lint to the required code-change validation instructions. Document covered/untyped scopes, intentional exclusions, lint versus formatting, local-only `lint:fix`, suppression policy, and the fact that lint supplements typecheck/build and affected checks.
- [x] Verify a frozen-lockfile install and run lint, typecheck, build, verification tooling, documentation fixtures/checks, and the fixed core profile in the existing supported environment. Confirm Linux command/path behavior in the normal CI run only if a later push is authorized; otherwise report that CI remains unexecuted.
- [x] Review the complete scoped diff and all new files against the recorded starting state. Check ignored-output exclusions and make sure no private diagnostics, secrets, temporary probes, or unrelated edits are included.
- [x] Report implementation, deployment, and visual acceptance separately. Tooling-only changes need no UI acceptance; if source cleanup changes Hook/event behavior, follow real-login acceptance and required viewports or explicitly report pending/deferred acceptance. Do not claim a build proves visual acceptance.

Future implementation validation commands (move lint after build if Task 1 establishes that prerequisite, and keep recommendations, documentation, and CI consistent):

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
corepack pnpm verify:tooling
corepack pnpm verify:docs-tests
corepack pnpm verify:docs
corepack pnpm verify:checks -- run --profile core
git diff --check
```

Run affected focused checks in addition to this list. Do not run live/database/operator commands merely to satisfy lint adoption. The current planning task requires only document consistency/link review and whitespace checks, not these future implementation checks.

## Review focus

1. **Missed files:** Task 1 compares the tracked inventory and effective configuration; public JavaScript and standalone verification scripts must not disappear from coverage.
2. **Wrong runtime/project:** Task 1 checks browser/Node scopes and project discovery; tools outside application tsconfigs must remain linted without parser errors.
3. **Changed effect behavior:** Task 2 checks request duplication, cancellation, subscriptions, and stale closures through affected fixtures and appropriate user acceptance.
4. **Hidden rejections or type erasure:** Task 1 uses Promise probes; Task 2 reviews handlers, casts, catches, and exceptions rather than accepting cosmetic rule satisfaction.
5. **Broken validation integration:** Task 3 checks the unchanged core profile plus lint, audited fingerprints, documentation, frozen lockfile, and cross-platform invocation.

## Official references

Version and compatibility checks must be repeated during implementation; these sources were consulted on 2026-11-03.

- [ESLint flat configuration](https://eslint.org/docs/latest/use/configure/configuration-files): file scopes, globals, configuration composition, and ignores.
- [ESLint runtime prerequisites](https://eslint.org/docs/latest/use/getting-started) and [version support](https://eslint.org/version-support/): choose a supported version that fits the existing runtime.
- [typescript-eslint configurations](https://typescript-eslint.io/users/configs/) and [typed linting](https://typescript-eslint.io/getting-started/typed-linting/): syntax presets and project-service integration.
- [React Hooks plugin reference](https://react.dev/reference/eslint-plugin-react-hooks): Hooks rules and the broader compiler-related recommended rule set.
- [Undefined-name checks in TypeScript](https://typescript-eslint.io/troubleshooting/faqs/eslint/): why TypeScript files should not use the core `no-undef` rule.
- [Floating Promises](https://typescript-eslint.io/rules/no-floating-promises/) and [misused Promises](https://typescript-eslint.io/rules/no-misused-promises/): void expressions, thenables, and void-return callbacks.

## Plan review record (2026-11-03)

Retained the root flat configuration, minimal dependency set, syntax coverage for tools, three selected typed rules for product source, and two explicit Hooks rules. Code inspection found only two explicit `as any` examples in the searched maintained TypeScript, while async callbacks and `void` calls are established web patterns; exact lint counts remain unknown until implementation.

Corrected mandatory dependency audit handling, missing change-based lint recommendations, TypeScript coverage claims, Promise-like SDK coverage, clean-checkout type resolution checks, and the TEST validation documentation scope. Added a measured cleanup checkpoint and explicit treatment of internally handled async callbacks. These changes keep adoption bounded without pretending lint proves runtime safety or weakening checks solely to obtain a green result.

At the review stage, review was documentary and source-based; no installation, code fix, CI run, or deployment had been performed. Implementation was subsequently authorized as recorded below.

## Initial implementation checkpoint (2026-11-03)

The user subsequently authorized implementation and local validation only. Added root ESLint configuration and lint commands with ESLint 10.14.0, @eslint/js 10.0.1, typescript-eslint 8.72.1, eslint-plugin-react-hooks 7.1.1, and globals 17.14.0. Local Node is 24.14.0. Package/lockfile changes were reviewed and their two existing effect-audit fingerprints updated; no verification commands or classifications changed.

The non-fixing scan reports **194 diagnostics across 53 files**, including 95 floating-Promise diagnostics, 20 Hook dependency diagnostics, and 13 misused-Promise diagnostics. Three undefined-global diagnostics originate in an untracked local `.superpowers` historical script and need separate scope classification. The baseline JSON is ignored local output at `tmp/eslint/baseline.json`. Earlier conversational progress incorrectly stated 197; the captured JSON totals 194.

This reaches Task 2's measured cleanup checkpoint: 128 async/Hook diagnostics potentially require extensive lifecycle/callback review. No application code was mechanically rewritten, no rules weakened, and CI was not given a failing lint gate. Necessary next decision: authorize the measured 53-file review/cleanup scope, or revise the initial adoption scope explicitly before continuing. This checkpoint is not a successful lint acceptance.

Typecheck, build, and verification-tooling fixtures passed after dependency installation. Lint fails with the recorded baseline. Clean-checkout probes, final CI/documentation integration, core verification, and authenticated UI acceptance remain outstanding.

## Final local implementation evidence (2026-11-03)

The user explicitly authorized review and cleanup of the measured 53-file scope while preserving behavior, retaining rules, and completing CI/local verification. The checkpoint above is historical and no longer blocks cleanup.

- Root dependencies are pinned to the five versions recorded above; frozen-lockfile installation passed. Installed TypeScript is 5.9.3. ESLint's Node range is `^20.19.0 || ^22.13.0 || >=24`, compatible with local Node 24.14.0 and the action's current Node 22 resolution. Plugin peers support ESLint 10 and the installed TypeScript.
- `lint` passes with zero errors/warnings. All initially tracked JS/TS files are included; untracked historical Node `.mjs` tooling also remains checked with Node globals. No bulk baseline or directory exclusion was added.
- Positive/negative probes demonstrated conditional Hooks, missing dependencies, floating native/Promise-like tasks, bare void Promises, async void callbacks, awaiting non-Promises, and rejected Node globals in browser JavaScript. An explicitly caught Promise passes. A temporary source copy with no workspace dist/tsbuildinfo output also passed lint, supporting lint-before-build ordering.
- Unused declarations/imports and redundant interface aliases were removed. NUL-byte detection uses an explicit character check. Session snapshot reading retains the original await microtask boundary through `Promise.resolve`. Numeric request-ref cleanup captures ref objects; DOM cleanup captures actual elements. Event-driven loaders retain stable identities and latest committed closures without adding draft state as request triggers.
- `observeAsync` preserves domain-level feedback and observes unexpected rejections with a fixed, non-sensitive browser diagnostic. Synthetic fixtures verify single error reporting and stable callback/latest-closure behavior; they do not establish actual React/browser scheduling acceptance.
- Rules remain blocking. Narrow, explained exceptions preserve five existing fatal cleanup guards, three sanitized subprocess-error boundaries, and immediate clearing of temporary password bindings. Independent review rejected throw-only helper indirection; those helpers were removed in favor of explicit justified exceptions. No blanket Promise/JSX/Hook exception was used.
- CI's shared validate action invokes lint before existing typecheck/build checks. Change-based recommendations now include lint and recognize root ESLint configuration; regression fixtures preserve documentation-only recommendations. Runner executables, classifications, and fixed core membership remain unchanged. Audited changes/new helper dependencies were reviewed for effects; only relevant fingerprints were updated.
- Typecheck, build, deployment tooling fixtures, verification tooling, documentation fixtures/consistency, and all 15 fixed core checks passed. Additional local fixtures passed for loading/async boundaries, account detail, holdings detail, preferences, account secrets, spending, education reserve, instrument activity, log retention, transaction tables, monthly summaries, and quote deadlines.
- `verify:api-error-logging` still fails at line 109: an administrator error-list request expects 200 and receives 503. The identical failure was reproduced from an independent archive of HEAD source under ignored local storage. This existing fixture failure was not hidden or changed as part of lint adoption.
- Independent review findings were corrected, including duplicate imports introduced during cleanup. Final lint/typecheck and focused checks verified the corrections. Temporary diagnostic artifacts remain ignored under `tmp/eslint` and are not deliverables.
- Hosted Linux CI and deployment were not executed because push/deployment is not authorized. No database, AWS, identity, or ledger mutations were performed. Authenticated five-viewport visual acceptance remains pending; no login was bypassed and no browser acceptance is claimed.

The checklist describes the implemented sequence; this evidence records its actual completion and remaining verification limits. Local source checks are complete, with the pre-existing fixture failure and pending visual acceptance explicitly retained.

## API-error fixture follow-up (2026-11-03)

The user separately authorized diagnosis, a behavior-preserving fix, and local verification. `verify:api-error-logging` was missing the synthetic `read_account_scope` RPC introduced by account visibility enforcement, so its administrator request failed closed with 503 before reaching the error-list query. The fixture now supplies a valid policy and verifies missing-policy 403, dependency-failure 503, successful 200 with a scope header, and no policy reads for rejected requests. Production authorization and routes are unchanged.

After fixing that fixture, its static catch audit exposed another outdated assumption: terminal rethrows were rejected despite the documented allowance for propagation to the route logger. The audit now recognizes actual logging calls or terminal throws, rejects early returns/breaks and comment-only logging, and preserves retry exhaustion. The single intentional optional scope-header probe is matched against its exact path, try block, and catch body; the exception must remain used exactly once. Positive and negative audit fixtures cover these cases, including an early-return regression identified during independent review.

The formerly failing API-error check now passes. Related API-health, account-access/context, and log-retention fixtures passed, as did lint, typecheck, build, verification tooling, and documentation consistency. No application business code changed in this follow-up. No commit, push, deployment, live service access, or authenticated browser acceptance was performed; visual acceptance of the earlier UI cleanup remains pending independently.

## Whole uncommitted-change review (2026-11-03)

The user authorized review of the complete working/index/untracked scope and direct corrections with local verification. Independent web and non-web reviews inspected the actual changes against HEAD, including all new helpers, ESLint configuration, CI integration, and verification fixtures. No financial calculation, permission, persistence, or date-contract changes were found.

Review identified and corrected two issues: removing the dashboard range dependency had stopped refreshing the live endpoint clock immediately on range selection; the catch audit could accept conditional, unreachable, or nested-cleanup logging as proof the outer error was handled. Both were reproduced with failing fixtures before correction. The dashboard memo now explicitly retains range-triggered clock invalidation. The audit conservatively requires an unconditional diagnostic before silent exits, exhaustive diagnostic branches, or terminal propagation without silent exits. A successful concurrent transaction replay is recognized by its exact existing recovery statements; the remaining failure path still requires diagnostics/propagation. That exception, like the optional scope-header exception, must remain used exactly once.

The maintenance page also keeps its ordinary tab loader for in-flight actions so they retain the initiating render's tab/filter snapshot; only the tab effect uses the latest stable callback. Synthetic fixtures execute the actual chart memo and tab-loader source to check these preservation cases. They supplement, rather than replace, authenticated visual acceptance.

Lint, typecheck, build, verification tooling/documentation checks, all 15 core checks, API-error logging, loading/async fixtures, account-detail, transaction-table, and preferences checks passed during review. No further concrete behavior defect was identified. Hosted CI and authenticated five-viewport acceptance remain unperformed; no commit, push, deployment, or live data mutation was authorized or performed.
