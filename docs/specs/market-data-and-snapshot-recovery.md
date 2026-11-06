# Market Data Acquisition and Snapshot Recovery

Status: implemented; additive TEST migrations and authorized historical reclassification/repair verified. Automatic TEST delivery passed for 412eee0; visual acceptance was explicitly waived by the user for this rollout, as tracked in [TEST rollout evidence](../releases/2026-11-04-market-data-recovery-test.md). See the [implementation plan](../plans/2026-11-04-market-data-and-snapshot-recovery.md).

## Acquisition

The browser requests valuations through the API. API/jobs use typed source capabilities and batches; a business batch may use bounded per-instrument HTTP requests when the source has no verified native batch endpoint. Yahoo and Eastmoney supply intraday quotes; FundRock supplies published daily unit prices; Kernel supplies explicitly estimated NTA-derived values. Manual-only prices never cause automatic requests.

Ordinary valuation reads reuse the five-minute quote cache. Explicit refresh has a sixty-second per-instrument/source floor. Reporting-currency changes, filters, and chart-range changes do not force fresh quotes. A cached valuation is displayed before any due acquisition. Server refresh hints suppress daily-only polling and pause automatic weekend acquisition using the source market's local date. No holiday calendar is assumed.

Per-item results retain completed successes when another item fails or the quote batch reaches its six-second deadline. Two upstream requests per source may run concurrently; FundRock still reads one page per business batch. Source date/time, acquisition time, source identity, currency, and price kind are distinct facts. A recent acquisition timestamp does not establish that the underlying quote is recent.

Source/instrument leases coordinate concurrent Lambda requests. Expired leases can be reclaimed; stale owners cannot complete newer work. Preserve newer quote dates/acquisition instants, exact decimal boundaries, and manual-price precedence. Do not adopt another endpoint or fallback source without the maintained data-source decision.

## Formal snapshot eligibility

Snapshot dates retain the global Asia/Shanghai 06:00 business cutoff. A scheduled run uses its original event time to derive the last completed date.

- On weekdays, automatically priced nonzero holdings require an eligible historical price for the snapshot date. A weekday public holiday may therefore leave a gap. An HTTP success returning an older date does not establish that the market was closed.
- Published fund prices or estimates arriving late leave that weekday pending until its correctly dated value is available. Do not shift a later published price into an earlier missing date. This tightens the previous historical FundRock lag policy; current valuation can still use the latest published value.
- Saturday/Sunday snapshots use the latest eligible historical price on or before that date and reconstruct that day's actual transactions, holdings, and cash. They are real weekend snapshots, not copies of Friday's complete valuation.
- Manual-only/disabled automatic-price targets retain their configured manual valuation behavior. Cash has no security-price requirement. A missing prior comparison close does not invalidate independently available asset values.
- Existing FX rules remain: use valid as-of valuation FX and exact transaction-date FX where required; never invent future FX, zeros, or partial totals.

Every write path applies the same eligibility policy, including scheduled generation, transaction-driven recalculation, and repair. Missing necessary data records a durable pending date. Existing invalidated records remain auditable but are excluded from usable history. A valid transaction is not rejected merely because a derived snapshot cannot yet publish. Publication and pending status are committed under existing ledger revision/transaction guards.

## Historical recovery

Gap state is independent of successful job execution and snapshot repair watermarks. Group consecutive dates for each source/instrument into bounded historical queries. Current Yahoo history reuses the existing daily-bar endpoint, unadjusted close parser, and exchange confirmation rules. A source without an implemented historical adapter reports unsupported history and retains an intervention-needed gap.

Successful items persist even if another date is unavailable. Source-owned corrections retain decimal before/after provenance and atomically invalidate affected snapshots. They do not remove or overwrite manual/transaction-owned prices. New dated inputs wake matching gaps and pending snapshot work.

Transient failures use bounded 5/15/60-minute recovery intervals; rate-limit delays can extend them. Historical gaps then receive daily probes, stopping automatic probing after seven unsuccessful daily attempts. Unpublished dates, unsupported history, transport failures, and intervention states remain distinct. A weekday holiday is not silently reclassified as a resolved gap.

Bound each invocation by remaining time. Persist progress and cooldowns; pending old dates must not starve newer complete dates. Snapshot maintenance reports incomplete work rather than claiming full coverage, while preserving later successful publications. Existing administrator retrieval actions can request retries; viewer reads do not gain ingestion permissions. Scheduler delivery retries and Lambda execution retries are different mechanisms and require separate operational verification.

## Reads and reports

Historical date lookup resolves the newest valid snapshot at or before the requested date in the same authorized account/purpose scope. Return requested date, actual snapshot date, fallback flag, and reason; no predecessor means unavailable. Never persist a duplicate snapshot solely to fill a query date.

Carried assets retain the predecessor's ledger/principal state and saved conversion rates. Charts identify carried segments and actual dates; they do not fabricate actual snapshot markers or count a carried value as another day's investment gain. Current live valuation remains a distinct endpoint using the latest ledger.

Monthly opening/closing asset values can carry with explicit actual-date labels. When boundaries do not cover the requested month, full-month gains, reconciled attribution, and contribution percentages remain unavailable. Requested-month transaction/activity lists remain visible independently. A repaired exact boundary restores normal calculations.

Maintenance pagination remains a list of persisted records; invalidated records are visibly unavailable. Recovery counts, earliest missing date, and intervention status appear through existing source diagnostics. Scope checks precede aggregation; do not expose hidden-account reasons. History cache identity includes persisted revision so other Lambda workers' completed repairs become visible.

## Persistence, validation, and delivery

Additive schema stores acquisition state/attempts, source-price revisions, quote occurrence timestamps, pending snapshot dates, and snapshot availability. Server-only RPCs enforce ownership and atomic writes. Backup format 13 includes durable recovery/audit state and excludes active lease ownership on restore; legacy formats remain readable.

Run the acquisition, recovery, snapshot availability/client, provider/ingestion, holdings/dashboard/account, trend/monthly, time-policy, snapshot catch-up/revision, and backup/restore checks described in [local testing](../local-testing.md), plus lint/typecheck/build. Database fixtures use disposable loopback clusters. Authenticated UI acceptance requires the user's real login and all five maintained viewports.

Preparing migrations does not authorize applying them. Deployment must not silently certify/rewrite older snapshots under stricter eligibility. Produce a read-only impact audit first, then obtain separate authorization for reclassification, repair, configuration changes, and TEST delivery through the [existing gates](../test-auto-deployment.md).

## Independent Kernel actual anchors

Actual prices remain usable before NTA pairing. A latest applicable unpaired actual root blocks its following estimate interval; no older-root fallback is generated. NTA title dates map to the same actual/estimate valuation date, including Monday. Only version-2 references pair roots; legacy shifted references remain audit-only. Publication time gates eligibility. The financial ratio and snapshot eligibility/revision protection remain unchanged. Late pairing resumes eligible estimates and pending snapshot repair. TEST migration, actual-root adoption and automatic application delivery are verified in the [rollout record](../releases/2026-11-04-kernel-independent-anchors-test.md). The user explicitly waived visual acceptance for this change, including maintenance copy and pending-pairing display (2026-11-04); record user-waived, not passed. See the [approved design](2026-11-04-kernel-pending-anchors-design.md).
