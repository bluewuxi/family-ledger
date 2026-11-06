# Investment groups: TEST schema-first application — 2026-11-06

## Authorization and diagnosis

The user authorized read-only diagnosis, compatibility assessment against the existing deployed version, and TEST database application if compatible. This did not authorize an issue, commit, push, application deployment, synthetic shared business records, or approval-gate bypass. The existing dirty `test` checkout and HEAD `ca6fd745d504e2b51b72e82c2bd26192de59e1d2` were preserved.

Read-only catalog inspection confirmed that `investment_groups`, `investment_group_members`, and `resource_revisions` were absent. Both `read_investment_group_configuration()` and `write_investment_group(text,uuid,text,uuid[],text,uuid)` were absent. The actual REST read failed with `PGRST202`, identifying the missing configuration RPC in the schema cache. The local API target matched TEST. The deployment stack was stable, with no shared deployment lock held, and the existing migration approval did not include this migration.

## Compatibility assessment

The migration adds three tables and their fields; it does not add or modify columns on existing business tables. It also introduces classification functions, two instrument lifecycle triggers, and an additive wrapper around the existing backup exporter. Those effects were explicitly reviewed rather than treating the migration as table-only.

A disposable loopback PostgreSQL rehearsal applied all predecessor migrations, created synthetic records, then applied the exact new migration. The deployed `9a3cbe4d1fb2e7699a155fc1d5b8b406b1a168d5` backup repository/bundle code produced identical valid format-15 payloads before and after migration. Original restore validation passed. Legacy unclassified instrument update, conversion to cash, and deletion worked, with the fixture changes rolled back. All previous exporter keys/values and the financial revision were unchanged by migration. No shared fixtures were used.

The existing deployed backup writer continues to emit format 15 and therefore does not preserve newly created group configuration. Schema-first application is compatible while classification remains empty. Do not save operational group configuration through local/new clients until compatible format-16 backup coverage is delivered or an independently verified operator backup procedure covers it. This change does not claim scheduled format-16 cloud backup acceptance.

## Application and verification

- Applied `supabase/migrations/20261106120000_investment_groups.sql` at approximately `2026-11-06T07:55:48Z` (20:55 NZDT), under the shared operator/deployment lock.
- Applied source SHA-256: `26f9698c774d05e12ff3d60d404ea372a7cb9274b1a630de1c29b4db92ae16a1`.
- A fresh exact format-15 local backup was persisted, checksum-validated and checked through the deployed restore preparation before application. A format-16 backup and restore-file preflight passed afterward. Private backup files and receipts remain ignored beside the execution ledger.
- The migration ran inside one repeatable-read transaction with a financial coordination lock, bounded lock/statement timeouts, and an input-drift guard. Before commit, every pre-existing exporter key/value and the financial revision were compared and confirmed unchanged. Existing instrument columns were independently confirmed unchanged afterward.
- Initialization contains zero groups, zero memberships and exactly `resource_revisions('investment_groups', 0)`. No group test data or financial repair was performed.
- All three new tables have RLS enabled. `anon` and `authenticated` lack direct table CRUD and execution rights on both configuration RPCs. The REST read succeeded after schema notification and returned `{ revision: "0", groups: [] }`.
- The shared lock was released. The application stack and `last-success` deployment remain unchanged at `9a3cbe4d1fb2e7699a155fc1d5b8b406b1a168d5`.

## Registration, deployment and acceptance

Migration registration is pending: the new migration is uncommitted and the checkout is dirty. The maintained registration tool requires a clean verified commit. The existing approval was intentionally left unchanged; no false approval was recorded against an unrelated HEAD. After separately authorized commit preparation, register the complete verified migration manifest under the [TEST procedure](../test-auto-deployment.md#independent-changes) before any later application delivery. Do not replay the SQL merely to register it.

No application deployment occurred. The local authenticated dashboard subsequently showed ready ungrouped allocations, and its management shortcut displayed the empty group list with creation available. No group was saved. This confirms removal of the schema dependency blocker, not completion of dual-theme, five-viewport, drawer or viewer acceptance. Continue the remaining [plan acceptance](../plans/2026-11-06-investment-groups.md#task-8-authenticated-acceptance-and-handoff) through the real-login procedure without synthetic shared records.
