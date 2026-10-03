# Education Reserve and Shared Cashflow UI Plan

Status: deployed to test on 2026-10-04 under issue #101. Database cutover, backup restoration checks, and authenticated responsive acceptance passed.

## Product rules

- Education reserve is one logical, multi-currency family fund. It can represent several dedicated bank accounts without storing their names, identities, or individual balances.
- Dedicated education funds and their activity are excluded from daily spending and investment assets, returns, holdings, and reports. Each amount has one domain owner.
- Education records are manual. Bank imports and automatic recurring postings are out of scope. A copy action can simplify recording monthly living allowances after payment.
- The education screen answers: how much remains, how much has been spent, and what it was spent on.
- Shared queries may select daily activity, education activity, or both. Selecting both keeps domain summaries separate and never adds education to investment totals.

## UI

Keep the existing daily and education navigation entries for direct access to their different priorities. Use a shared cashflow workspace and reusable filters, record tables, amount formatting, drawers, pagination, and empty/loading states.

- Education: show `剩余教育储备` and `累计教育支出` by currency, followed by records. Support manual opening balance, contribution, expense, refund, withdrawal, and currency exchange.
- Expense categories: tuition (`学费`), accommodation (`住宿费`), living allowance (`生活费`), and other (`其他`). Living allowances count as used education funds when transferred to the student; do not also count the student's downstream purchases.
- Daily: retain existing CSV/PDF import, classification, tags, and charts.
- Shared record/report view: `资金用途` filter with `日常收支`, `教育储备`, and `全部`. Keep this distinct from transaction classification and expense category. Preserve filters in the URL and apply them to pagination and every summary/chart.
- Current balance and lifetime education spending remain clearly labeled. Date filters affect records and a separately labeled period spending summary, not the meaning of current balance.
- Mobile controls stack with 44px minimum tap targets. Tables remain horizontally scrollable.

Do not force both domains into an identical input form: education has a fund and currency, while daily imports have bank-source metadata.

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
- Extend backup export, manifest, restore validation, and restore ordering for both new tables. The current code uses backup version 5; the next schema version should be 6, retaining supported legacy restore behavior. Resolve self-FK restore ordering for refund references.

## Calculation and reporting semantics

Compute authoritative results with exact decimal arithmetic in API/shared code:

`balance[currency] = opening + contributions + refunds - expenses - withdrawals - exchange out + exchange in`

`net education spending[currency] = expenses - refunds`

Show gross expenses and refunds in detail so the net figure remains explainable. Opening balances and contributions are not income; withdrawals and exchanges are not education spending.

Native-currency totals are primary. An optional converted current balance may use existing FX data with its date and a reference-value label. Missing FX produces an unavailable converted total, never a partial total. Historical spending stays grouped by currency in the first release; historical converted spending is deferred.

Validate refund references against the same fund, currency, and category, and reject linked refunds exceeding the referenced expense. Standalone refunds are allowed for pre-cutover expenses and must be visibly identifiable; explain any resulting negative period net spending. Lock concurrent mutations before validating these constraints. Permit negative balances with a clear warning so delayed contribution entry does not prevent recording actual payments.

Cross-domain transfers are not consumption or investment loss. The first slice records the education leg manually and uses the existing source-domain transfer/exclusion semantics for the source leg. It does not automatically create a matching source entry. Explicitly instruct the user to record the source leg when that source is tracked, and verify that it is excluded from spending/return calculations. Cross-domain transfer linking and reconciliation are deferred.

For a combined activity view, normalize DTOs with `domain`, `sourceId`, date, currency, amount, record kind, category, and notes. Use `(domain, sourceId)` as identity. Aggregate and paginate on the server with stable ordering. Keep separate domain totals; do not concatenate independently paginated results in the frontend. Do not mix daily ledger deposit/withdrawal rows with imported spending rows into one consumption total.

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
4. Education client and page with native-currency balances, spending summaries, manual form, edit/delete, and copy-existing-record action. Preserve `/education`.
5. Extract shared presentation components from daily spending without changing import behavior. Add shared purpose-filtered querying/reporting with separate domain totals. Preserve existing URLs and import deep links.
6. Implement legacy migration/cutover guards after inspecting actual data. Audit dashboard, holdings, account lists/details, transactions, monthly reports, exports, and snapshot readers for domain isolation; do not rely on UI filters.
7. Update data-model, API, local-testing, backup/deployment documentation and roadmap implementation status.

## Acceptance and validation

- Opening CNY 100,000, spending CNY 20,000, and refunding CNY 1,000 yields CNY 81,000 remaining and CNY 19,000 net used.
- Independent HKD contributions do not change CNY totals. Exchanges change both balances atomically and leave spending unchanged.
- Contribution/withdrawal rows never inflate daily income/consumption or investment gain/loss. Education expenses never appear in default daily reports.
- Purpose, date, currency, and category filters produce consistent rows, counts, charts, and period summaries; current balance and lifetime totals retain their explicit meanings.
- Viewer mutation attempts fail at the API. Concurrent stale edits fail without partial updates. Refund references and constraints remain valid under concurrent edits/deletes.
- Existing CSV imports, duplicate detection, undo, attachments, and daily classifications remain functional.
- Migration reruns do not duplicate data; migrated balances reconcile; backup version 6 restores exactly, with legacy-version compatibility verified.
- Run focused education, spending, purpose-read-path, backup, and time-policy verification as applicable, followed by `corepack pnpm typecheck` and `corepack pnpm build`.
- Verify UI at 320x740, 393x852, 430x932, 768x1024, and desktop. For authenticated browser checks, offer verification and wait for the user to log in and confirm readiness as required by AGENTS.md.

## Verified existing data and approved migration

On 2026-10-04, read-only test inspection confirmed three spending import accounts, no statement rows, and no import batches. The separate legacy daily account ledger has five cash records and remains intact. Education has one account and seven manual CNY deposit/withdrawal records.

The user approved mapping the single explicitly identified tuition payment to `expense/tuition`, the deposit to `contribution`, and every other withdrawal to `withdrawal`, including the conversion-looking withdrawal and the transfer to a family member. The original CNY amount is retained for tuition; an HKD amount mentioned in notes is not a second payment or a conversion instruction.

The private mapping and reviewed cutover SQL live under ignored `tmp/education-reserve/`, not in Git. The migration checks a verified backup, locks legacy account/transaction writes, compares protected rows again under the lock, preserves all seven source IDs/dates/notes/native amounts, and checks exact balance/spending parity before activation. Reruns never duplicate migrated entries.

The implementation keeps native totals primary, adds a purpose-filtered summary/table, and shares date/currency controls with daily spending. Currency conversion of display totals, historical converted spending, and automatic cross-domain transfer linking remain deferred. The user has explicitly authorized commit, push, test deployment, and migration.
