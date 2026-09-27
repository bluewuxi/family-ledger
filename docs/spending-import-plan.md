# Daily income and spending redesign plan

Status: deployed to test on 2026-09-27 (#91); user will perform UI acceptance testing.

This document records the implementation plan. `docs/spending.md` now specifies the new implementation; the test environment now runs this schema and implementation.

## Scope and release assumption

- Support exactly three CSV layouts: China Construction Bank debit-card transactions, China Construction Bank credit-card transactions, and BNZ account transactions.
- Automatically detect supported character encodings independently of bank layout.
- Retain original CSVs and optional PDF attachments in private S3. Never parse PDFs.
- Simplify daily income/spending entry, classification, imports, and monthly/tag charts.
- The user confirms all related spending tables are empty and will remain empty until this release. No data migration, backfill, or compatibility layer for existing spending records is required.
- Schema changes are still required. Use a new versioned schema migration for already-deployed environments; do not silently rewrite applied migration history. Verify affected tables are empty before destructive schema changes and stop if that assumption is false. Do not alter investment data.
- This plan does not authorize deployment or importing personal transactions into an environment.

## 1. Agree and define the simplified model

Use accounts, import batches, and transactions as the primary concepts. A monthly statement is no longer a prerequisite for importing.

- Account: name, supported source format, account currency, optional masked account/card identity, active state.
- Import batch: account, source filename and exact S3 version, content hash, detected encoding, parser version, import time/user, status, row counts and transaction date range. The observed date range is not proof that all dates were exported.
- Transaction: account, optional import batch, transaction date, description, signed account-currency amount, classification, one optional tag, and notes. Preserve source row identity and bank metadata for traceability and duplicate checks.
- Manual transactions remain possible without a fabricated CSV batch.
- PDFs attach optionally to import batches; allow a simple document-only batch when a PDF has no matching CSV. Do not require statement dates, balances, or reconciliation.
- Preserve posting date, source transaction type, source time, references, card identity and additional source fields as metadata rather than mandatory user inputs. Do not derive card identity from unrelated reference numbers.
- Remove statement month/date requirements, manual entry-completion status, original-currency/original-amount inputs, and the combination of descriptive transaction type plus `is_spending`.

Proposed classification: income, spending, refund, excluded transfer/other movement, and needs review. Use Chinese labels 收入、消费、退款、转账/不计入、待确认. One classification owns report inclusion; no competing switch.

Normalize amounts to incoming/credit positive and outgoing/charge negative: debit `income - expense`, BNZ Amount unchanged, CCB credit-card booked amount negated. Credit-card credits represent liability reductions, not automatically household income. UI can show direction plus absolute amount. Use PostgreSQL numeric and decimal-string DTOs throughout.

## 2. Implement encoding and format recognition

Supported encodings: UTF-8 with/without BOM, GB18030 (including common GBK/GB2312 exports), and UTF-16 LE/BE. “Unicode” refers here to commonly exported UTF-16, not an additional generic decoder.

1. Read original bytes; enforce file size limits before decoding.
2. Detect BOMs first. Validate decoded content even when a BOM is present.
3. Without a BOM, evaluate strict UTF-8 and GB18030 candidates; consider UTF-16 byte patterns and both byte orders where justified.
4. Match trimmed known bank headers and validate expected CSV layout and required fields. Successful decoding alone is not sufficient.
5. Treat equivalent ASCII decodings as UTF-8. If different plausible interpretations remain, require an encoding choice with preview.
6. Reject malformed text, unsupported layouts, and ambiguous dates/amounts with useful errors. Never silently insert replacement characters or skip invalid transaction rows.
7. Store the selected encoding and parser version; retain the original bytes unchanged.

Choose a decoding library/runtime with demonstrably strict support for these encodings; test malformed sequences rather than assuming decoder defaults are strict. Bank format must be recognised regardless of encoding.

## 3. Build three fixed CSV parsers

No general-purpose column-mapping screen.

| Source | Required handling |
| --- | --- |
| CCB debit | Skip account preamble; recognise the 11-column header; YYYYMMDD dates; separate income/expense fields; retain transaction time; preserve and flag the observed additional trailing fields on redemption rows. |
| CCB credit | Skip title/blank rows; trim headers/type values; YYYYMMDD transaction/posting dates; remove only the known card-number apostrophe prefix; normalise amount sign; read booked currency. |
| BNZ | Recognise 14-column header; explicit DD/MM/YY date policy with a bounded century rule and preview; preserve Payee/Particulars/Code/Reference separately; use configured account currency because the CSV has no currency column. |

Use a real CSV parser for quoted commas, embedded newlines, escaped quotes and line endings. Preserve identifiers as text and amounts as decimal strings. Validate source currency/account identity against the selected account where present. Preserve source calendar dates without viewer-timezone conversion; monthly reports use transaction dates.

Recognisable CCB consumption and BNZ POS transactions can receive spending suggestions. Explicit card repayments and investment redemptions should be excluded from household income/spending; redemption proceeds are not wholly income. Suggest income for clear interest/salary descriptions only with reviewed rules. Ambiguous transfers, cash movements, loan payments and unidentified credits remain needs review. Do not classify BNZ rows solely by transaction code. User overrides take precedence.

## 4. Add safe preview, commit, and undo APIs

- Flow: choose account → upload → recognise encoding/layout → preview validation, classification and duplicates → confirm import.
- Preview does not create posted transactions or affect charts. Show row errors and prevent commit until corrected or explicitly omitted with an explained count.
- Detect repeated source files by account and content hash. Detect overlapping exports using available bank references and normalised transaction fields; do not assume a reference or date/amount pair is globally unique.
- Preserve multiplicity: identical legitimate purchases must not disappear. Mark uncertain matches for review rather than silently deduplicating them.
- Commit the confirmed preview atomically, bind it to the source version and parser output, and make retries idempotent. Protect against concurrent duplicate imports.
- Record imported, skipped and rejected counts with source row numbers. Expire abandoned previews and clean up unattached uploads under a defined retention policy.
- Undo removes only transactions created by that batch, with a clear count and warning when those rows were subsequently edited. Retain an audit record; explicitly define whether source files are retained or deleted.
- Enforce viewer/admin permissions in Lambda. Keep API parsing, business rules, and persistence in their existing layers. Use private, short-lived signed file access and existing exact-version attachment protections.

## 5. Simplify the UI and add reporting

- Keep the existing investment/account-flow view separate from imported household spending; do not integrate imported rows into investment calculations.
- Provide transaction list, account management, import history/preview, and charts within 日常收支.
- Default transaction columns: date, account, description, amount/currency, classification and tag. Put source details and notes in the detail drawer.
- Support bulk classification and tagging, needs-review/untagged filters, date/account/currency/tag/search filters, and chart-to-transactions drill-down.
- Monthly totals: income, gross spending, refunds, and net spending. Pending/excluded rows do not enter these totals; show pending counts clearly. Refunds apply in their own transaction month initially.
- Tag ratio: gross spending only, including 未分类, with denominator stated. Show refunds and net spending separately; do not put negative tag totals into a pie chart.
- Keep settlement currencies separate; no FX conversion. Empty/no-import periods must not imply verified zero spending; mark the current partial month and avoid claims of complete coverage.
- Mobile: scrollable transaction tables, drawer-based navigation, readable Chinese labels and controls at least 44px high.

## 6. Implement persistence and supporting updates

1. Update shared enums, DTOs and validation first.
2. Add empty-table schema replacement/alteration SQL, constraints, indexes, aggregates and backup export changes.
3. Implement parsers/decoding, repositories, services, routes and file lifecycle.
4. Add frontend client, import flow, transaction editing and charts.
5. Update backup/restore schema handling to the new spending structure; historical backups with no spending records need no spending-data conversion. Verify investment restoration remains intact.
6. Replace the deployed spending specification when the implementation lands; update API, data model, local testing, deployment and roadmap documentation together.

Likely affected areas: `packages/shared`, spending API repositories/services/routes, web spending components/client, `supabase/migrations`, existing spending verification scripts, and backup/restore scripts.

## 7. Acceptance and release checks

- Create anonymised fixtures derived from the three layouts. Do not commit supplied personal bank files, account numbers, names or original transaction descriptions.
- Verify all three layouts across UTF-8, UTF-8 BOM, GB18030 and UTF-16 LE/BE; include BOM-less UTF-16, ASCII ambiguity, malformed bytes and unsupported headers.
- Verify preambles, blank lines, variable trailing columns, quoted fields, date/sign/currency rules and exact decimal handling.
- Verify classifications, refunds, investment redemptions, repayments, mixed currencies, tag denominators, full filtered totals and pending rows.
- Verify repeated files, overlapping exports, legitimate identical rows, concurrent/retried commits, failed atomic commits and undo isolation.
- Verify file access permissions, version-pinned attachments, upload limits and preview cleanup. PDFs are never parsed.
- Run `corepack pnpm typecheck`, `corepack pnpm build`, focused spending/database/time-policy checks, and backup/restore verification.
- Verify affected UI at 320x740, 393x852, 430x932, 768x1024 and desktop. For authenticated visual checks, follow the existing user-login handoff requirement.
- On a later delivery request, follow the project issue/commit/push/test-deployment workflow; apply schema changes before the new API/UI, verify the release, then permit personal-data imports.

## Out of scope

PDF extraction/OCR, arbitrary CSV mappings, other bank formats, budgets, a tagging-rule editor, automatic FX conversion, investment integration, balance reconciliation, and migration of old spending records.

