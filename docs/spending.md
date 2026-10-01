# Daily income and spending

The original CSV redesign is deployed to test. The 2026-10-01 suffix/cancellation enhancements are implemented locally; release and authenticated UI verification are pending. See [implementation plan](spending-import-plan.md).

## Scope and model

Support exactly CCB debit, CCB credit, and BNZ account CSV exports. PDFs are optional source attachments and are never parsed. Investment account flows remain separate. No balances, reconciliation, budgets, FX conversion or investment integration.

The three existing table names are retained with new shapes:

- `spending_accounts`: name, source format, currency, optional account/card suffix and active state. Format/currency/identity are immutable after an import batch or transaction exists.
- `account_statements`: an import/document batch, not a monthly statement. Stores source/version/hash, encoding, parser version, preview token, decisions, counts, observed transaction range and audit user/timestamps. States: draft, preview, committed, undone, document, cancelled.
- `statement_rows`: account, optional batch/record number, date, description, signed amount, classification, one tag, notes, immutable source metadata/fingerprint and edited flag. Manual transactions need no batch.

`20260926090000_redesign_spending_imports.sql` transactionally checks and replaces only empty spending tables. No existing spending-data migration/backfill is supported. The migration fails if any related table has records. It locks the old tables before checking emptiness and refreshes PostgREST schema metadata at commit.

## Character encodings and dates

Read bytes without altering the source file. Support UTF-8 with/without BOM, GB18030 (including common GBK/GB2312 exports), and UTF-16 LE/BE with/without BOM. BOM takes priority. Otherwise evaluate strict decoders and match known bank headers. Identical ASCII results prefer UTF-8. Different plausible interpretations require explicit encoding selection and a new preview. Invalid sequences, replacement characters, NULs and invalid CSV structure are rejected rather than repaired.

CCB dates are `YYYYMMDD`; BNZ dates are `DD/MM/YY`, explicitly interpreted as 2000–2099. `01/02/26` is 1 February 2026. Invalid calendar dates are rejected. Store transaction dates as `YYYY-MM-DD` without timezone conversion. Posting/processed dates and CCB transaction times remain source metadata. Reporting uses transaction date, not posting date or a statement month.

Fixed parsers handle preambles, blank lines, quoted commas/newlines/quotes, trimmed headers and CCB card apostrophe prefixes. Observed trailing CCB debit fields are preserved with a warning. BNZ lacks a currency column, so the preview calls out its configured account currency. Validate source currency and optional identity suffix for debit/BNZ accounts; CCB credit bills may contain multiple cards and do not enforce a single configured suffix.

Limits: 2 MiB CSV, 5,000 transaction records, 32,000 characters per CSV record and 4 MiB decoded preview. Oversized exports must be split by date. Display record numbers refer to parsed CSV records, including preamble/blank records, not physical lines inside quoted multiline fields.

## Classification and exact totals

Normalised amounts are incoming/credit positive and outgoing/charge negative. CCB debit uses income minus expense; CCB credit booked amounts are negated; BNZ Amount stays unchanged. A credit-card credit is a liability reduction and is not automatically income.

One classification controls reporting:

- `income` / 收入: positive amount, included in income.
- `spending` / 消费: negative amount, reported as positive gross spending.
- `refund` / 退款/返现: positive amount, reduces net spending in its transaction month.
- `excluded` / 转账/不计入: either sign, outside income/spending.
- `review` / 待确认: either sign, outside income/spending until reviewed.

Known CCB consumption and negative BNZ POS rows suggest spending. Explicit repayments/redemptions suggest excluded; clear interest/payroll descriptions suggest income; clear refunds suggest refund. Other movements remain review. These are suggestions and can be overridden in preview or later, individually or in bulk. No general tagging-rule editor.

Money is PostgreSQL `numeric(20,6)` and decimal strings in API/backup JSON. SQL aggregates the full filtered dataset separately by account currency. Totals are income, gross spending, refunds, net spending, record count and pending count. Tag proportions use gross spending including 未分类; negative net values are not pie slices. Frontend numeric conversions are only for chart geometry/percentage presentation. Missing months are not claims of zero spending or complete coverage.

## Import safety

Choose account → upload → preview → review all records/errors/duplicates → confirm. Preview never inserts transactions. Malformed rows block the whole import; correct and upload again. Valid rows may be explicitly skipped.

An account-scoped source hash prevents repeat committed files. Conservative fingerprints identify exact normalized source-record candidates while retaining bank metadata distinctions. This is candidate detection, not guaranteed matching of differently described bank exports. Possible overlapping rows default to skipped in the UI; explicitly keeping them records duplicate approval. Identical legitimate rows within a file remain separate.

