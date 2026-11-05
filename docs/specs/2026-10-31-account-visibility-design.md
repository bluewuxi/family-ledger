# Account Visibility Design

Status: Approved design; local implementation authorized on 2026-11-01 under the linked implementation plan. Live migrations and delivery remain unauthorized. The user confirmed the core product direction on 2026-10-31; this written proposal is not an implementation authorization or a replacement for maintained contracts. Implementation status and verification evidence are recorded in [the implementation plan](../plans/2026-11-01-account-visibility.md).

## Intent and decision

Allow a family member to see only explicitly permitted accounts. Unauthorized accounts and their amounts must be absent from structured responses, navigation, detail views, and aggregates. Every calculated total represents only the visible account set. Source counterparty fields, free text, and shared monthly reviews are explicit user-approved disclosure exceptions; they may mention otherwise hidden accounts or amounts. This is useful for actual family privacy needs; ordinary display filtering is insufficient.

Keep the small-family product simple. Separate operation permissions (role) from data scope (visible accounts), without teams, ownership, invitations, custom roles, or a permission matrix.

### Approaches

- Display filters only: inexpensive and useful for reducing clutter, but do not protect data or aggregates. Rejected for the confirmed privacy requirement.
- Role plus an account allowlist: selected with the user. Preserves existing roles and account models while enforcing consistent scope across domains.
- General permission framework with configurable operations and role hierarchies: unnecessary for the current family size. Deferred in favor of a specific future super-administrator extension.

This is a cross-layer change of moderate-to-large scope. Most effort is in complete read-path coverage and correct scoped financial results, not the settings form. It requires no new service or always-on backend.

## Confirmed current-release scope

| Area | Decision |
| --- | --- |
| Roles | Retain only `admin` and `viewer`. |
| Administrator | Always has all-account scope and manages ledger data, users, and authorization. No editable administrator account restriction this release. |
| Viewer | Has either `all` or `selected` account scope; selected scope may be empty. Ledger mutations remain prohibited. |
| All-account scope | Includes existing and future accounts automatically. |
| Selected scope | Includes only granted resources. New accounts require an explicit grant. |
| History | A grant exposes all history of that resource. Current grants determine both current and historical results; no date-limited grants. |
| Education | The existing logical multi-currency reserve is one grantable resource, not separate bank accounts or currencies. |
| Unauthorized resource | Omit from lists; direct account or child-resource access returns a consistent not-found response without confirming existence. |
| Empty scope | Show `暂无可访问账户`; return empty scoped results without family totals or counts. |

Existing authentication, active-role checks, temporary-password session restrictions, and viewer exceptions remain in force. Access scope never grants an operation forbidden by role. Account trading-password reveal requires both account access and the existing extra-password gate.

## Resource model and authorization boundary

Grantable resources map to the existing investment/daily-purpose ledger accounts, spending bank accounts, and the singleton education reserve. Do not merge these business models or introduce user ownership. Resource identity includes its domain and stable ID; an equal ID in another domain must not match. Legacy education account/history paths must resolve to the education reserve authorization boundary and cannot become an alternate route around it.

Store a user's scope mode and selected grants independently from role, linked to stable `app_users` identities. Use Postgres for these application authorization records; do not move the core ledger into DynamoDB. Preserve referential integrity for each supported domain. Exact table names and whether typed grant relations share a parent policy row are implementation choices, not a generic resource registry requirement.

Use a central server-side operation policy and scope resolver. Account operations require both an allowed operation and membership in the effective account scope. Current administrators resolve to all-account scope centrally; individual handlers must not scatter administrator bypasses. Global operations have explicit policies rather than pretending to belong to an account.

Distinguish management of users/grants from management of ledger data internally, although `admin` permits both this release. No arbitrary capability editor is introduced.

Load authoritative access for each protected request, with no cross-request permission cache. Missing or invalid viewer policy must fail closed, never imply all-account access. A policy read failure returns a sanitized service error rather than empty or unrestricted success. Existing already-authorized in-flight work may finish after concurrent revocation, consistent with Auth; subsequent authorization checks use the new scope. Previously viewed or downloaded data cannot be recalled.

Save a complete scope configuration atomically with a revision check against stale edits. Record the actor, time, target, and scope change without recording secrets. Reject invalid resource references and unauthorized scope updates. Retain existing self-access modification restrictions.

## Scoped financial and query behavior

Apply the authorization scope before aggregation, pagination, counts, valuation input selection, and user-requested filters. User filters can narrow scope, never expand it. Keep existing purpose/domain restrictions: visibility of education or daily spending does not add either to investment assets.

