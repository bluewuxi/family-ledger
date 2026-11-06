# Kernel NTA Same-Date Mapping: Impact Preview and Repair Plan

**Status:** Implemented. User authorized migration, bounded data repair, issue/commit/push and automatic TEST deployment on 2026-11-06; then explicitly extended the repair through November 5. TEST migration, repair and automatic application delivery are verified; delivery evidence is tracked in the [release record](../releases/2026-11-06-kernel-nta-same-date-test.md). Visual acceptance is user-waived for this task.

Maintained contracts: [market data](../data-model.md#market-data-foundation), [time policy](../time-policy.md), [repair procedure](../operations/kernel-nta-repair.md#same-date-repair), [backup](../operations/backup-restore.md), and [TEST delivery](../test-auto-deployment.md).

For implementation, use the executing-plans skill and the project workflow. Work in the existing test checkout. Preserve pre-existing documentation changes.

## Evidence and proposed contract

Preview captured at 2026-11-05T19:49:31.375Z; input SHA-256: d0ace479bf62d8a8296597006dd1c91f636e13147752e40a327ddd9cf042cabe. The database export was read in a repeatable-read, read-only transaction. Official NZX annual announcements were fetched read-only and merged only in memory. Latest observed NTA date: 2026-11-04. Private exact input, source records and detailed calculations are in ignored tmp/nta-preview*.json.

Proposed rule: NTA valuation date equals Kernel estimate date; publication time only gates eligibility. Same-date actual roots pair to same-date NTA. Actual prices and manual/transaction-owned prices retain precedence. This is a scenario preview, not approval of a changed maintained contract.

The preview reuses authoritative holdings, decimal valuation and snapshot eligibility functions. It checks 167 persisted/pending dates; baseline availability mismatches: 0. It does not certify stored account values or execute production RPCs. Missing dates outside the persisted/pending set are not claimed covered. Official source history supplies September 30 and October 27 references absent from stored observations.

## Reference changes

Nine immutable roots across eight dates are affected; September 30 has two historical roots. Keep both identities and existing revision precedence. Append versioned references; do not rewrite actual roots or delete historical references.

| Actual date | Actual NZD | Current NTA date | Proposed NTA date |
| --- | --- | --- | --- |
| 2026-11-03 | 6.6100000000 | 2026-11-04 | 2026-11-03 |
| 2026-11-02 | 6.5800000000 | 2026-11-03 | 2026-11-02 |
| 2026-10-30 | 6.6000000000 | 2026-11-02 | 2026-10-30 |
| 2026-10-29 | 6.7300000000 | 2026-10-30 | 2026-10-29 |
| 2026-10-28 | 6.7600000000 | 2026-10-29 | 2026-10-28 |
| 2026-10-27 | 6.6600000000 | 2026-10-28 | 2026-10-27 |
| 2026-10-23 | 6.5600000000 | Pending | 2026-10-23 |
| 2026-09-30 | 6.6700000000 | 2026-10-01 | 2026-09-30 |
| 2026-09-30 | 6.6700000000 | 2026-10-01 | 2026-09-30 |

## Price manifest

Fifteen estimates change value, one new estimate is proposed, and one source-owned estimate is retired in favor of an existing manual price. All quantities below are NZD per unit.

| Date | Existing estimate | Proposed estimate |
| --- | --- | --- |
| 2026-10-01 | 6.7285866353 | 6.6445305986 |
| 2026-10-02 | 6.7605016328 | Retire; preserve manual 6.7565670000 |
| 2026-10-05 | 6.8349906776 | 6.7346866509 |
| 2026-10-06 | 6.8437766954 | 6.8088912592 |
| 2026-10-07 | 6.8562042491 | 6.8176437275 |
| 2026-10-08 | 6.8186390794 | 6.8300238266 |
| 2026-10-09 | 6.8553454229 | 6.7926020995 |
| 2026-10-12 | 6.8659507961 | 6.8291682799 |
| 2026-10-13 | 6.8418612870 | 6.8397331564 |
| 2026-10-14 | 6.8158252936 | 6.8157356332 |
| 2026-10-15 | 6.7848877759 | 6.7897990582 |
| 2026-10-16 | 6.6499983905 | 6.7589796754 |
| 2026-10-19 | 6.6727205579 | 6.6246053653 |
| 2026-10-20 | 6.6726499307 | 6.6472407681 |
| 2026-10-21 | 6.7034433691 | 6.6471704106 |
| 2026-10-22 | 6.6459641676 | 6.6778462642 |
| 2026-11-04 | Absent | 6.6427338402 |

## Snapshot impact

Twenty dates have changed calculated portfolio values: October 1, October 5–22, and November 4. Fifteen of these dates are available and remain available (October 8–22); five remain pending (October 1, 5–7, November 4). No availability transition occurs in this scenario. Pending calculated totals are diagnostic only and must not be published as complete valuations.

Also re-evaluate October 2–4 and October 23–26: diagnostics/comparison inputs can change even where headline totals do not. The conservative repair window is October 1 through November 4 inclusive (35 calendar dates); preserve unchanged persisted values when possible. October 27–November 3 retain actual-price valuations.

| Date | Before status | After status | Calculated value delta USD | Remaining missing symbols |
| --- | --- | --- | --- | --- |
| 2026-10-01 | pending | pending | -212.384490 | 161128, 159501 |
| 2026-10-02 | pending | pending | 0.000000 | 161128, 159501 |
| 2026-10-03 | ready | ready | 0.000000 | None |
| 2026-10-04 | ready | ready | 0.000000 | None |
| 2026-10-05 | pending | pending | -418.371006 | 161128, 159501 |
| 2026-10-06 | pending | pending | -146.186584 | 161128, 159501 |
| 2026-10-07 | pending | pending | -160.945041 | 161128, 159501 |
| 2026-10-08 | ready | ready | 47.467533 | None |
| 2026-10-09 | ready | ready | -262.762029 | None |
| 2026-10-10 | ready | ready | -262.762029 | None |
| 2026-10-11 | ready | ready | -262.762029 | None |
| 2026-10-12 | ready | ready | -153.644300 | None |
| 2026-10-13 | ready | ready | -8.911373 | None |
| 2026-10-14 | ready | ready | -0.375509 | None |
| 2026-10-15 | ready | ready | 20.519520 | None |
| 2026-10-16 | ready | ready | 460.459841 | None |
| 2026-10-17 | ready | ready | 460.459841 | None |
| 2026-10-18 | ready | ready | 460.459841 | None |
| 2026-10-19 | ready | ready | -203.569546 | None |
| 2026-10-20 | ready | ready | -107.643501 | None |
| 2026-10-21 | ready | ready | -238.965004 | None |
| 2026-10-22 | ready | ready | 135.111508 | None |
| 2026-10-23 | ready | ready | 0.000000 | None |
| 2026-10-24 | ready | ready | 0.000000 | None |
| 2026-10-25 | ready | ready | 0.000000 | None |
| 2026-10-26 | pending | pending | 0.000000 | FS_NASDAQ_100, KN_SP500 |
| 2026-11-04 | pending | pending | 137.649773 | FS_NASDAQ_100 |

The November 4 Kernel estimate becomes 6.6427338402, but FundRock FS_NASDAQ_100 still blocks the snapshot. Existing October 26 gaps and unrelated A-share gaps are not repaired by this change.

## Implementation and repair steps

- [x] Confirm the proposed same-date contract; update docs/data-model.md, docs/time-policy.md, docs/api.md and affected investment/recovery specifications together. Read root, shared, jobs, API, scripts and supabase AGENTS.md plus project-workflow, architecture, auth, local-testing, backup-restore and TEST delivery contracts before implementation.
- [x] Add focused fixtures to the existing Kernel verification scripts: same-date pairing, Monday without Friday shift, delayed publication, missing holiday dates, latest-root precedence, duplicate September 30 roots, manual October 2 protection, amended NTA, and stale-reference rejection. Pin November 4 to 6.6427338402 with the captured exact inputs.
- [x] Change packages/shared/src/nzxNta.ts to use an explicit NTA valuation-date rule. Leave legacy session-date helpers intact for legacy callers. Filter retained references by the active date-mapping version; never let a later-published old-rule reference win over a correct same-date reference.
- [x] Add a new migration rather than editing applied migrations. Version reference semantics and update refresh_kernel_nta validation/selection, reference constraints and idempotency as required. Preserve old references as audit-only. Stale-announcement comparisons must apply within the same valuation date and mapping version, not compare unrelated dates. Missing new-version references must permit pending status even where legacy references exist. Reject old client payloads after cutover. Update API/jobs reference readers and backup export/restore compatibility for the new metadata.
- [x] Build a repeatable dry-run/apply operator tool with an explicit manifest, exact source evidence, before/after decimals, input/revision drift checks and no default write mode. Preview all dates again at execution time; do not treat this captured report as timeless. Preserve manual and transaction ownership and actual precision.
- [x] Run lint, typecheck, build and affected Kernel, availability, snapshot, monthly, time-policy, backup/restore checks through the reviewed verification entry point. Exercise migration and repair on a disposable local database: old-code rejection, mixed-version references, retry idempotency, rollback, failure between publication and repair, and untouched business-table equality.
- [x] Obtain separate authorization for migration, deployment and bounded data repair. Coordinate the shared deployment lock and ledger lock so old workers cannot regenerate shifted estimates. Do not change schedules or executor settings without separate authorization. Do not bypass blocked automatic TEST deployment.
- [x] Before live repair, export and verify a fresh exact backup and restore dry-run. Recheck source evidence and drift under the maintained guards. Append nine versioned root references, revise fifteen estimates, retire the October 2 estimate while preserving its manual row, add November 4, and record every change through source-price audit/revision paths. Preserve legacy root identities, actual prices, transactions, FX, accounts and access data.
- [x] Queue revision-guarded repair from October 1 through the latest authorized completed date. The captured window ends November 4 and requires more than one 30-date batch. Retain progress and CAS/token checks; do not clear repair watermarks prematurely. Recompute every account and portfolio value and independently compare publication decisions; verify unchanged earlier dates and unrelated inputs.
- [x] Verify idempotent replay and backup/restore of the final state. Report implementation, deployment, and visual acceptance separately. Pure data repair has no visual acceptance requirement; application display changes require the normal acceptance procedure unless explicitly waived. FundRock repair remains separate.

## Rollback and review gates

Do not revert to old application code after versioned reference activation without a compatible rollback. Prefer forward repair; any restored price/reference state must include matching snapshots and preserve audit history. Never restore the entire shared database over newer unrelated family activity. Stop on unexpected ownership conflicts, source amendments, baseline mismatches or revision drift and regenerate the manifest.

This preview used full authoritative calculations in memory, but the final operator tool must independently compare all persisted header/account values, warnings and daily-change fields. Six unchanged-total dates in the table are conservative diagnostic changes, not claims that each needs a monetary rewrite. No live writes or authenticated visual acceptance were performed.

## Current execution evidence (2026-11-06)

Work remains in the existing test checkout at baseline 08ea234eb7cbe9610b4af2ff64a14bbefb902b50; pre-existing documentation is retained. No shared writes, commits, pushes or deployments have been performed.

Fresh repeatable-read TEST export and official NZX annual announcements reproduce nine root references, fifteen estimate corrections, retirement of the October 2 source estimate with manual 6.7565670000 unchanged, and the November 4 estimate 6.6427338402. The window is still October 1–November 4 (35 days). All 167 persisted/pending dates were simulated: twenty value-change dates and no availability regressions. Full persisted account/derived-total/FX/warning/daily-change comparison finds no available baseline mismatches. Five already-unavailable pending dates retain differing audit values (June 19, August 31, October 1, October 2, October 26); these are not repaired by publishing incomplete totals. November 4 remains pending for FundRock FS_NASDAQ_100. Private evidence remains under ignored .local/kernel-nta-same-date.

The new migration is 20261106090000_kernel_nta_same_date.sql. It activates version-2 pairing and rejects old refresh payloads without rewriting immutable roots. Backup format 15 retains old version-1 audit and new version-2 metadata; original version-14 checksums remain supported. The operator tool uses explicit checksummed manifests, live input/source/revision drift rejection, a shared deployment lock plus ledger locks, verified backup/file restore preflight, price audit, protected/unrelated-row comparison, bounded snapshot publication and retained CAS work.

Independent review identified invalid migration SQL delimiters and per-batch reuse of a stale ledger revision. The fix extracts the exact guarded SQL builders for isolated execution and chains current revisions only while holding the original ledger lock. Regression evidence and final command results are recorded below when finished.

Approval gate: separately approve one migration plus migration registration, bounded data repair, and an identified reviewed commit/push to automatic TEST delivery. A post-migration manifest is mandatory; drift stops execution and requires refreshed review. Production and schedule changes are excluded.

## Verification and review outcome

- Core reviewed fixture profile plus Kernel, snapshot availability/catch-up, market-data, monthly, account-detail and price-recovery checks passed. Focused Kernel/backup/monthly/snapshot/time/availability checks were rerun after review fixes.
- Kernel disposable DB passed the exact generated guarded migration, old-payload rejection, mixed versions, manual protection, stale/amended evidence, audit retry and transactional rollback.
- Full-schema backup restore passed: 33 allowlisted tables, 59 migrations, format 15, mixed v1/v2 references, exact restored rows and late failure rollback. Exact operator SQL also passed 30+5 snapshot publication, stale-token rejection, per-publication revision chaining, resumed work and pending audit preservation. The multi-date case first reproduced the stale revision failure, then passed after the fix.
- Snapshot revision, signed snapshot and backup precision disposable checks passed. No shared database fixtures or writes were used.
- Lint, typecheck and build passed; documentation fixtures/consistency and diff whitespace review passed. Verification selection reported conservative unmapped source paths; affected checks were selected manually from the maintained reading routes. Non-local checks remain excluded from the fixture runner and were executed only under their isolated procedures.
- One independent final review found two Important operator defects, both fixed and isolated SQL execution verified. Its stale-plan-status minor is resolved here. No deferred findings remain. The progress ledger is retained because changes are uncommitted.

The old one-time cutover tool now rejects apply mode. Same-date operator evidence includes the migration file checksum, and backup verification reads the persisted gzip file back before any write. Fresh authorization is still required for the actual shared migration and repair.

## Authorized TEST execution

Issue [#133](https://github.com/bluewuxi/family-ledger/issues/133). The user approved original implementation scope fingerprint 837a5765637d8e22 and later explicitly extended the financial manifest to October 1–November 5 (36 dates). Fresh source/data checks matched that bounded scope before both operations. The earlier 35-date attempt stopped before migration when a newly published November 5 announcement changed the manifest; no scope was extended implicitly.

The new migration passed exact backup/file preflight, ledger/deployment locks and unchanged-business-row comparison. Price repair appended nine version-2 references and eighteen source-price audit records (sixteen corrections, one retirement, one insertion). The October 2 manual value remains 6.7565670000. Kernel actual prices are from Kernel; FundRock FS_NASDAQ_100 is an independent instrument.

After price commit, the tool failed closed on the existing price-gap resolution trigger updating two related Kernel acquisition-state rows. Read-only before/after evidence established no out-of-scope business change. A scope-preserving operator correction now validates the exact related source/date/identity and resolution fields separately; unrelated acquisition rows/attempts still fail closed. Invalidated snapshot headers are resumable, while currently published baseline mismatches remain blocked. Focused synthetic regressions and a fresh review covered these corrections, including backup-normalized lease handling. No migration or financial formula changed in this recovery.

A fresh resume manifest had zero further price/reference changes and the same 36 snapshot dates. Publication ran as 30+6, verifying every account, derived total, FX, warning and publication decision. Twenty-nine dates are available and seven remain pending. November 4 is now available because its separate source inputs arrived; November 5 remains pending for FS_NASDAQ_100. Earlier snapshots and unrelated source inputs were unchanged. Kernel pending work cleared only with its original matching token; the global repair watermark remains under normal CAS maintenance. Transactional replay verification returned changed_count=0 and rolled back the probe. Pre/post format-15 backups passed persisted-file validation and restore preflight.

Automatic TEST deployment passed for 9a3cbe4d1fb2e7699a155fc1d5b8b406b1a168d5 in [CI run 42143724020](https://github.com/bluewuxi/family-ledger/actions/runs/42143724020). Matching last-success state and artifact digest are recorded in the release evidence. Original three unrelated documents were restored byte-for-byte after temporary isolation for clean migration registration.
