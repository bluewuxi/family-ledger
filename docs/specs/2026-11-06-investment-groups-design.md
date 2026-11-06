# Custom Investment Groups: Current Allocation

Status: Approved by the user on 2026-11-06, including the purpose-keyed revision amendment. Implementation planning is authorized; product implementation and delivery have not started and are not authorized by this approval alone.

Date: 2026-11-06.

Implementation plan: [Custom investment groups](../plans/2026-11-06-investment-groups.md).

## Intent and confirmed scope

Help family members understand allocation across products that represent the same index or a personally meaningful investment category. For example, QQQM, 159501, and Foundation Nasdaq-100 PIE may be assigned to one group. Names such as `美股科技` and `A股科技` are also valid. Membership is an administrator's classification, not a system-certified equivalence of investment risk, currency exposure, fees, or index tracking.

Confirmed decisions:

- Reuse current investment holding valuation, then aggregate by user-defined group.
- Each non-cash instrument belongs to zero or one group, across all its accounts.
- Ungrouped instruments remain individual allocation rows; cash remains one pooled row.
- Preserve instrument-level allocation alongside group allocation.
- Replace the existing distribution heading/control with `证券分布` and `分组分布` tabs, using the dashboard's `期间盈利` / `资产趋势` interaction and styling conventions.
- Show `管理分组` only within the group tab, at its bottom right. The explanatory text sits at the bottom left in the same footer row, vertically aligned with the button.
- Keep the maintenance entry under `投资标的` with `证券列表` / `分组管理`; the dashboard action is a shortcut to that maintenance view.
- Support group creation, rename, membership changes, and deletion with the behaviors below.
- Defer grouped historical valuation curves. Do not change daily snapshot generation, storage, eligibility, repair, or schedules.
- Use a generic `resource_revisions` table keyed by business purpose. This feature introduces only the `investment_groups` purpose; existing revision/state mechanisms are not migrated. Evaluate suitable migrations as a separate future TODO.

The latest interactive mockup uses synthetic values and illustrates only these flows. It is not implementation, authenticated acceptance, or evidence of live data correctness.

## Contract owners and implementation evidence

Follow [root instructions](../../AGENTS.md), [project workflow](../project-workflow.md), [architecture](../architecture.md), [investment overview](investment-overview.md), [API](../api.md), [data model](../data-model.md), [Auth](../auth.md), [frontend guidelines](../frontend-guidelines.md), [time policy](../time-policy.md), [local testing](../local-testing.md), and [backup and restore](../operations/backup-restore.md).

Relevant local instructions: [API](../../apps/api/AGENTS.md), [web](../../apps/web/AGENTS.md), [shared](../../packages/shared/AGENTS.md), [database](../../supabase/AGENTS.md), and, for future backup changes, [jobs](../../apps/jobs/AGENTS.md) and [scripts](../../scripts/AGENTS.md).

Existing implementation anchors:

- [Portfolio valuation](../../apps/api/src/services/portfolioValuationService.ts) calculates current valued holdings and groups non-cash holdings by instrument ID, pooling cash.
- [Dashboard service](../../apps/api/src/services/dashboardService.ts) supplies the investment scope and current valuation inputs.
- [Distribution presentation](../../apps/web/src/components/DistributionPanel.tsx) suppresses pies and percentages for incomplete, negative, or non-positive-total distributions.
- [Snapshot repository](../../apps/api/src/repositories/portfolioSnapshotRepository.ts) reads daily headers and account-level totals. Snapshots do not store per-instrument valuation detail.

This proposal does not replace maintained contracts until implementation is separately authorized and those contracts are updated.

## Approaches considered

| Approach | Benefit | Cost and decision |
| --- | --- | --- |
| Reuse current valuation and add mutually exclusive groups | Small scope; preserves valuation and snapshots; directly answers current allocation | Selected by the user; no historical group chart |
| Reconstruct grouped history from transactions, prices, and FX | Can retain existing snapshot storage | Deferred: requires historical availability, performance, and classification-time semantics |
| Add instrument-level daily valuation detail | Supports persisted historical group aggregation | Deferred: expands snapshot writer, repair, migration, and backup scope |

