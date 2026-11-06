# Kernel NTA same-date TEST repair — 2026-11-06

## Scope and authorization

Issue [#133](https://github.com/bluewuxi/family-ledger/issues/133). The user authorized implementation fingerprint `837a5765637d8e22`, migration, bounded data repair, issue/commit/push and configured automatic TEST delivery. A subsequent explicit authorization extended the financial window from October 1–November 4 to October 1–November 5, 36 dates. Production, schedules and manual deployment bypass are excluded. Original unrelated working documents remain preserved.

Kernel actual unit prices come from Kernel. Estimated Kernel prices use published NZX USF NTA; FundRock supplies separate Foundation Series instruments and is not the source of Kernel actual prices.

## Migration and data verification

- `20261106090000_kernel_nta_same_date.sql` applied under the shared deployment lock and ledger lock. Fresh exact format-14 backup, persisted checksum validation and restore-file preflight passed. All allowlisted business rows were unchanged apart from explicit legacy mapping metadata.
- Official source announcements and a fresh repeatable-read export matched the approved 36-date manifest. Nine immutable roots received version-2 same-date references. Root identities and revision precedence remain unchanged; old references remain audit-only.
- Sixteen estimates corrected, October 2 estimate retired with manual `6.7565670000` preserved, and November 5 estimate `6.7416154267` inserted. November 4 corrected to `6.6427338402`. Eighteen source-price audit records were appended.
- Price publication triggered normal gap-resolution metadata updates for Kernel November 4/5. The operator initially stopped because it classified these as unrelated. Before/after diagnosis confirmed the existing trigger effects only. Scope-preserving operator guards now verify those exact source/date/identity transitions, support invalidated-header resume and retain rejection of unrelated changes. Synthetic regressions and a focused fresh review covered the recovery fixes, including normalized state leases and immutable attempt identity.
- Resume performed zero additional price/reference changes. Thirty-six dates published in batches of 30+6; all ready account values, portfolio aggregates, saved FX, warnings and daily changes matched independent calculation. Twenty-nine dates are available and seven remain pending. Earlier snapshots, transactions, actual/manual prices, FX, accounts and access data were preserved.
- November 4 is available with the now-arrived separate fund inputs. At repair verification time, November 5 remained pending for the independent `FS_NASDAQ_100` FundRock instrument. No missing source value was fabricated.
- Kernel pending work cleared with the matching refresh token. Global repair CAS state remains for normal maintenance. Transactional price/reference replay returned `changed_count=0`; the verification probe rolled back. Format-15 pre/post backups passed persisted-file validation and restore preflight. Private exports/manifests/backups remain ignored under `.local/kernel-nta-same-date`.

## Validation

Lint, typecheck, build, reviewed core and focused Kernel/backup/availability/monthly/snapshot/time checks passed. Disposable checks covered guarded migration SQL, old-client rejection, mixed mapping versions, manual/precision protection, stale announcements, audit idempotency, revision/token conflicts, rollback, 30+5 synthetic publication/resume and full format-15 restoration of 33 tables across 59 migrations. Operator recovery adds synthetic target/date/attempt and invalidated-versus-published baseline regressions; the real repair used 30+6 dates.

## Delivery and acceptance

Migration registration passed for `9a3cbe4d1fb2e7699a155fc1d5b8b406b1a168d5`. [Automatic CI and TEST deployment](https://github.com/bluewuxi/family-ledger/actions/runs/42143724020) passed for that commit at 2026-11-06T01:29:55Z (14:29 NZDT). The deployment verified active/successful Lambda updates, API health, unauthenticated rejection, exact public runtime configuration, HTML and referenced entry assets. `last-success` independently matches this commit/run and artifact SHA-256 `708b8bd70ccc7f8f32c85cfe7fece1d86d2dadef150cf94777b6806c4cc5abcc`. No manual deployment was attempted. Visual acceptance is user-waived for this task, not passed. Real scheduled cloud backup acceptance is not claimed by the local file checks.

## Subsequent publication clarification

On November 6, the user confirmed that the November 5 FS_NASDAQ_100 unit-price date and value had been published at approximately 18:00 Pacific/Auckland (NZDT). The user identifies this next-day evening publication delay as normal. This is a user-reported publication observation, not an independently verified publication timestamp or evidence that the app has already imported the new value. It is separate from Kernel actual-price sourcing and the completed same-date NTA correction; it does not keep issue #133 open.

The deployed FundRock provider reads the Unit Prices HTML table at the public documents/reporting page, not a PDF. The configured TEST price batch runs Tuesday–Saturday at 06:10 Asia/Shanghai (11:10 NZDT; 10:10 NZST). No separate evening FundRock schedule was added. This documentation follow-up changes no source code, schedule, price data or snapshot publication.
