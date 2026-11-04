# Account Detail Responsive Layout Hotfix

Status: implementation, automatic TEST deployment and user manual acceptance passed. Publication evidence is also maintained in [issue #131](https://github.com/bluewuxi/family-ledger/issues/131).

Baseline: `test` at `52af6e1281e0a5fb58e2146a12f51e26bfe5e86c`. The user authorized hotfix delivery to TEST and performed manual visual acceptance. Unrelated Kernel repair documents are excluded.

## Change

Stack account trend above account information at viewport widths up to 1180px, replacing the previous 820px threshold for this panel. Let the trend heading and range selector wrap when panel space is limited. This prevents the expanded sidebar and account-information minimum width from squeezing the chart at intermediate window sizes. The [account-detail contract](../specs/investment-overview.md#account-detail) records the responsive behavior.

## Verification and delivery boundary

- Local lint, typecheck, build, documentation consistency and diff checks passed for the CSS/specification changes. No financial calculations or data-fetching behavior changed.
- Application commit `4284218d60d9e84fb98062cf1d1d8a46faf3510f` passed [CI and automatic TEST publication](https://github.com/bluewuxi/family-ledger/actions/runs/41818313937). The workflow verified TEST publication at `2026-11-04T11:07:09Z`; backend artifacts were unchanged. Artifact SHA-256: `8d74789bea735adc742c8526721eba699c91a2b66faf58b521e65ed12e37a156`. No migration, data repair, independent infrastructure change, manual deployment or production release was included.
- On 2026-11-05 (Pacific/Auckland), after the deployed layout was handed over for manual acceptance, the user confirmed that the issue was fixed and requested this acceptance result be recorded. User manual acceptance passed for this account-detail responsive layout correction. Specific viewport dimensions were not supplied; no agent-run authenticated browser acceptance or complete five-viewport pass is claimed.