For classification, overlapping tags were considered but rejected for this version: they can double-count assets and cannot directly form one allocation pie. Mutually exclusive membership preserves a partition of the same portfolio.

For concurrency metadata, a dedicated singleton group-state table and a shared purpose-keyed revision table were compared. The user selected `resource_revisions` to avoid accumulating single-purpose revision-only tables. Each purpose has its own row and revision; sharing storage does not create one global lock or counter. Migrating existing mechanisms is outside this feature.

## Functional boundaries

Included: shared group definitions; admin-only maintenance; current group amounts and allocation percentages; existing reporting currencies; account-scoped reads; explicit missing-data states; backup compatibility.

Excluded: historical group charts, effective-dated membership, historical regrouping, benchmark or constituent look-through, automatic index detection, preset mappings, nested groups, overlapping tags, weighted membership, target allocations, rebalancing advice, group profit/return calculations, combined quantities/unit prices/average costs, and changes to holdings tables, account charts, monthly reports, or the separate `证券账户与现金` panel.

No new market provider, scheduled job, always-on service, RBAC model, or separate user-owned portfolios are introduced. Grouping does not change instrument identity, currency, price configuration, activity, transactions, settlement, or cost basis.

## User experience

### Dashboard

1. Default to `证券分布` on a fresh dashboard mount. Preserve the selected tab while refreshing data or changing reporting currency, and when returning from group management. No new persisted user preference is required in v1 (design recommendation).
2. Both tabs use the same valuation response, reporting currency, valuation time, total assets, and warning context. Switching tabs alone performs no quote refresh and does not reload the page.
3. Instrument distribution retains existing values and membership. Group distribution replaces member instrument rows with one group row and leaves ungrouped instruments and pooled cash visible.
4. Use stable, namespaced row IDs for colors and keys. Rename must not change row identity. Sort available non-cash rows by descending value, then name/ID for ties; preserve existing placement conventions for cash and unavailable rows.
5. A group row shows its name, current market value, percentage when valid, and a compact list/count of contributing instruments. Counts are distinct instruments, not account positions. Names/counts come only from authorized current holdings; do not reveal membership inferred from hidden accounts.
6. Hide groups with no contributing current positions, while retaining them in admin maintenance. A contributing position with zero market value is not the same as no position and remains represented. With no groups configured, group distribution contains the same instrument/cash values as instrument distribution.
7. Footer text: `占比以全部投资净资产为分母，含现金。` The admin-only `管理分组` button shares this row, right aligned. On narrow widths, text wraps inside the left column; the button stays in the right column, vertically centered. Do not create a separate lower action row or horizontal overflow.
8. Viewers can use both tabs but see no management action. Loading, empty, incomplete, and failure states remain explicit. An unavailable group configuration must not silently appear as an empty configuration or a successful ungrouped result; retain the usable instrument tab and show a retryable group error.

### Group maintenance

- `投资标的` exposes `证券列表` and admin-only `分组管理`. The instrument list may display the classification beside each instrument; admin classification links lead to maintenance. Viewer instrument listing remains read-only and does not gain a global membership-directory endpoint.
- The maintenance list includes group name and configured member count, including instruments without current holdings. Select `编辑` or `新建分组` to edit name and members in a contextual editor using existing drawer/accessibility conventions. The prototype's side panel demonstrates the editing fields, not a requirement to create a new panel framework.
- Names are trimmed, nonblank, and at most 32 Unicode code points. A stored normalized key (trimmed and lowercased) is unique; the API and database must use one canonical normalization implementation. Internal spaces and punctuation remain meaningful. This is a technical recommendation, not index validation.
- All existing non-cash instruments, including inactive instruments, may be classified. Inactive status does not remove existing holdings or membership. Cash cannot be selected. If a future instrument edit would change a classified instrument to cash, reject it until membership is removed; never retain a cash membership.
- Each member selector shows the current group. Selecting a member from another group visibly states that saving moves it; the old membership is replaced atomically. Unchecking an existing member makes it ungrouped unless reassigned in the same operation.
- Creating an empty group is valid. Deleting a group requires confirmation that members become ungrouped; it deletes only classification records, not instruments or financial records.
- Save name and membership together. Disable duplicate submission while pending. On validation, conflict, or dependency failure, preserve edits and show the error. Never report success or navigate away before the write succeeds. Protect meaningful unsaved changes on cancel, navigation, and drawer dismissal.
- After saving, invalidate classification-dependent reads. Returning to the dashboard restores `分组分布` when management was entered there, and shows the saved mapping. Reuse valid quote inputs rather than forcing new market requests.

