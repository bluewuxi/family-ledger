# UI Internationalization Phase 1 Local Evidence

Date: 2026-11-07 (Pacific/Auckland). Scope: [Phase 1 plan](../plans/2026-11-07-ui-internationalization-phase-1.md), [foundation contract](../specs/ui-internationalization.md). Baseline: `test` at `bc51878b116318656a545207190076226e937505`; implementation remains uncommitted. Pre-existing planning edits were preserved. No issue, commit, push, deployment, migration, server preference or ledger write was performed.

## Implementation and verification

Added `i18next 26.7.2` and `react-i18next 17.1.13` after checking official npm version/peer metadata against React 19/TypeScript 5. Only these two direct runtime dependencies were added. Their transitive dependencies are recorded in the lockfile. There is no detector, remote backend or new test framework.

The three reviewed local-fixture checks cover language validation/storage exceptions/idempotence/rapid switches; raw nested resources and locale-specific cardinal plurals; explicit financial and date formatting; singleton initialization/metadata; startup success/configuration error; provider subscription cleanup/child identity; production/non-loopback/loopback gates and zero synthetic network calls. Compile-only examples require valid keys to compile and invalid keys to fail. Baseline Chinese assertions were captured before helper edits, including unsigned negative zero. Exact spending strings keep their existing implementation.

RED/GREEN evidence: gate eligibility initially failed false versus true; lifecycle failed repeated-promise identity; deleted-key mutation initially returned no diagnostics; English duration initially returned Chinese; provider initially failed child-identity protection. Each passed after implementation. Fresh-context final review found one P2: unsupported formatted interpolation could be silently skipped. A regression for `{{amount, number}}` failed, then plain-token validation was tightened; formatted/unescaped/dotted/malformed mutations now pass by reporting the expected defect. No deferred minor findings were reported.

Focused validation passed: `verify:i18n`, `verify:i18n-resources`, `verify:i18n-client`, `verify:time-policy`, `verify:dashboard`, `verify:portfolio-trend`, `verify:auth`, `verify:session-reads`, and `verify:tooling`, all through the reviewed runner (9/9). Tooling was classified local-fixture after reviewing its temporary Git/process fixtures and imports; it creates commits only in its disposable synthetic repository, not this checkout. Root `corepack pnpm lint`, `corepack pnpm typecheck` and `corepack pnpm build` passed. The reviewed fixed core profile passed 15/15 checks (deployment verification uses synthetic local fixtures, not deployment).

Verification discovery: inventory diagnostics are empty. The conservative changed-path planner reports unmapped web package/main/number-helper and new i18n paths. These were manually reconciled to the three new checks, root lint/typecheck/build, time/dashboard/trend/auth/session regressions, source/bundle review and scoped browser acceptance; no runner gate was bypassed. Preview CSS is covered by visual evidence, compile-only files by root typecheck, dependencies by lockfile/build review. The discovery heuristic itself was left unchanged.

## Browser acceptance

The user agreed to startup and confirmed real login and dashboard readiness at `http://127.0.0.1:5181/dashboard` before inspection. Both bypass flags were disabled. Acceptance was read-only with no ledger form submissions. The initial panel was collapsed and did not cover ordinary dashboard controls.

| Viewport | Chinese/light | Chinese/dark | English/light | English/dark |
| --- | --- | --- | --- | --- |
| 320 × 740 | Passed | Passed | Passed | Passed |
| 393 × 852 | Passed | Passed | Passed | Passed |
| 430 × 932 | Passed | Passed | Passed | Passed |
| 768 × 1024 | Passed | Passed | Passed | Passed |
| 1440 × 1000 | Passed | Passed | Passed | Passed |

Coverage is the synthetic foundation panel/dialog in both preview themes, not certification of untranslated business workflows or an application-wide theme audit. The preview-only theme probe uses local scoped colors and never updates the persisted user theme. All 20 combinations retained draft/page state and had no preview horizontal overflow; screenshots were inspected for text wrapping, controls, contrast and dialog fit. Local screenshots and matrix remain ignored under `.local/i18n-phase1/`, without copying private dashboard records into tracked evidence.

Observed switching retained the draft, selected ID, page 7, active filter, `/dashboard` route and selected asset-trend tab. The open native modal remained open, translated the existing parameterized error and retained focus on the language button. Keyboard Tab moved between dialog controls; Escape closed it and focus returned to its opener. Document language/title changed correctly. An isolated switch interval produced no new portfolio API timing events; fixture instrumentation separately asserted zero network calls. No comprehensive browser network recorder was available. Logout independence and storage-denied/reload behavior are established by adapter/client fixtures and source boundaries; the user's real session was not logged out. Existing auth/theme storage behavior is outside the storage-denied certification.

The browser was returned to Chinese with collapsed preview and default viewport. The route and existing chart selection remained intact. Public English switching stays gated; login/shell/errors/pilot and Phases 2–5 remain Not started.

## Review, rulings and delivery

A fresh reviewer inspected the actual working/index diffs and relevant new files, compared with the starting baseline and approved contracts. The one material finding was fixed with RED/GREEN coverage and the selected suite rerun. No protected financial/auth/storage/deployment boundary changes were found. Browser evidence and final command results were assessed by the implementing agent, not inferred from the reviewer.

Rulings: use PowerShell-native ignored ledger/evidence instead of Bash wrappers, retaining it because changes are uncommitted; use the existing `test` checkout as required; use root typecheck because the package-local script hits TS6310; use scalar DEV substitution in the startup fixture to match Vite constant folding; add a preview-scoped theme probe to cover both themes without writing server preferences; manually reconcile planner paths rather than expand selection heuristics. Costs if wrong are bookkeeping/discovery omissions or fixture/build parity gaps, mitigated by final scoped review, direct build inspection and independent browser coverage. None alters protected product contracts or delivery authorization.

Deployment at the implementation handoff: not requested and not performed. Whole-app bilingual acceptance is not claimed. Later-phase implementation/planning does not follow automatically.

## Bundle comparison

The same root build command passed before and after implementation. Baseline JavaScript chunks total 1,050.10 kB / 313.83 kB gzip; final total is 1,105.394 kB / 331.627 kB gzip (approximately +55.29 kB raw, +17.80 kB gzip). CSS remains 92.31 kB / 17.13 kB gzip. Values use decimal kB; baseline is the build report rounded per chunk. Production assets contain no `DevelopmentLanguagePreview`, `data-preview-theme` or `language-preview-actions` code, no preview chunk and no preview stylesheet; dictionaries intentionally remain bundled. No lazy resource loading was added.

Final documentation validation: `corepack pnpm verify:docs` and `git diff --check` passed after glossary, status, links and evidence reconciliation. The new foundation contract is explicitly registered in the maintained-document policy. Inventory review reports no stale audit diagnostics. The heuristic planner still returns its documented unmapped paths; manual scope reconciliation above supplies their required verification. No unresolved material review findings remain.

## Authorized TEST delivery

After the local implementation handoff, the user explicitly authorized committing and pushing Phase 1 to `test`, followed by CI and automatic TEST deployment monitoring. [Issue #136](https://github.com/bluewuxi/family-ledger/issues/136) records the release commit, workflow result and publication evidence after completion. This supersedes the earlier implementation-only delivery limit; no Phase 2, migration, data repair, independent configuration or manual deployment is authorized. Local code and acceptance evidence above remains applicable; the three i18n fixture checks and docs were rerun successfully before delivery.
