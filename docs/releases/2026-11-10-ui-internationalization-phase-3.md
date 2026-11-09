# Phase 3 UI Internationalization Evidence

Implementation is local on `test`, based on `4e1bc78a72765765123ae13412db7969977e61ce`. Deployment was outside the implementation request. Visual acceptance is partially verified. The public language switch stays gated. See the [implementation plan](../plans/2026-11-07-ui-internationalization-phase-3.md) and [coverage ledger](../specs/ui-internationalization.md#phase-3-investment-coverage).

The investment workflows use bundled resources, explicit display locales, structured warning facts and semantic error descriptors. The API adds optional allowlisted error details while retaining its legacy failure envelope. Old envelopes receive localized fallback guidance. The reason catalog and parameter validation live in [the shared contract](../../packages/shared/src/investmentErrorDetails.ts).

## Implementation checks

- Root lint, typecheck, build, documentation checks and whitespace review were run.
- The reviewed runner passed 42 checks, including the fixed core profile, all five earlier internationalization checks, Phase 3 resources, copy, real-handler state and account checks, error metadata, loading, group regressions, investment checks and tooling.
- Synthetic checks verified monthly draft and pending write retention, identical transaction retry key and payload after response loss, changed-payload rejection, new operation identity after a definite rejection, account opening partial success and fake secret clearing. The independent review found that account warning copy lost instrument, currency and date. A regression check failed before restoring these facts and passed afterward.
- The changed-path recommendation left paths unmapped. The explicit suite covered the changed investment, authorization, presentation and verification contracts. The fixture is a separate DEV entry and was exercised in the browser.
- A Vite production comparison against archived baseline sources with the same installed dependencies measured the main JS chunk at 345.35 kB / 103.75 kB gzip before and 411.20 kB / 121.60 kB gzip after. The difference is 65.85 kB raw and 17.85 kB gzip. Vendor and chart chunk sizes were stable. Built output contained no Phase 3 fixture markers. The production startup fixture exercised the Chinese gate with stored English and checked that initialization requested no remote language resources.
- A temporary baseline move followed Windows dependency junctions. The original shared sources were recovered from the destination, dependencies were restored from the existing offline store with the frozen lockfile, and validation was rerun. The tracked lockfile was unchanged.

## Browser coverage

| Check | Sizes | Coverage |
| --- | --- | --- |
| Isolated fixture layout measurements | 320x740, 393x852, 430x932, 768x1024, 1440x1000 | 180 combinations across nine route surfaces, two languages and two themes. At fixed viewports, all sampled pages fit without document-level horizontal overflow. Tables retain their own scroll containers. |
| Authenticated read-only route measurements | Same five sizes | Dashboard, monthly review, holdings, transactions, instruments and accounts in both languages using the user's active dark theme. The 60 settled checks had no document-level horizontal overflow. Holding detail and account detail were additionally measured in English. |
| Isolated interaction checks | Desktop and 320x740 | A pending monthly save retained the draft and stayed at ten requests and one write across the language switch. The success notice rendered in Chinese. A narrow instrument drawer screenshot showed the scrollable form and reachable footer. A fixture rejection and language switch retained its draft and stayed at 333 requests and two writes. |

The user agreed to read-only inspection and confirmed dashboard readiness after restarting the laptop. Both local auth bypass flags were disabled. The authenticated check exercised the asset trend and group distribution tabs. No real ledger forms or password actions were submitted. The isolated fixture intercepted its transport and kept data and storage local to the document.

The layout matrix is based on DOM measurements with screenshot spot checks. Complete screenshot inspection of each combination, comprehensive tooltip and focus interaction checks, and native confirmation interaction were not completed. No real-session network recorder was used. State and request assertions for writes come from isolated fixtures. The viewport overrides were reset after inspection.
