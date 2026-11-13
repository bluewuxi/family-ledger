# Phase 4 UI Internationalization Evidence

Phase 4 is implemented locally on `test` from `d4f261b00fcd68930dc3cdbb875c38d490ee3afb`. Deployment was outside this request. The public switch stays gated. See the [approved plan](../plans/2026-11-10-ui-internationalization-phase-4.md) and [coverage ledger](../specs/ui-internationalization.md#phase-4-remaining-workflow-coverage).

Lint, typecheck and production build passed. Local checks covered resource completeness, the route and literal inventory, safe client error mapping, cashflow selection and draft retention, exact totals, and synthetic bank import parser and storage scenarios.

The reviewed runner passed all 15 core checks, all 10 earlier internationalization checks, the family cashflow UI check, and the Phase 4 and spending checks. The runner currently blocks the separate education reserve and API error logging checks because they lack execution review.

The production main chunk measured 472.64 kB raw and 136.75 kB gzip. The [Phase 3 record](2026-11-10-ui-internationalization-phase-3.md) reported 411.20 kB raw and 121.60 kB gzip. The recorded difference is 61.44 kB raw and 15.15 kB gzip. This compares recorded builds.

Browser acceptance is partial. With both auth bypass flags disabled, the user signed in and confirmed Family Cashflow was ready. Read-only checks sampled daily transactions, education activity, the cashflow report, statement import, maintenance and About in Chinese and English in the session's dark theme at 320×740, 393×852, 430×932, 768×1024 and 1440×1000. Some immediate resize measurements showed transient overflow. Settled cashflow measurements fit at all sizes. English About still overflowed at 320 pixels. The About grid now allows its column to shrink and the English brand text to wrap. The authenticated 320-pixel retest measured a 305-pixel document scroll width. Viewport overrides were reset.

The isolated browser matrix covered the same six surfaces plus Settings in both themes and languages at all five sizes. All 140 settled document-width measurements fit. At 320×740 the isolated import fixture simulated a lost confirmation response. Switching language left all counters unchanged. The explicit retry reused the original payload, reached two synthetic commit attempts and made zero external requests.

Authenticated light-theme coverage, authenticated Settings, full visual inspection of each combination, and the remaining Settings, maintenance and import interaction scenarios are pending. Carry these and the incomplete Phase 3 checks into the integrated acceptance record. No shared data was written for verification.
