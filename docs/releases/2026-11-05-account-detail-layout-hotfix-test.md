# Account Detail Responsive Layout Hotfix

Status: local implementation verified. Publication results and exact commit/run references are maintained in [issue #131](https://github.com/bluewuxi/family-ledger/issues/131).

Baseline: `test` at `52af6e1281e0a5fb58e2146a12f51e26bfe5e86c`. The user authorized hotfix delivery to TEST and will perform manual visual acceptance. Unrelated Kernel repair documents are excluded.

## Change

Stack account trend above account information at viewport widths up to 1180px, replacing the previous 820px threshold for this panel. Let the trend heading and range selector wrap when panel space is limited. This prevents the expanded sidebar and account-information minimum width from squeezing the chart at intermediate window sizes. The [account-detail contract](../specs/investment-overview.md#account-detail) records the responsive behavior.

## Verification and delivery boundary

- Local lint, typecheck, build, documentation consistency and diff checks passed for the CSS/specification changes. No financial calculations or data-fetching behavior changed.
- Deliver through configured CI and automatic TEST publication; record its actual result in the linked issue before closure. No migration, data repair, independent infrastructure change, manual deployment or production release is included.
- Visual acceptance is pending the user's manual checks. No automated authenticated browser acceptance or five-viewport pass is claimed. The prior trend-value correction was reported as visually correct by the user; that observation does not certify this new layout change.
