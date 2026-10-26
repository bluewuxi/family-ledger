# Education Reserve and Shared Cashflow UI Plan

Status: Implemented. Education reserves were deployed to TEST on 2026-10-04 under #101; family cashflow navigation and transaction UI refinements were deployed on 2026-10-06 under #103. Their recorded authenticated responsive checks passed. This is a historical implementation plan; cutover instructions and release authorization below applied to those releases only.

## Maintained product contract

Product rules, UI behavior, calculations, reporting semantics, and repeatable acceptance criteria are maintained in the [education reserve specification](../specs/education-reserve.md). The sections below preserve the original implementation and migration record.

## Database changes

Use an additive migration. Do not merge investment transactions or imported statement rows into a new generic transaction table.

### New `education_reserve_funds` table

One singleton logical fund for the existing family ledger, with UUID `id`, display `name`, a fixed singleton key with a unique/check constraint, and standard created/updated timestamps and actor IDs. No bank-account relationship or per-currency account rows are required.

### New `education_reserve_entries` table

| Column | Proposed definition |
| --- | --- |
| `id` | UUID primary key |
| `fund_id` | Required FK to the logical fund; restrict deletion |
| `entry_date` | PostgreSQL `date`; business record date |
| `entry_type` | Checked text: `opening_balance`, `contribution`, `expense`, `refund`, `withdrawal`, `exchange` |
| `currency` | Supported currency code with a constraint consistent with shared currency definitions |
| `amount` | Positive `numeric(20,6)`; the service determines its balance direction |
| `expense_category` | Checked text: `tuition`, `accommodation`, `living_allowance`, `other`; required for expenses/refunds, otherwise null |
| `related_expense_id` | Optional self-FK for refund attribution; restrict deletion of a referenced expense |
| `target_currency` | Required only for exchange; must differ from source currency |
| `target_amount` | Positive `numeric(20,6)`, required only for exchange |
| `notes` | Optional bounded text |
| `version` | Integer for optimistic concurrency on update/delete |
| audit fields | UTC `timestamptz` created/updated timestamps and actor IDs |

Store an exchange in a single row so both currency effects commit or revert together. Derive its effective rate from the two exact amounts; no separate rate is necessary.

Add indexes on `(fund_id, entry_date desc, id desc)` and `(fund_id, currency, entry_date)`. Add RLS and grants using existing viewer/admin conventions: authenticated reads defensively allowed, writes through the trusted Lambda/service role. API authorization remains authoritative.

Use a service-role-only mutation RPC if needed to lock the fund, check row versions, and commit mutations atomically. Arithmetic and domain decisions belong in the service/shared layer, not repositories. No persisted balance cache is needed initially.

### Existing tables

- Keep `spending_accounts`, `account_statements`, and `statement_rows` unchanged. Education activity does not enter the bank-import system.
- Keep existing `investment_accounts.purpose` values for compatibility. Do not drop `education` or historical snapshots during this slice.
- Existing education-purpose accounts become legacy read-only sources after cutover, excluded from daily/investment output. Block their mutation through all account/transaction/holding write routes after cutover, including purpose changes and linked settlement paths.
- Stop creating new education-purpose investment accounts after cutover; new education activity uses the logical fund only.
- Extend backup export, manifest, restore validation, and restore ordering for both new tables. At the time of this plan, the code used backup version 5; the education release introduced version 6, retaining supported legacy restore behavior. See [backup and restore](../operations/backup-restore.md) for the current format. Resolve self-FK restore ordering for refund references.

## Existing education data and cutover