## Calculation and availability

The authoritative API pipeline is:

1. Apply authenticated account scope and investment-purpose filtering.
2. Derive current non-zero positions from transactions through the existing business-date cutoff.
3. Value them once through the existing quote-cache/stored-price and FX rules.
4. Produce existing instrument allocation rows, then aggregate those same monetary rows into group rows. Use a single consistent classification read for the response.

For group G, `marketValue(G) = sum(marketValue(instrument))` over its contributing instrument allocation rows. Use Decimal, preserve existing monetary string boundaries, and sum the existing two-decimal instrument amounts without display-whole-number rounding. This deliberately reuses the existing allocation basis; it does not refactor valuation precision. Existing rounding differences between portfolio totals and component sums may remain; never silently force percentages to sum to 100 by adjusting rows.

`percentage(G) = marketValue(G) / totalInvestmentNetAssets * 100`. The denominator includes cash and is identical in both tabs. Report percentages only when the distribution is valid. Preserve existing whole-amount UI formatting and percentage precision.

- Any unavailable member instrument amount makes its group amount null, not a partial total. Other valid amounts remain visible.
- Incomplete portfolio valuation, non-positive total assets, or any negative instrument-level allocation amount suppress the grouped pie and all grouped percentages. Also reject a negative grouped row. Checking the source instrument distribution prevents positive members from hiding an existing negative source row.
- Preserve existing instrument-distribution behavior; do not introduce a new account-position-level negative rule that changes the original tab.
- Missing cost basis alone does not invalidate independently available market values. No group gain fields are introduced.
- No missing classification is treated as missing valuation: an intentionally ungrouped instrument remains independently valued. A classification read failure is different and must be exposed.
- No group amount is added to original instrument amounts in total assets. Both tabs are alternative partitions, not additive datasets.

## Proposed persistence model

The `resource_revisions` name and `investment_groups` purpose are user-confirmed; other names below are proposed technical choices. Use Postgres through the API; no frontend direct writes. Keep classification separate from `instruments` so ordinary group edits do not invoke instrument valuation/snapshot side effects.

### `investment_groups`

| Field | Type / constraint | Purpose |
| --- | --- | --- |
| `id` | UUID primary key | Stable group identity |
| `name` | text, nonblank, max 32 code points | Display name |
| `name_key` | text, unique | Canonical name uniqueness |
| `created_by_user_id`, `updated_by_user_id` | UUID references to app users | Audit identity, not ownership |
| `created_at`, `updated_at` | timestamptz | Audit instants |

### `investment_group_members`

| Field | Type / constraint | Purpose |
| --- | --- | --- |
| `instrument_id` | UUID primary key, FK to instruments | Enforces at most one group per instrument |
| `group_id` | UUID nonnull FK to investment_groups | Assigned group |

Add an index on `group_id`. Group deletion cascades only to membership rows. Deleting a deletable instrument removes its membership; existing instrument-in-use deletion protections remain. Enforce the non-cash rule at the database boundary as well as in API validation, including instrument type changes.

### `resource_revisions`

| Field | Type / constraint | Purpose |
| --- | --- | --- |
| `scope_key` | text primary key, nonblank | Stable, code-defined business purpose |
| `revision` | bigint not null, default 0, check >= 0 | Monotonic version within that purpose |

This feature creates exactly one purpose row: `scope_key = 'investment_groups'`, initially revision zero. The table supports multiple purposes but is not constrained to one row. Do not add placeholder `ledger`, repair, or permission rows in this release. Financial ledger revisions remain independent in their existing structures.

All classification writes select the fixed `investment_groups` row for update, compare the caller's expected revision, validate, mutate group/membership data, increment that revision, and return the new revision in one database transaction. Return revisions as decimal strings. Concurrent edits reject stale submissions rather than silently moving members based on outdated forms. A failed transaction rolls back both the business mutation and version increment.

