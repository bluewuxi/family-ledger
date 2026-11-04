# Independent Kernel Actual Anchors: TEST Rollout

Status: new migration, authorized root adoption and automatic TEST delivery verified. Visual acceptance is user-waived, not passed.

## Scope and authorization

The user explicitly authorized applying, verifying and registering only `20261104110000_kernel_pending_actual_anchors.sql`, idempotently adopting the two existing actual Kernel prices as formal roots, committing/pushing test and monitoring configured automatic deployment. The previous two recovery migrations and the 39-price write manifest were not replayed. Production and manual deployment are excluded. Track delivery under [issue #129](https://github.com/bluewuxi/family-ledger/issues/129), the [approved design](../specs/2026-11-04-kernel-pending-anchors-design.md) and [implementation/verification plan](../plans/2026-11-04-kernel-pending-anchors.md).

The user separately waived visual acceptance for this change, explicitly including maintenance-page copy and pending-pairing status display. No real-login or viewport checks are claimed. This scope-specific waiver does not apply to future UI changes.

## Migration and data verification

- Confirmed test branch at starting HEAD `2bc45353905a5a6f66aa4f429b14f2f30f2937fe`, stable TEST stack, no active trusted batch jobs, enabled automatic deployment, and the previous migration manifest matching its operator approval. The independent-anchor schema/RPC was absent.
- Verified a fresh exact PostgreSQL export before mutation. Applied only the new migration under the shared deployment lock and global ledger lock, rejecting any backup/input drift. Existing table rows were unchanged apart from the additive nullable/default metadata. Verified constraints, service-only save/refresh access, exporter marker and unchanged private snapshot-publication permissions. Applied bytes were preserved locally; the source was normalized only for Git LF line endings before commit.
- Identified the actual `KN_SP500` target by ID and maintained Kernel/USF configuration, not a legacy symbol constant. Revalidated both existing Kernel Anchor rows, source evidence and two displayed decimal places. Adopted 2026-10-23 NZD 6.56 and 2026-11-03 NZD 6.61 as immutable actual roots with pending NTA references. No NTA was fabricated, and neither date nor actual price was moved or downgraded to an estimate.
- Preserved the two existing price identities and every remaining price row exactly. No new price rows were written. Two identical retries reused the same roots, and the post-commit adoption plan reports both already present. All four previous anchor/reference records were unchanged.
- The approved unpaired-winner rule retired six estimates from the older root, dated October 26–30 and November 2. Each retirement retained an exact before-value and reason in source-price revision/attempt audit. This was a targeted consequence of the new roots, not a replay of historical price ingestion.
- Recalculated the 12 persisted dates from October 23 through November 3 using the maintained revision-guarded path. Five previously valid weekday dates now correctly await matching NTA-derived inputs; October 26 was already unavailable. Weekend snapshots retain real ledger reconstruction and eligible as-of prices. Current totals: 147 available snapshots, 19 unavailable/pending dates, and 1564 price rows. All 147 available account valuations and all 166 availability decisions were independently recomputed and compared. Earlier snapshots and unrelated business/access inputs were unchanged.
- Completed Kernel snapshot repair only for its matching token and advanced the global repair token with CAS. Both repair watermarks are clear; the 19 missing-input dates remain durable pending work. Late NTA will pair asynchronously; the latest actual value remains usable meanwhile. No manual provider refresh or synthetic NTA was introduced.
- Produced a local format-14 backup from the actual post-repair export: 6550 rows, 33 allowlisted tables, three application identities. File verification and the real restore dry-run passed. No shared restore or cloud backup job was executed. Exact exports, private IDs, source evidence and logs remain ignored under `tmp/kernel-pending-rollout/`.

## Application validation

Fresh pre-delivery lint, typecheck, build, verification-tooling fixtures, documentation fixtures/consistency, all 15 fixed core checks and focused Kernel/monthly/availability/source-correction checks passed. Earlier implementation evidence includes the five disposable database checks and independent source review documented in the plan. No build or fixture is represented as visual acceptance.

## Delivery evidence

- Application commit: `3f08345cd715ea000dc10c756289bcc4fd1d70b7`. The independently verified complete migration manifest was registered against this clean commit before pushing test. Every previously approved migration path/hash remained unchanged; only the new migration was added.
- [CI and automatic TEST deployment](https://github.com/bluewuxi/family-ledger/actions/runs/41808617909) passed. The push build performed validation; the separate manual-validation job was correctly skipped for this push-triggered run. No manual deployment fallback was used.
- Independent operator reads confirmed status `verified`, stack `UPDATE_COMPLETE`, matching commit/run/artifact in last-success and the complete registered migration manifest. Artifact SHA-256: `15ca4c4193554c894a52877049e7f80702bd4f0f8387cfd9a4454b22a2cca0a4`.
- Configured online checks passed API health, unauthenticated rejection, public runtime configuration, exact HTML and referenced assets after publication. Post-deployment SQL checks retained both pending actual roots at their original dates/precision, 1564 price rows, 147 available snapshots and 19 pending dates, with Kernel repair complete. No authenticated browser acceptance is claimed.
- The final evidence updates are documentation only and must pass CI with the expected documentation-only deployment skip. They do not change the application or migration manifest.

## Subsequent read-only source lookup

The user additionally permitted another Kernel lookup if needed. The existing authenticated session remained usable. Five more two-decimal actual-price candidates were observed from visible date/value tooltips and retained only in ignored local evidence; October 26 was not observed in that chart. These are not USF NTA and were not inserted as prices or roots. Any further shared data write requires approval of its concrete candidate list; the verified rollout totals above remain unchanged.
