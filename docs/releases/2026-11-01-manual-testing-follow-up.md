# Manual testing follow-up TEST delivery

Tracking: [issue 122](https://github.com/bluewuxi/family-ledger/issues/122).

## Scope

Seven findings are implemented as described in the [plan and acceptance evidence](../plans/2026-11-01-manual-testing-follow-up.md): shared dashboard/account trends, compact latest-price labels, instrument activity, scoped monthly-review verification and wording, and settings recovery/grouping/actions. The recovery dialog displays the server-configured SSM path, not its secret value. Reusable TEST-user policy documentation from the completed identity repair is included.

The historical June Data fix chat was inspected: its transaction reassignment and snapshot verification were database-only and already completed. It had no additional source files to merge. No historical repair was replayed.

## Migration evidence

The user separately authorized applying `20261101100000_instrument_active.sql` to TEST. It was applied under the operator deployment lock on 2026-11-01. Verification confirmed `active boolean NOT NULL DEFAULT true`, 20 rows all active, and equal before/after instrument-row fingerprints excluding the additive field. This preserves original IDs and all other instrument data. Prior migration approvals remain the baseline; the final clean committed migration manifest must be registered before push.

## Verification and acceptance

- Full typecheck/build, activity, monthly summary/scope, backup, trading-password, portfolio trend, and transaction-price backfill checks passed. Earlier isolated database backup/restore checks passed with 27 tables and 52 migrations.
- Precommit independent review identified a historical-settlement edge. Full-form edits with unchanged financial inputs now preserve existing settlement while retaining unchanged-save snapshot recalculation. New/changed settlement work still rejects inactive cash. Fixtures cover equivalent decimal formatting, notes-only full-form edits, changed amount, account, and date.
- Administrator browser checks covered 320x740, 393x852, 430x932, 768x1024, and 1440x1000. Restricted-viewer browser acceptance is explicitly user-deferred. Actual inactive writes/provider runs were verified with isolated fixtures rather than mutating real holdings.
- An intermittent first private-read failure, recoverable with refresh/retry, remains an open finding. It is not claimed fixed by this release.

## Delivery status

Local implementation and authorized TEST migration verification are complete. Commit, migration approval registration, CI, and automatic TEST deployment results are recorded by the delivery follow-up. Production is outside scope. Authenticated acceptance of the deployed version is separate from the local checks above.

The initial migration registration failed closed because the complete 53-file approval exceeded SSM standard capacity. A backward-compatible maximum gzip level and concise `#122` evidence reference retain the entire manifest within the existing parameter limit; deployment verification checks exact round-trip preservation. No parameter tier, IAM, infrastructure, or gate was changed.