- Dashboard, holdings, balances, allocation denominators, principal, profit, ratios, monthly summaries, and transaction counts use visible investment accounts only. The holdings headline remains independent of table filters but is bounded by authorization scope.
- Compute historical results from visible account snapshot rows with their existing saved FX and financial formulas. Do not reuse all-family aggregate values. Current scope applies across the entire history, so changing grants can change the displayed historical curve.
- Compare snapshots and derive trends within the same authorized scope, including predecessor queries outside the current page/date range. Preserve existing missing-data and gap semantics. Hidden accounts cannot contribute warnings, incompleteness, or account-specific metadata to visible results.
- A transfer with only one visible leg is an inflow/outflow at that scope boundary under existing principal or spending classification rules, not an invented investment gain/loss. Do not expose unauthorized counterpart account records or links; source counterparty fields follow the approved exception below. Transfers within the visible investment set retain existing cancellation semantics.
- Spending rows, import histories, filter options, tags, suffix options, summaries, and pagination share the same spending-account scope. Education and combined cashflow queries apply the corresponding grants before aggregation and keep domain totals separate.
- Use ordinary metric labels without global account-scope reminders. Empty authorized datasets use neutral page-specific empty states. Calculated views must never show hidden-account counts, a family grand total, a hidden remainder, or a percentage using hidden amounts as its denominator. Shared authored review text is the explicit disclosure exception, not an input to these totals.

Background valuation, ingestion, and backup jobs remain trusted full-ledger work. Do not generate separate persisted snapshots per user. Scope shared read results before disclosure; quote reference caches may remain shared where they carry no private account context. Any cached private result must be isolated by effective scope/revision or recomputed, never keyed only by date/currency.

## Approved disclosure coverage and first-release safeguards

These policies were reviewed by the user on 2026-11-01; they describe future behavior, not existing implementation.

| Surface | Approved treatment |
| --- | --- |
| Direct child IDs | Resolve the owning account before disclosing transactions, holdings, import batches, education entries, or associated metadata. |
| Raw spending CSV/PDF | Administrator-only download and signed-URL issuance in the first release, including for all-account viewers; parsed authorized records remain readable. Originals may contain other account information. |
| Spending counterparties | Retain counterparty names, account suffixes, and related filters. Derive options and results only from authorized source records. The user states there will be no transfers between ordinary and sensitive accounts and explicitly declines hiding these fields. This does not authorize reading counterpart account records; no account-matching infrastructure is added. |
| Shared monthly review text | Retain shared narrative/status for viewers, including selected-scope viewers. Do not split or redact it. This explicit exception permits authored content to mention hidden accounts or family amounts; calculated monthly summaries remain scoped. |
| Maintenance and diagnostics | Selected-scope viewers receive only proven account-independent status or safely scoped data. Global diagnostics, snapshot notes, and details that cannot be safely scoped are denied or omitted. Existing admin-only endpoints remain admin-only. |
| Instruments and market data | Public reference facts may remain shared; account links, private notes, transaction-derived metadata, and usage/count information require scoping or omission. Audit these DTOs during implementation. |
| Browser state | Clear private cached state on user change and detected scope revision; invalidate removed detail views and reload affected summaries. Do not promise instantaneous removal from an already rendered screen without a subsequent request. |

Do not issue new source-file URLs to viewers after the new policy takes effect. Previously issued signed URLs remain usable until their existing expiry; previously downloaded files remain outside revocation control. Rollout verification must account for that expiry window.

The system will not infer and redact arbitrary account references embedded in user-authored notes or imported free text. Such text belongs to the visible source record and can mention other accounts. The confirmed structured-data isolation guarantee does not imply semantic text redaction. The user accepted this limitation. Operator guidance must explain that source descriptions, notes, and shared reviews can mention other accounts or amounts, and advise authors to avoid sensitive content there.

## Settings experience

Extend existing user management with `全部账户` and `指定账户`. Group selection by ledger accounts, daily spending accounts, and education reserve; preserve domain distinctions even when names coincide. Explain that all-account scope includes future accounts and that selected scope does not. Show administrator scope as fixed all-account access.

Allow an empty selection with an explicit explanation. Save the complete configuration in one operation, report stale-edit conflicts, and show success only after server confirmation. Account access controls do not imply editing rights. Follow existing Simplified Chinese labels, accessibility, and mobile guidelines; final layout is left to implementation.

## Future extension: super administrator

The user explicitly approved this future boundary, but it is not part of this release:

- A super administrator manages users and authorization and has full account visibility.
- An ordinary administrator manages ledger data only within authorized accounts; the same `all`/`selected` scope model bounds both reads and writes.
- Viewers retain scoped read access and documented exceptions.
- Ordinary administrators cannot change their own grants or grant access to others. User management and authorization move exclusively to super administrators.

Reserve this extension through central operation policy, independent account scope, and account checks shared by reads and writes. Do not add the new role, restricted-admin UI, or speculative permission tables now.