1. Inspect existing education accounts, balances by currency, transaction types, holdings, and snapshot references. Repository inspection does not establish whether deployed data exists.
2. Take and verify a backup before any production/test data migration.
3. If no education data exists, initialize the empty logical fund and enable the new routes.
4. If legacy data exists, generate a reviewable migration mapping. Preserve dates, native amounts, and provenance. Add migration-only source references with uniqueness constraints if records are imported, so reruns cannot duplicate them.
5. Do not infer tuition or accommodation from generic withdrawals. Only confirmed expenses may become education expenses. Review holdings or non-cash transactions separately; do not silently turn their market value into cash.
6. Choose either detailed history migration or verified opening balances at a documented cutoff. Opening balances must not be combined with the same historical movements. If history cannot be classified, disclose that cumulative spending starts at cutover and retain legacy history for reference.
7. Reconcile native-currency closing balances and confirmed expense totals, then switch education reads/writes to the new fund. Never sum legacy education balances with the migrated fund.
8. Retain legacy rows and snapshots. Rollback requires reconciling any new entries before re-enabling legacy writes; do not blindly toggle back or delete new data.

## Implementation slices

1. Shared domain types, entry validators, exact balance/spending calculations, and focused verification cases.
2. Additive DB migration, constraints, grants/RLS, concurrency support, and version-6 backup/restore coverage.
3. Education repositories, services, and thin API routes for fund summary and filtered/paginated entries. GET supports viewer/admin; POST/PATCH/DELETE requires admin.
4. Education client and page with native-currency balances, spending summaries, manual form, edit/delete, and copy-existing-record action. Redirect `/education` to `/daily-expense?tab=education`, preserving supported filters.
5. Extract shared presentation components from daily spending without changing import behavior. Add shared purpose-filtered querying/reporting with separate domain totals. Preserve existing URLs and import deep links.
6. Implement legacy migration/cutover guards after inspecting actual data. Audit dashboard, holdings, account lists/details, transactions, monthly reports, exports, and snapshot readers for domain isolation; do not rely on UI filters.
7. Update data-model, API, local-testing, backup/deployment documentation and roadmap implementation status.

## Verified existing data and approved migration

On 2026-10-04, read-only test inspection confirmed three spending import accounts, no statement rows, and no import batches. The separate legacy daily account ledger has five cash records and remains intact. Education has one account and seven manual CNY deposit/withdrawal records.

The user approved mapping the single explicitly identified tuition payment to `expense/tuition`, the deposit to `contribution`, and every other withdrawal to `withdrawal`, including the conversion-looking withdrawal and the transfer to a family member. The original CNY amount is retained for tuition; an HKD amount mentioned in notes is not a second payment or a conversion instruction.

The private mapping and reviewed cutover SQL live under ignored `tmp/education-reserve/`, not in Git. The migration checks a verified backup, locks legacy account/transaction writes, compares protected rows again under the lock, preserves all seven source IDs/dates/notes/native amounts, and checks exact balance/spending parity before activation. Reruns never duplicate migrated entries.

The implementation keeps native totals primary, adds a purpose-filtered summary/table, and shares date/currency controls with daily spending. Currency conversion of display totals, historical converted spending, and automatic cross-domain transfer linking remain deferred. The user explicitly authorized commit, push, TEST deployment, and migration for that historical release; this record does not authorize new delivery or data operations.

## Family cashflow navigation update

The single 家庭收支 sidebar entry opens `/daily-expense`, with `tab=spending|education|report` (default: spending). Education and report content share the page heading; the former navigation dropdown is removed. `/cashflows` redirects to the report tab with supported filters. Tab filters are isolated and remembered only while the family cashflow page remains mounted. Current filters survive refresh through the URL. API contracts and financial calculations are unchanged.

UI refinement: filters use draft values and explicit 查询/重置 actions. Applied filters remain in URLs; tab changes discard drafts and restore applied conditions. Legacy `tab=accounts` retains valid date bounds only before redirecting to spending, because its account IDs belong to a different domain. Transaction filters, pagination, and sorting also use URLs. Date presets use the shared application business date. No financial schema or calculations changed. This revision was deployed to TEST under #103 on 2026-10-06; authenticated visual acceptance covered all five required viewport sizes. See the [release record](../releases/test-release-history.md#family-cashflow-and-transaction-ui-release-2026-10-06).
