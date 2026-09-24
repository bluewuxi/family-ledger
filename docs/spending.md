# Spending statements specification

## Purpose and scope

Track recorded spending from credit-card, debit-card, and bank statements. Statements are source documents, not balance-reconciliation records. Keep the three tables `spending_accounts`, `account_statements`, and `statement_rows`; no account-type distinction, budgets, balance fields, reported statement totals, reconciliation, CSV import, or PDF extraction.

Statements retain account, month (derived from statement date), statement/period dates, settlement currency, entry status, notes, and optional private PDF metadata. Uniqueness remains `(account_id, statement_date)`. Rows retain dates, description, original/settlement amounts, optional suffix, tag, notes, and descriptive transaction type.

Manual entry uses positive purchase amounts and negative refunds/cashback for both credit and debit statements. Translate the bank's debit/credit presentation to that convention when entering rows; the PDF is retained as the original source, and no automatic sign conversion or extraction occurs.

## Authoritative inclusion rule

Add `statement_rows.is_spending boolean NOT NULL`.

- On creation, an omitted flag defaults to `settlement_amount > 0`. Explicit true/false always wins.
- PATCH preserves the saved flag when omitted, even if the amount or transaction type changes. Null and non-boolean inputs are rejected.
- Refund/cashback rows default to false because they are negative. Enable them explicitly to deduct their signed amounts. A positive transfer or cash withdrawal can be excluded manually.
- Transaction type remains descriptive. Existing type/sign validation remains; `adjustment` can represent other positive, negative, or zero entries. Type never overrides the inclusion flag.
- Net spending is the exact signed sum of included rows, independently grouped by settlement currency. Do not convert currencies or apply special rules for transaction types.
- Summary fields: `included_positive` (included amounts > 0), `included_negative` (included amounts < 0), `net_spending` (all included amounts), `excluded_amount` (signed net of excluded rows), `count` (matching rows), and `spending_count` (included rows). All monetary values are decimal strings.
- Monthly and tag breakdowns apply the same flag rule across the entire filtered dataset, not just the visible page. Row counts refer to matched rows. Saved rows count immediately; entering statements remain visibly identified.
- Changing inclusion reopens a completed statement. Tag/notes-only edits do not.

## API

Keep existing `/spending` endpoints and standard authorization. Row create/PATCH accepts optional `is_spending`; every row response returns a boolean. `GET /spending/rows` accepts `isSpending=true|false`; omitted means all rows. Invalid values are validation errors. The flag filter combines with date, statement month, account, tag, suffix, type, currency, and keyword filters using AND.

Statement create/edit/read no longer supports opening/closing balances, charges/credits totals, or reconciliation. Reject removed input fields rather than silently accepting values that will not be stored. Existing PDF behavior remains unchanged.

## UI

Keep 日常收支 → 消费明细 and the existing manual entry drawers. Add a 计入消费 switch to row entry/edit/view and a visible yes/no column in the transaction table. New unsaved forms follow the sign of the entered settlement amount until the user manually sets the switch; after a manual choice, keep it through amount/type edits. Existing rows always start with the stored choice. 保存并继续 starts a fresh automatic choice for the next row.

Add 全部 / 计入消费 / 不计入消费 filtering, saved in URL query parameters. The default filter is 全部. Summary labels become 计入支出, 计入抵扣, 净消费, and 不计入消费（净额）. Explain that only switched-on rows affect spending and that included negative rows reduce it. Remove all balance inputs, balance columns, and reconciliation copy; statement lists show settlement currency instead.

## Persistence, rollout, and verification

The original spending migration is pending and is revised in place; no live migration or deployment is part of this change. Database insertion supplies the conditional flag default when omitted, preserves explicit values, and rejects null on updates. Supporting views/RPCs include the flag and use it for all totals. Existing investment tables and calculations are unaffected. Version-3 backups automatically include the flag with full row records; legacy version-2 restores still initialize spending tables empty.

Verify positive/zero/negative defaults, both explicit overrides, omitted-field PATCH preservation across sign/type changes, null/string rejection, inclusion-triggered reopening, and tag-only preservation. Verify excluded positive transfers, opt-in negative refunds, included adjustments, mixed currencies, month/tag/suffix/flag filters, and full totals across pagination in isolated PostgreSQL. Run typecheck, build, spending, database, backup, and time-policy checks. Authenticated browser verification remains deferred at the user's request; live migration/deployment remain separate.