A preview token binds decisions to server-parsed content and an exact S3 version. Commit locks the account, rechecks duplicate counts, and atomically inserts the selected rows and updates the batch. Concurrent changes require a new preview. Retrying the same committed token and decisions returns the prior result. Changed decisions on a committed token are rejected. Source metadata remains immutable after edits.

Undo removes only the selected batch's surviving transactions and preserves the batch/source files. It checks edited rows under the same lock; edited rows need explicit confirmation. Manual transactions and other batches are unaffected.

## Files, permissions and retention

All GETs require active viewer/admin; all writes require admin through Lambda. RLS and revoked direct writes provide defensive protection. Source files are private S3 objects with exact-version reads.

Signed uploads/read URLs last five minutes. Uploads bind length, content type and SHA-256 metadata; server verifies actual bytes. CSV and PDF uploads use `statements/pending/`, with seven-day current/noncurrent expiry and one-day abandoned multipart cleanup. Import previews expire after 24 hours. Expired batch metadata remains as audit history; its staged CSV will become unavailable after lifecycle expiry.

Confirmation copies the validated exact source version to a retained prefix. CSV copy precedes database commit; PDF copy precedes attachment linking. A storage failure does not create transactions or replace the old PDF. Confirmed copies, including unlinked replacements and copies left by a failed database commit, are deliberately retained; manual storage housekeeping must check database references before deletion. The API has no object-delete permission. DB backup contains metadata, not source bytes; retain S3 versions separately.

## Verification and release

`verify:spending`: synthetic bank layouts across encodings, strict decoding failures, CN/NZ dates, sign/classification rules, decimal validation, PDF validation, storage failures/version pinning and route authorization.

`verify:spending-db`: isolated local PostgreSQL migration, empty-table guard, exact aggregates, duplicate multiplicity, atomic failure/retry/concurrent imports, manual entries, bulk edits, undo isolation, RLS and backup restoration. Never loads personal files or writes test/production data.

Backup version 4 handles this schema and exports spending amounts as text. Older backups remain readable, but restoring any pre-v4 spending records is rejected; empty legacy spending tables need no conversion. Investment restore behavior stays intact.

Before release run typecheck/build, spending/database/time-policy/backup checks, then authenticated UI checks at the required phone/tablet/desktop sizes. Applying this migration is a breaking API/schema cutover: stop old spending writes, verify emptiness, apply migration, deploy compatible API/jobs/web and storage lifecycle together, and verify before allowing personal imports.
Account format/currency/identity can be corrected when only draft/preview batches exist. Corrections expire those batches and clear previews; start a new import afterwards. Transactions and completed/document history continue to lock these fields.

## Account suffixes, cancellation and pagination (2026-10-01)

Each imported transaction has nullable own/counterparty account suffixes, exactly four digits. Credit exports provide the own card per row, debit exports provide the own account in the preamble and the counterparty in 对方账号, and BNZ provides both party account columns. Missing debit own account information falls back to the configured suffix; other unknown values remain null. No internal-account pairing is inferred from suffixes. Positive amounts indicate incoming funds, negative outgoing, and zero has no inferred direction.

The structured metadata account columns are redacted to suffixes before persistence/API output; raw CSV/PDF sources remain private original files. Fingerprints retain the legacy algorithm using transient raw values before redaction. Literal description search and independent exact own/counterparty suffix filters affect rows, totals and charts together. Refund wording is 退款/返现; the stored refund classification value and calculations remain unchanged.

Pending or expired draft/preview batches can be cancelled by admins. Cancellation is idempotent and serializes with commit on account then batch locks; late preview/commit/attachment writes cannot revive a cancelled batch. Existing files remain readable; pending objects keep their existing lifecycle. History shows imported/total, skipped, rejected and surviving counts. Unparsed totals are unknown; undo preserves historical imported counts. Pagination displays current/total pages and exact record counts, including 0/0 for empty results.

The additive migration 20261001090000_spending_account_suffixes_and_cancellation.sql backfills known suffixes, sanitizes stored metadata/previews and invalidates pending approvals without changing fingerprints or edited flags. Version-4 backup restore also normalizes legacy suffix metadata and invalidates old pending approvals.

CCB debit counterparty_name is stored separately from 对方户名 and displayed in preview, transaction list and details. Its description joins 摘要 and 交易地点 using ·, omitting empty parts. CCB debit descriptions containing 一户通 or 补款转入 default to excluded; 信用卡卡号还款 defaults to excluded with tag 还款, and 售汇 to excluded with tag 购汇. If both tagged rules match, repayment takes precedence. CCB credit descriptions containing both CCB and Rebate (case-insensitive) default to refund for positive normalized amounts. These are preview suggestions that can be overridden, not permanent classification rules; negative amounts cannot be refunds. Existing edited descriptions are not rewritten by the migration.
