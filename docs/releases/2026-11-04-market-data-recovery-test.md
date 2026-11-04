# Market Data Recovery TEST Rollout

Status: TEST migrations, authorized data repair, registration and automatic application delivery verified. Kernel NTA estimation-anchor pairing remains pending. The user explicitly waived authenticated visual acceptance for this rollout.

Issue: [#129](https://github.com/bluewuxi/family-ledger/issues/129). Baseline: test at 4fd2193b7ccfd8dc5e74e8ef58a071961c850f34. The user explicitly authorized both new migrations, migration registration, 39 price inputs, snapshot reclassification/repair, issue creation, commit, push and automatic TEST delivery monitoring. Production and independent infrastructure changes are excluded.

## Schema and operational evidence

- Applied only 20261104090000_price_acquisition_recovery.sql and 20261104100000_snapshot_availability.sql. Verified all four new state/audit tables, snapshot availability, service-only quote publication, private snapshot helper denial, anonymous table denial and recovery-state backup export. Older reliability migrations were not replayed.
- Before mutation, TEST stack was UPDATE_COMPLETE, automatic deployment was enabled, no recent batch job was active, and existing schedules were enabled with unreserved concurrency. Price/FX remained Tuesday-Saturday Shanghai schedules; snapshots remained daily at 06:30 Shanghai. No scheduler, concurrency or infrastructure setting was changed.
- Operator maintenance used the existing deployment lock. Exact PostgreSQL exports were saved before migration/prices and after repair in ignored local storage. Credentials and private export contents are not included here.

## Authorized price and snapshot effects

- Inserted 39 previously missing rows in one transaction, with operator attempt/revision audit and source provenance: 8 Yahoo raw closes, 27 user-approved two-decimal InvestNow prices, 1 exact FundRock published price, 1 user-provided China close, and 2 direct Kernel actual prices. Chart/user values use protected manual provenance; the more precise FundRock value was retained.
- Kernel direct prices are stored as Kernel Anchor, is_estimated=false, preserving the displayed date and precision. They are usable actual prices. The estimator anchor table requires corresponding published USF NTA, which was unavailable in the read-only probe; no fabricated proxy metadata or estimator roots were inserted. Pairing these observations as future NTA estimation roots remains outstanding.
- Reclassified/recomputed all 166 persisted dates through 2026-11-03 under shared weekday/weekend eligibility. Of the 45 previously incompatible dates, 31 became valid; 14 remain unavailable with retained audit/account rows and durable pending diagnostics. There are 152 valid snapshots.
- The remaining 38 instrument/date pairs were explicitly identified by the user as market closures. They retain pending snapshot dates and needs_attention acquisition state with USER_CONFIRMED_MARKET_CLOSURE; no automatic holiday calendar or synthetic weekday close was introduced.
- First bulk snapshot attempt rolled back on the revision guard because each snapshot publication also advances revision. The resumed transaction validated its initial revision, held the global ledger lock, and passed the current revision for each guarded publication. Prices were reverified at PostgreSQL numeric(28,10) precision and not inserted twice.
- Independent post-write calculation compared every available account snapshot with shared authoritative calculations. Verified all 152 available records, 14 unavailable/pending dates, 38 closure pairs and exactly 39 new prices. All 1531 pre-existing price rows and protected transaction/account/instrument/FX/identity/access inputs remained unchanged.

## Validation and delivery

- Fresh rollout preflight: lint, typecheck, build, all 15 core checks, 9 focused acquisition/provider/report/client checks and disposable price-acquisition PostgreSQL verification passed. Prior scoped review, signed/revision DB and full format-13 restore evidence is recorded in the [implementation plan](../plans/2026-11-04-market-data-and-snapshot-recovery.md); those older runs are not represented as freshly repeated.
- Migration registration must follow the clean verified commit, then push test through configured CI/automatic deployment. Do not substitute manual deployment if a gate fails. Final commit/run evidence will be retained on issue #129.
- The user explicitly waived Family Ledger visual acceptance for this rollout. Record it as user-waived, not passed. InvestNow/Kernel source lookup is not Family Ledger acceptance. No login bypass or authenticated application write smoke was used.

## Verified automatic delivery

- Code commit: 412eee0bc3d276554f3f223ffad9f0223aa36535. Both independently verified migrations were registered against this clean commit before push.
- [CI and automatic TEST deployment run](https://github.com/bluewuxi/family-ledger/actions/runs/41797892978): build and deploy jobs succeeded. The manual-validation job was skipped because this was a push-triggered run; the build job performed validation.
- Deployment status reached verified, the stack returned UPDATE_COMPLETE, and last-success independently matched the exact code commit and run. Artifact SHA-256: ab08795f51d3acd23b2f5db32d77ef8b755129b18975e6e31783fb42568c31ab.
- Configured online verification passed API health, unauthenticated rejection, runtime configuration, exact HTML and referenced JS/CSS asset checks after cache invalidation. No manual deployment fallback was used.
- A local format-13 backup built from the actual post-repair TEST export passed file verification and restore dry-run: 6521 rows, all 33 allowlisted tables and application identity dependencies. No real restore or cloud backup job was executed for this check.
- Final evidence updates are documentation only and do not change the deployed application or migration manifests. Their push must pass CI and confirm the expected documentation-only deployment skip.

## User acceptance decision

The user explicitly stated that visual acceptance is unnecessary for this rollout and waived it. No visual inspection is claimed. This is a rollout-specific decision and does not change the maintained default browser/login procedure for future work.
