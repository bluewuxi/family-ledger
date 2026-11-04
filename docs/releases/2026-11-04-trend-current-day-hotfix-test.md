# Current-day Trend Hotfix

Status: implementation, CI and automatic TEST delivery verified. Authenticated visual acceptance remains pending.

Issue: [#130](https://github.com/bluewuxi/family-ledger/issues/130). Baseline: `test` at `939aa93a77638a1fea5ca67de0e5b6ba4208f1b9`. The user authorized hotfix deployment through the existing TEST delivery workflow. Unrelated Kernel repair documents are excluded.

## Correction

The shared chart helper treated a current-day carried valuation as a saved same-day close and appended another current endpoint. Replace that carried placeholder with the live valuation. Preserve genuine saved same-day closes, earlier carried dates, unavailable gaps and current principal. This restores the [investment trend contract](../specs/investment-overview.md#dashboard-composition-and-trends) without changing stored data or business dates.

## Verification and limits

- Regression reproduced the extra `__live_endpoint__2026-11-04` category before the fix and passed afterward, including current-principal profit and no-live fallback checks. Existing same-day saved-close checks remain passing.
- Lint, typecheck, build, all 15 audited core checks, and focused account-detail/trend/time checks passed. Reviewed helper and fixture changes introduce no new external effects; only their reviewed fingerprints changed.
- Change-based planning remains conservative: the chart-helper path is unmapped and unrelated working-tree files produce additional recommendations. The full core and directly affected checks above were run; no database/live operator checks were inferred from that planning output.
- No migration, financial data repair, infrastructure change or manual deployment is included.
- Authenticated visual acceptance is pending; real user login and all five maintained viewports have not been checked. Build and automated deployment evidence do not replace that acceptance.

## Delivery

Application commit: `207cc7066b50a255ee8dacf8eb8c6296cbaa68c8`. [CI and automatic TEST deployment](https://github.com/bluewuxi/family-ledger/actions/runs/41816755459) succeeded. Backend artifacts were unchanged; the workflow published web assets and verified TEST at `2026-11-04T10:53:25Z`. Artifact SHA-256: `2c6bf864b93b1d7903133ae30dd989457090453ac9277ebc5aecf0a6214d5864`. The configured publication gate waits for CloudFront invalidation and verifies API health, unauthenticated rejection, runtime configuration, HTML and referenced assets before reporting success. Production is outside scope.