Purpose keys are owned by server code and migrations, not arbitrary client input. Group endpoints accept an expected revision, not a selectable scope key. A missing required purpose row fails closed as a configuration/dependency error; never bypass the guard or silently create/reset a revision during a write. Reusable internal revision helpers may centralize locking/comparison, but they do not authorize generic client-facing revision writes and cannot separate the version check from the business transaction. Use row-level locking for the specific purpose, not table-wide locking or a shared all-purpose counter.

Keep this table limited to version coordination. Do not add generic JSON business state, repair dates, lease ownership, or authorization policies. A later operation requiring several purpose rows must define a consistent lock order and all required version checks in its own design.

No monetary amounts, prices, holdings, snapshots, user ownership, or historical membership are stored in these tables. Created/updated actor/time records provide basic audit metadata; a full change-history browser is out of scope.

### Side effects and lifecycle

- Initialize the group tables empty and insert the `investment_groups` purpose at revision zero. Do not reset an existing purpose row on a migration retry. Do not infer or seed mappings from instrument names or the synthetic prototype.
- Group writes must not update financial inputs, `snapshot_repair_state`, pending snapshot dates, or existing snapshots, and must not request market data. Do not attach generic financial-revision/snapshot-invalidation triggers to classification tables.
- Instrument deletion/type-change integration must keep membership invariants and invalidate classification revision when membership changes. Serialize these paths with classification writes and use a consistent lock order; exact RPC organization is left to implementation planning.
- Enable RLS and retain existing server-only business-table access. Public/direct client mutation remains denied.

## Proposed API and consistency

The paths are design recommendations; stable contract documentation is updated only during authorized implementation.

| Operation | Access | Behavior |
| --- | --- | --- |
| `GET /investment-groups` | Admin | Configuration revision, groups, configured instrument IDs |
| `POST /investment-groups` | Admin | Name, member IDs, expected revision; create atomically |
| `PUT /investment-groups/:id` | Admin | Name, complete member ID list, expected revision; rename/reassign atomically |
| `DELETE /investment-groups/:id` | Admin | Expected revision; delete and ungroup atomically |
| `GET /dashboard` | Existing viewer/admin rules | Preserve existing fields and add scoped group distribution |

Use existing auth/session and sanitized error conventions. Reject invalid names, unknown/duplicate/cash member IDs and malformed revisions without partial writes. Unknown groups return not found. A stale revision returns a specific conflict response and prompts reload/review; do not replay writes automatically. Mutations return the saved group/configuration revision; exact envelope follows existing APIs.

Additive dashboard response concept:

```typescript
interface GroupAllocationRow {
  id: string; // group:<uuid>, instrument:<uuid>, or cash
  allocationType: 'group' | 'instrument' | 'cash';
  name: string;
  groupId: string | null;
  instrumentId: string | null;
  marketValue: string | null;
  percentageOfTotal: string | null;
  members: Array<{ instrumentId: string; shortName: string }>;
}

interface GroupDistribution {
  status: 'ready' | 'unavailable';
  revision: string | null;
  rows: GroupAllocationRow[];
  canShowPercentages: boolean;
  reason: 'missing_valuation' | 'negative_value' | 'non_positive_total'
    | 'classification_unavailable' | null;
}
```

Use `dashboard.groupDistribution` alongside existing `holdingAllocations`. For individual rows, members contains that contributing instrument; cash has no members. Group member details contain only instruments contributing authorized positions. Do not send the admin configuration, audit metadata, hidden-account values, or full configured member counts to viewers. Empty account scope returns no holdings-derived groups or member names.

Read revision, groups, and membership in one consistent database read. The financial valuation and classification need not form one database transaction because classification is presentation metadata, but the response must not mix two classification revisions. An explicit unavailable status lets the original dashboard remain usable if the new classification dependency fails.

Follow existing private-read invalidation and stale-response suppression on logout, role/account scope change, and successful writes. No new private response cache or global permission cache. A subsequent fresh dashboard request reads current classification; client tab switching reuses its already-returned response.

## Migration and backup boundary

A future additive migration creates these structures and constrained write/read helpers. It does not alter daily snapshot schema or writer logic and does not modify existing instrument/transaction data. Schema preparation is not permission to apply it to TEST, which contains real family data.

