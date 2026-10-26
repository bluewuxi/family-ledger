# Education Reserve and Shared Cashflow Specification

Status: maintained product contract. Education reserves and family cashflow navigation were delivered to TEST under #101 and #103. API DTOs are maintained in [API](../api.md), persistence in [data model](../data-model.md), and historical delivery/acceptance evidence in [deployment](../releases/test-release-history.md#education-reserve-and-shared-cashflow-release-2026-10-04). The [implementation plan](../plans/education-reserve-unification-plan.md) records the original implementation and one-time cutover; it is not a current release procedure.

## Product rules

- Education reserve is one logical, multi-currency family fund. It can represent several dedicated bank accounts without storing their names, identities, or individual balances.
- Dedicated education funds and their activity are excluded from daily spending and investment assets, returns, holdings, and reports. Each amount has one domain owner.
- Education records are manual. Bank imports and automatic recurring postings are out of scope. A copy action can simplify recording monthly living allowances after payment.
- The education screen answers: how much remains, how much has been spent, and what it was spent on.
- Shared queries may select daily activity, education activity, or both. Selecting both keeps domain summaries separate and never adds education to investment totals.

## UI

Use one 家庭收支 navigation entry with three tabs for daily transactions, education activity, and shared querying. Reuse filters, record tables, amount formatting, drawers, pagination, and empty/loading states.

- Education: show `剩余教育储备` and `累计教育支出` by currency, followed by records. Support manual opening balance, contribution, expense, refund, withdrawal, and currency exchange.
- Expense categories: tuition (`学费`), accommodation (`住宿费`), living allowance (`生活费`), and other (`其他`). Living allowances count as used education funds when transferred to the student; do not also count the student's downstream purchases.
- Daily: retain existing CSV/PDF import, classification, tags, and charts.
- Shared record/report view: the 收支查询 tab within 家庭收支 provides 收支范围 buttons for 全部, 日常, and 教育. Keep this distinct from transaction classification and expense category. Preserve each tab's filters in the URL and apply them to pagination and every summary/chart.
- Current balance and lifetime education spending remain clearly labeled. Date filters affect records and a separately labeled period spending summary, not the meaning of current balance.
- Mobile controls stack with 44px minimum tap targets. Tables remain horizontally scrollable.

Do not force both domains into an identical input form: education has a fund and currency, while daily imports have bank-source metadata.

## Calculation and reporting semantics

Compute authoritative results with exact decimal arithmetic in API/shared code:

`balance[currency] = opening + contributions + refunds - expenses - withdrawals - exchange out + exchange in`

`net education spending[currency] = expenses - refunds`

Show gross expenses and refunds in detail so the net figure remains explainable. Opening balances and contributions are not income; withdrawals and exchanges are not education spending.

Native-currency totals are primary. Converted balance display remains deferred. Any future authorized implementation must use existing FX data with its date and a reference-value label. Missing FX produces an unavailable converted total, never a partial total. Historical spending stays grouped by currency; historical converted spending is deferred.

Validate refund references against the same fund, currency, and category, and reject linked refunds exceeding the referenced expense. Standalone refunds are allowed for pre-cutover expenses and must be visibly identifiable; explain any resulting negative period net spending. Lock concurrent mutations before validating these constraints. Permit negative balances with a clear warning so delayed contribution entry does not prevent recording actual payments.

Cross-domain transfers are not consumption or investment loss. The current implementation records the education leg manually and uses the existing source-domain transfer/exclusion semantics for the source leg. It does not automatically create a matching source entry. Explicitly instruct the user to record the source leg when that source is tracked, and verify that it is excluded from spending/return calculations. Cross-domain transfer linking and reconciliation are deferred.

For a combined activity view, normalize DTOs with `domain`, `sourceId`, date, currency, amount, record kind, category, and notes. Use `(domain, sourceId)` as identity. Aggregate and paginate on the server with stable ordering. Keep separate domain totals; do not concatenate independently paginated results in the frontend. Do not mix daily ledger deposit/withdrawal rows with imported spending rows into one consumption total.

## Acceptance and validation

- Opening CNY 100,000, spending CNY 20,000, and refunding CNY 1,000 yields CNY 81,000 remaining and CNY 19,000 net used.
- Independent HKD contributions do not change CNY totals. Exchanges change both balances atomically and leave spending unchanged.
- Contribution/withdrawal rows never inflate daily income/consumption or investment gain/loss. Education expenses never appear in default daily reports.
- Purpose, date, currency, and category filters produce consistent rows, counts, charts, and period summaries; current balance and lifetime totals retain their explicit meanings.
- Viewer mutation attempts fail at the API. Concurrent stale edits fail without partial updates. Refund references and constraints remain valid under concurrent edits/deletes.
- Existing CSV imports, duplicate detection, undo, attachments, and daily classifications remain functional.
- Run focused education, spending, purpose-read-path, backup, and time-policy verification as applicable, followed by `corepack pnpm typecheck` and `corepack pnpm build`.
- Verify UI at 320x740, 393x852, 430x932, 768x1024, and desktop. For authenticated browser checks, offer verification and wait for the user to log in and confirm readiness as required by AGENTS.md.
