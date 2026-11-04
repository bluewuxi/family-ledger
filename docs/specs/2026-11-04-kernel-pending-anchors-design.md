# Independent Kernel Actual Anchors

Status: Approved by the user on 2026-11-04. Initial authorization was local only; the user subsequently authorized the bounded TEST migration/adoption/automatic-delivery rollout, recorded in [release evidence](../releases/2026-11-04-kernel-independent-anchors-test.md).

## Intent and approach

Save observed actual unit prices independently of USF NTA. Reuse the append-only anchor table: new roots have `proxy_value_type = pending`, null reference fields, source and observed decimal precision. Pairing appends complete `nta` children; pairing status is computed without rewriting roots. Existing complete roots and legacy open audit records remain supported.

Alternatives considered: a separate actual table adds unnecessary identity and restore migration; mutable reference fields weaken audit history. The user approved independent immutable roots with appended references.

## Durable behavior

- Save the root and non-estimated price atomically without provider requests. Retire source-owned estimates in its interval and queue snapshot repair. Identical date/value/source/precision retries reuse the root and cannot supersede newer actual revisions.
- Record observed decimal precision, not database padding. Legacy source/precision remain unknown. Reject conflicting higher-precision Kernel Anchor values and manual-price conflicts. Never modify manual or transaction-owned prices.
- Select latest applicable actual date and actual revision before checking pairing. An unpaired winner blocks its interval; never fall back to older paired roots. Earlier intervals remain eligible; actual dates remain actual valuations.
- Append paired/amended references. Use stored references when omitted from later lists. Publication time then announcement ID decides reference priority; reject stale replacements and inconsistent content for the same announcement ID.
- Generate estimates only with both dated NTA values, using the existing ratio and weekday mapping, one half-up rounding to ten places, real publication cutoff, and omission of missing dates. SQL validates pending intervals and submitted ratio evidence.
- Pairing cannot change root identity/date/value/creator/revision order. Preserve service-only RPCs, global ledger lock order, revision guards, invalidation and token-checked repair completion.
- Backup format 14 preserves nullable references and source precision; validate original-version checksums before normalization. Versions 2–13 remain readable. Restore roots before references. Older readers reject format 14; rollback requires schema/data compatibility review.
- Keep date/price requests compatible; add optional source/precision and explicit pairing status. Render missing references honestly in the existing UI. The user explicitly waived visual acceptance on 2026-11-04 for this change, including maintenance copy and pending-pairing display; record user-waived, not passed. This does not waive future UI changes.
- Prepare adoption of existing prices locally from exported input, identified by ID/configuration rather than symbol constants. Reuse price identities; reject conflicts, manual ownership and greater precision. Applying a plan requires separate authorization and backup.

## Scope and acceptance

No new provider, schedule, permissions or financial formula. No TEST migration application, live repair, commit, push or deployment. Verify delayed/amended NTA, pending interval boundaries, actual revisions, stale/concurrent retries, manual/precision protection, atomic rollback, snapshot invalidation and exact backup restore.

Maintained owners: [API](../api.md#kernel-estimate-anchor-api), [data model](../data-model.md#market-data-foundation), [time](../time-policy.md), [recovery](market-data-and-snapshot-recovery.md), [backup](../operations/backup-restore.md).