Classification is durable ledger configuration and must be included in the allowlisted backup exporter, bundle validation, and restore dependencies, including `resource_revisions` with exact decimal-string revisions. Allocate the next backup format version at implementation time rather than assuming the current version is unchanged. Validate original-format checksums before normalizing older supported backups to no groups, no memberships, and the `investment_groups` purpose at revision zero. Current-format backups must contain valid unique non-cash memberships and exactly one revision row for the only supported purpose, `investment_groups`; reject missing, duplicate, unknown-purpose, negative, or malformed revision records. Adding purposes later requires explicit backup validation/compatibility updates, not silently accepting unknown rows. Restore users/instruments and groups before memberships; restore configuration revision consistently. Old readers must reject incompatible new formats. A restore into a live system must force clients to reload configuration rather than accept pre-restore edit tokens.

No historical valuation backfill or snapshot repair is required by this feature. Applying migrations, live initialization beyond empty schema, backup/restore operations, commit, push, and deployment remain separately authorized.

## Future TODO: evaluate existing revision mechanisms

These items are follow-up analysis and migration candidates, not requirements for delivering investment groups. They do not authorize code changes, schema application, or live migration.

- [ ] Evaluate migrating `ledger_write_state` to a future `resource_revisions` purpose such as `ledger`. It is the closest revision-only singleton candidate. Inventory every trigger, reader, transaction writer, snapshot publisher, lock order, retry path, backup/restore dependency, and revision serialization contract first. Preserve the existing revision and financial isolation semantics; define cutover/rollback and prove that old and new writers cannot use independent guards during transition. Proceed only if the maintenance benefit justifies the regression risk.
- [ ] Inventory other pure revision-only coordination needs and migrate only those whose scope, lifecycle, and authorization fit the purpose-keyed model. Keep each purpose independent; no global shared revision.
- [ ] Assess business-state mechanisms separately rather than treating them as automatic candidates. `snapshot_repair_state` also owns repair progress; `kernel_nta_refresh_state` owns per-instrument refresh/repair state; `account_access_policies.revision` and `user_roles.access_revision` belong to per-user authorization records. Default to retaining these structures unless a separate design demonstrates a concrete benefit without weakening atomicity, foreign-key integrity, or permissions. Expiring acquisition leases are not ordinary configuration revisions.

Any adopted migration requires its own scoped design, compatibility and backup review, focused concurrency/regression checks, and separate operator authorization. No existing mechanism is moved, renamed, redirected, or removed by this feature.

## Acceptance criteria

### Valuation and scope

Use synthetic isolated fixtures with converted CNY amounts: QQQM account A 10,000 and account B 20,000; 159501 15,000; Foundation Nasdaq-100 PIE 25,000; VOO 20,000; ungrouped gold instrument 10,000; cash 10,000. Total is 110,000.

- Instrument view shows QQQM 30,000, the other four individual securities, and pooled cash.
- With the first three instruments assigned to `纳斯达克100`, group view shows 70,000 for that group, 20,000 for VOO or its assigned group, gold 10,000, and cash 10,000. The group's percentage is 63.64% before any existing display formatting.
- Switching tabs leaves total assets, valuation time, original instrument amounts, headline profit, daily movement, and quotes unchanged.
- Moving VOO into the first group makes it 90,000 and removes the now-empty old group from distribution, without changing the 110,000 total.
- Missing one member price/FX produces a null group amount and no pie/percentages, never a 45,000 or other surviving subtotal presented as complete.
- A negative source instrument amount remains disqualifying even when the group's net value is positive. Zero/negative totals, missing cost-only inputs, no positions, and zero-valued positions follow the defined distinctions.
- Test all three reporting currencies through existing FX conversion, fractional amounts/rounding, cross-account aggregation, and inactive held instruments.
- Selected-scope and empty-scope viewer tests prove hidden values, member names, configured member counts, and groups with no visible positions do not leak.

### Maintenance and persistence