Before that future release, explicitly decide account creation and initial grants, shared instrument/reference-data writes, global maintenance and gate administration, role transitions, and administrator recovery. Existing administrators must not all be silently promoted to super administrators. Explicitly designate super administrators and confirm each ordinary administrator's scope in a separately reviewed migration.

## Adoption, backup, and contract changes

Before implementing, enumerate every private read endpoint and nested DTO and map it to an account scope or explicit global policy. This includes bootstrap/session responses if extended, old education history, snapshot comparisons, monthly reviews, raw-source URLs, filter options, and maintenance surfaces. No list-only partial rollout is acceptable.

Approved defaults: newly provisioned viewers start with an empty selected scope; administrators use all-account scope. Confirm an explicit initial policy for every existing viewer before rollout. Do not silently preserve global visibility through a missing-policy fallback. In this release, an admin-to-viewer change defaults to all-account scope, explicitly persisted with the role change. Before saving, the UI must explain that the user retains visibility of all existing and future accounts but loses ledger editing rights; allow choosing a narrower scope. This is not a missing-policy fallback. New viewers still default to empty selected scope. Revisit demotion when restricted administrators are introduced so demotion does not silently broaden their scope.

Back up scope policies and grants with stable identities and referential integrity. Restoring an older backup without scope records must not grant viewers all-account access; require reviewed mappings or leave them with empty selected scope. Preserve credential/session backup exclusions. Migration application, data initialization, restoration, deployment, and live-user edits require their separate authorization.

Maintained sources to update only when implementation is separately authorized:

- [Auth](../auth.md): role plus scope enforcement, global exceptions, source downloads, lifecycle behavior.
- [Architecture](../architecture.md), [API](../api.md), and [data model](../data-model.md): scope context, DTOs, persistence, aggregate and cache boundaries.
- [Investment overview](investment-overview.md), [spending](spending.md), and [education reserve](education-reserve.md): scoped results and historical behavior.
- [Backup and restore](../operations/backup-restore.md), [local testing](../local-testing.md), and [roadmap](../roadmap.md): compatible restoration, verification, and actual implementation status.

Current maintained contracts remain authoritative for the running application; their shared-ledger behavior is intentionally not rewritten by this proposal.

## Acceptance criteria for a future implementation

1. With fixtures A and B but access only to A, account lists, details, child-ID lookups, counts, calculated summaries, and errors exclude B's identity and amounts, subject to the approved counterparty and authored-content exceptions. Counterparty options and results derive only from A's records. Guessed B IDs behave as not found.
2. Dashboard, holdings, snapshots, trends, comparisons, and monthly reports agree with an independently calculated A-only fixture, including principal transfers, closed positions, missing values, and all supported currencies. Broken data in B does not invalidate A.
3. Daily spending and combined cashflow results obey the granted domain/account sets before pagination; education is entirely present or absent, including legacy paths.
4. Empty selected scope returns no account records or calculated account data; shared monthly reviews remain readable under the explicit exception. New resources appear automatically only for all-account scope. Same IDs in different domains never cross-authorize.
5. Revocation affects the next authorization check without requiring logout. Cross-user and old-revision caches cannot disclose prior scope results. Stale concurrent saves are rejected.
6. Viewers cannot edit ledger data or grants. Administrators retain current management rights and full scope. Trading-password reveal still requires its separate gate and cannot reveal hidden-account passwords.
7. Raw source access, shared narrative, diagnostics, backup compatibility, role changes, and free-text limitations match the reviewed policies above.
8. Focused authorization and financial fixtures, required typecheck/build, and relevant existing verification scripts pass. Authenticated visual acceptance follows [the real-login and five-viewport procedure](../local-testing.md#authenticated-browser-acceptance); these checks are not performed as part of this design-only task.

## Review and authorization status

The user confirmed the core direction on 2026-10-31 and the reviewed policy details on 2026-11-01. Account records and calculated aggregates remain scoped, with explicit exceptions for source counterparty information, free text, and shared monthly reviews. Current administrators see all accounts; future super administrators alone manage users/grants, and ordinary administrators manage only authorized ledger data.

The user retained counterparties and shared monthly reviews, chose all-account visibility with a UI warning when an administrator becomes a viewer, and accepted all other reviewed recommendations. The reference to item eight was interpreted by its explicit subject (administrator demotion), listed as item seven in the review; conservative backup restoration remains unchanged.

An earlier independent builder review recommended hiding counterparties because imports cannot reliably map them to ledger accounts. The user's explicit decision to retain these fields under the no-transfer assumption supersedes that recommendation.

Exact schema, endpoint names, UI layout, and verification script organization remain builder choices. The later implementation request authorizes local code changes and validation under the implementation plan. It does not authorize live migration application, commit, push, or deployment. Historical design-only checks do not establish live-environment validation.
