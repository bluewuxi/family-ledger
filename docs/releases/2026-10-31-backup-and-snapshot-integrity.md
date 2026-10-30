# Backup and Snapshot Integrity Delivery

Scope: G1 format-8 exact financial numeric serialization, G2 snapshot scope independence, and G3 current-format synthetic recovery evidence under [the existing plan](../plans/2026-10-30-rules-review-and-remediation.md). [Issue #119](https://github.com/bluewuxi/family-ledger/issues/119) records the delivered commit, workflow results, and remaining release prerequisites.

The user authorized commit and push to `test`. G4 is deferred pending a substantial Auth redesign. This delivery does not authorize online migration application/registration, independent configuration changes, or manual deployment.

## Validation

Independent scoped reviews completed. G1's legacy aggregate-shape acceptance and G3's empty-table/unrealistic pending-state coverage findings were corrected and verified. G2 review had no actionable findings.

Typecheck, build, loading checks, backup verification, isolated numeric round-trip verification, full current-format restore verification, and portfolio-trend regression passed during implementation. Before committing, backup, precision, full restore, and trend checks were repeated successfully. Markdown links/anchors and diff whitespace checks passed. G3 used 44 real migrations and 21 nonempty allowlisted tables in an isolated loopback cluster; no live financial data or cloud credentials were used. External S3/Auth/SSM recovery readiness remains operator-verified.

## Deployment boundary

The new `20261031090000_lossless_ledger_backup.sql` migration is committed source only; it has not been applied online or registered. The automatic TEST workflow must reject an unapproved migration manifest before publication. Monitor the actual pushed run and record the outcome in issue #119; do not substitute manual deployment or attest to unapplied SQL. Keep the delivery issue open while release prerequisites remain unmet.

Authenticated visual acceptance is not applicable to these backend/verification changes. No production deployment is included.