- Blank, overlength, and normalized duplicate names fail; empty groups succeed.
- Each instrument has at most one membership, including concurrent changes. Cash and unknown IDs fail; an instrument-to-cash edit cannot violate the invariant.
- Save/rename/move/delete are atomic; stale revision rejects without partial modification. Failure keeps the user's draft and requires explicit retry/review.
- The feature introduces only the `investment_groups` purpose. All group mutations guard that exact row; missing-row and stale-revision cases fail without writes, and transaction failure rolls back the increment. Client input cannot select or create another purpose. Migration retries preserve the existing revision.
- Group deletion only ungroups its members. New installs and normalized older backups preserve all instruments as individually displayed until configured.
- Viewers cannot read the admin configuration or mutate groups, including direct API calls; auth restrictions and safe errors remain enforced.
- Backup round-trip retains names/membership and validates malformed, duplicate, orphan and cash membership cases. Legacy-format normalization does not change original checksum validation.
- Group-only writes leave prices, transactions, monetary values, financial revision/repair state and existing snapshot rows unchanged and cause no provider calls.
- Existing ledger, repair, Kernel, and permission revision paths remain on their current structures. Backup checks include exact revision round-trip, the required purpose, unknown/duplicate purposes, malformed revisions, and legacy normalization.

### Interaction and layout

- `证券分布` / `分组分布` follow the dashboard trend-tab pattern. Switching has no extra quote request; report currency remains shared.
- `管理分组` appears only for admins in group distribution. It shares the footer row with the left explanation and is aligned right without an extra row.
- Both maintenance entry paths work. Save and return restore the group view and current classification. Unsaved-edit dismissal, failure, conflict, cancellation, and deletion confirmation behave as specified.
- Empty/loading/error states are understandable. Keyboard navigation, focus entry/return, labeled controls, touch targets, long names, and left-text wrapping work in both themes.
- Future authenticated acceptance must cover all five viewports and the real-user login/readiness procedure in [local testing](../local-testing.md#authenticated-browser-acceptance). The conversational mockup is not that acceptance.

## Validation and delivery status

This design-only task uses semantic, consistency, link, and diff checks. No product source or migration is written, no live data is read or changed, and no application build or browser acceptance is claimed.

Design review on 2026-11-06: an independent builder check of the initial dedicated-state-table proposal found no material unanswered question preventing implementation planning. The subsequent user-confirmed revision replaces that proposal with purpose-keyed `resource_revisions`, only adds `investment_groups`, and defers all existing-mechanism migrations to TODOs; the earlier independent review does not cover this amendment. Local checks verify linked file targets, document whitespace, and the scoped documentation diff. The standalone prototype's isolated interaction checks cover grouping totals, member transfer, rename, name validation, unsaved changes, creation/deletion, and management-action visibility. Footer markup places the explanation and action in one shared flex row; this is not an authenticated browser layout check.

Future implementation requires the project lint, typecheck, build, affected dashboard/holdings/authorization/backup checks, and focused isolated tests for membership and aggregation. Existing snapshot checks should establish non-regression without shared-environment writes. Update maintained investment/API/data-model/auth/backup contracts and roadmap only for the implemented scope.

Execution update (2026-11-06): local implementation and migration source are prepared under the implementation plan; automated validation and independent review passed. TEST schema was subsequently applied under the separately authorized [schema-first procedure](../releases/2026-11-06-investment-groups-test-schema.md), removing the dependency blocker. Registration and application deployment remain pending. Dual-theme, five-viewport read-only administrator/drawer/viewer acceptance is complete; [acceptance evidence](../releases/2026-11-06-investment-groups-local-acceptance.md) records the user-confirmed dirty-draft check and excluded shared write scenarios. The preceding design-phase evidence does not establish implementation acceptance.

## Designer choices included in the approved design

The following details were filled in by the designer rather than individually selected by the user: default instrument tab with session-local restoration; 32-code-point name limit and normalized uniqueness; separate membership storage; additive dashboard DTO and admin-only configuration endpoints; scoped contributor names/counts; contextual editor using existing drawer conventions; and versioned backup integration. The generic revision table, its single initial purpose, and deferral of existing-mechanism migration were explicitly confirmed by the user. These choices implement the confirmed interaction without changing investment calculations or historical scope.

Implementation planning may choose exact module boundaries, RPC names, route-state mechanics, and test placement. It may not change confirmed membership, cash, valuation, permission, footer, or historical-feature boundaries without an explicit decision.
