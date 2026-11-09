# UI Internationalization Foundation

Status: Phase 3 locally implemented. See [validation and acceptance evidence](../releases/2026-11-10-ui-internationalization-phase-3.md). Phase 2 locally implemented; Phase 2 local visual acceptance complete (authenticated shell/groups plus isolated auth/startup). See [Phase 2 evidence](../releases/2026-11-07-ui-internationalization-phase-2.md). Phase 1 foundation evidence: [validation and scoped acceptance evidence](../releases/2026-11-07-ui-internationalization-phase-1.md). This is a foundation contract, not whole-app bilingual support. The [approved design](2026-11-07-ui-internationalization-design.md) and [phased roadmap](../plans/2026-11-07-ui-internationalization-roadmap.md) own subsequent migration scope.

## Language and resources

Support `zh-CN` (default) and `en`, mapping display locales to `zh-CN` and `en-NZ`. No system detection. Persist validated choices under `family-ledger.uiLanguage` in browser-local storage, independently of login/logout or server preferences. Storage getter/read failures use Chinese; write failures retain the in-memory choice. No cross-tab synchronization.

Phase 1 forces Chinese except when Vite DEV is true and hostname is exactly `localhost`, `127.0.0.1`, or `[::1]`. Other builds ignore stored English without deleting it and reject English switches. This release gate is not authentication. Public switching remains withheld until Phase 5 readiness.

Bundle nested string resources in namespaces `common`, `format`, `preview`, `auth`, `navigation`, `errors`, `investmentGroups`, `investment`, `dashboard`, `holdings`, `monthlyReview`, `accounts`, `instruments`, `transactions`; use typed semantic camelCase keys, complete sentences, safe text interpolation and Chinese fallback. Raw-resource verification, independent of fallback, checks shape, symmetric semantic keys, non-empty strings, parameter sets and cardinal plural categories from `Intl.PluralRules`. Plural families require locale-specific suffixes; optional `_zero` has matching parameters. Context/ordinal variants are unsupported. Only plain `{{identifier}}` interpolation is supported in Phase 1 resources; formatted, unescaped, dotted-path and malformed tokens fail validation instead of being ignored.

`common.productName` is `金财屋` / `Family Ledger`. Self-language controls always read `中文` / `English`, without flags. Format sentences:

| Key | Parameters | Chinese | English |
| --- | --- | --- | --- |
| `format.localTimeNote` | value | `{{value}}（本地时间）` | `{{value}} (local time)` |
| `format.businessDayCountdown` | date, duration | `交易日 {{date}} 将于 {{duration}} 结束` | `Business day {{date}} ends in {{duration}}` |
| `format.hoursMinutes` | hours, minutes (zero-padded) | `{{hours}}小时 {{minutes}}分` | `{{hours}}h {{minutes}}m` |

## Financial glossary

The glossary identifies the metrics independently of individual resource namespaces. Scope and formulas follow [investment](investment-overview.md), [API](../api.md#dashboard-read-api), and [data model](../data-model.md#financial-values).

| Chinese label | English term | Metric identity | Definition and owner |
| --- | --- | --- | --- |
| 总资产 | Total assets | portfolio.totalAssets | Current scoped investment valuation including pooled cash; [API](../api.md#dashboard-read-api) |
| 资产净值 | Net assets | trend.netAssets | Valued investment assets on the trend date; [investment](investment-overview.md#dashboard-composition-and-trends) |
| 累计净投入 | Cumulative net investment | trend.cumulativeNetInvestment | Manual openings/deposits minus withdrawals at exact transaction-date FX; internal flows cancel; [investment](investment-overview.md#portfolio-performance) |
| 投资盈利 | Lifetime investment profit | portfolio.lifetimeInvestmentProfit | Current investment net assets minus all manual net investment, including closed-position effects; [investment](investment-overview.md#portfolio-performance) |
| 投资收益 | Account investment profit | account.investmentProfit | Account total assets minus account cumulative net investment, not allocated to positions; [investment](investment-overview.md#account-detail) |
| 期间盈利 | Period investment profit | trend.periodInvestmentProfit | Change in assets minus net investment from the first valid period point; no period return percentage; [investment](investment-overview.md#dashboard-composition-and-trends) |
| 未实现盈亏 | Unrealized gain/loss | position.unrealizedGainLoss | Non-cash holding valuation minus available carrying cost; [data model](../data-model.md#derived-holdings) |
| 最新变动 / 本日变动 | Latest change / Current business-day change | position.latestChange / portfolio.businessDayChange | Preserve context-specific wording; dashboard is eligible current-price movement at current quantities, excluding cash/FX flows; [API](../api.md#dashboard-read-api) |
| 可用现金 | Available cash | account.availableCash | Available native/reporting cash balances in the relevant account scope; [investment](investment-overview.md#account-detail) |
| 价格 | Price | position.price | Native-currency price with provider/exchange date; [data model](../data-model.md#market-data-foundation) |
| 数量 | Quantity | position.quantity | Ledger holding quantity, not a monetary amount; [data model](../data-model.md#financial-values) |
| 汇率 | Exchange rate | valuation.exchangeRate | Explicit currency-pair valuation conversion, independent of language; [data model](../data-model.md#market-data-foundation) |
| 估值日期 | Valuation date | valuation.date | Calendar date of valuation, distinct from acquisition instant; [time policy](../time-policy.md) |

## Formatting and callers

All public number helpers accept trailing `locale: DisplayLocale = "zh-CN"`. Preserve existing precision (price four, amount three, whole zero, percent one), signs, grouping, missing `--`, invalid text and observed negative zero. Percent inputs are percentage points; callers retain the suffix. Exact spending formatting remains its separate decimal-string algorithm and em-dash fallback.

`formatLocalDateTime(value, fallback = "-", timeZone?, language = "zh-CN")`, `formatLocalDateTimeNote(value, fallback, language = "zh-CN")`, `formatAppBusinessDayCountdown(now = new Date(), language = "zh-CN")`, and `formatHoursMinutes(totalMinutes, language = "zh-CN")` use explicit language. `formatCalendarDate(value, fallback = "-", language = "zh-CN")` retains valid ISO Chinese dates; English uses `DD Mon YYYY`; invalid text is preserved and null uses fallback. Never interpret a date-only value as a viewer-zone instant.

Pure helpers never read mutable global language. Migrated React callers subscribe with `useUiLanguage`, pass explicit locale/language and include it in memo dependencies. Keep currency codes explicit, parsing/sorting independent, and ratio versus percentage-point semantics intact. Chart axes retain the existing K/M thresholds, and whole-money chart tooltips retain Math.round semantics. Language does not change [Shanghai 06:00 or viewer timezone](../time-policy.md), calculations, permissions or server preferences.

## Coverage ledger

| Scope | Coverage |
| --- | --- |
| New `src/i18n` resources/provider/preview; moved time sentences; explicit formatting | Phase 1 only; raw resources and fixtures cover foundation, not untranslated pages |
| Login/recovery, shell, shared errors and complete business pilot | Phase 2, migrated as described below |
| Investment workflows and charts | Phase 3, migrated as described below |
| Other workflows | Phase 4, not started |
| Integrated acceptance and public switch | Phase 5, not started |
| Original artwork in `apps/web/public` | Preserve original brand lettering; not translated artwork |
| User/source content in existing workflows | Preserve entered names, notes, instrument/provider identifiers and quotations; surrounding application text migrates with its workflow |

Review changed preview/provider JSX, accessible labels and moved time sentences for application-owned hardcoded text. Explicit self-language labels are intentional. Do not apply a blanket CJK ban or exempt all Chinese strings. Startup failure copy and page-specific titles remain Phase 2. Storage-denied adapter fixtures do not certify existing auth/theme storage behavior.

## Phase 2 migrated coverage

Local preview includes login, administrator-contact recovery and its reset-route alias, self-service/forced password change, session/startup failure, shell navigation/branding/footer, route document titles, shared loading/empty/pagination/back-link/currency/drawer copy, and the investment-group maintenance pilot. Other page bodies, Settings administration/reset/extra-password controls, dashboard distributions, securities CRUD and financial workflows were subsequently migrated in Phase 3. Production remains Chinese with no language switch.

Error state stores typed semantic descriptors. Mapping uses client codes/statuses and additive shared parser reasons, never arbitrary error messages. Unknown group mutation outcomes instruct users to reload and check before retrying; no write is replayed. Shared parser messages, accepted inputs, HTTP contracts and original-revision writes are unchanged. Group 400 responses retain combined name/member guidance. Existing errors retranslate during render without requests.

Navigation uses stable English group IDs and typed label keys. The singleton owns html.lang and application-name metadata; the router owns route-specific document titles, with specific create/detail routes preceding parent routes and product-only fallback for unknown paths. Bootstrap failure owns its title outside the router.

Pilot delete/conflict-reload confirmations use a native modal dialog with reactive text, initial Cancel focus and return focus. The underlying drawer is inert, and its capture/focus handlers ignore the topmost confirmation. Dirty departure still uses native window.confirm translated at invocation; it blocks interaction, so live switching is not claimed. Browser-controlled beforeunload text remains an explicit exception.

Language changes preserve stable routes/queries, component keys, original revisions, drafts, selection, pending actions and open currency menus. The local language control is also available inside pilot overlays. Caller-supplied shared-control labels and source names remain owned by their workflows.

| Chinese | English | Resource owner |
| --- | --- | --- |
| 分组管理 | Group management | investmentGroups.groups |
| 配置成员数 | Configured members | investmentGroups.count (configured directory count, admin only) |
| 成员证券 | Member securities | investmentGroups.members |
| 未分组 | Ungrouped | investmentGroups.ungrouped |
| 重新加载并检查 | Reload and review | investmentGroups.reload |

## Phase 3 investment coverage

| Surface | Presentation and exceptions |
| --- | --- |
| Dashboard and account charts | Valuation status, ranges, carried dates, tooltips, gain and principal curves, recent trades, pooled cash and group distribution. Row codes identify pooled and ungrouped rows. |
| Holdings overview and detail | Filters, totals, price provenance, negative positions, missing cost, missing current or prior price and missing valuation FX. Provider and instrument names retain their source text. |
| Monthly review | Asset bridge, account contribution, transactions, cash adjustments and notes. Warnings cover carried boundaries, missing opening or closing snapshots, unavailable opening or closing values, missing opening prices and missing principal, adjustment or dividend FX. |
| Accounts and instruments | Directory, opening steps, account detail, trading password actions, security configuration and group entry. Account warnings retain instrument, currency, date and snapshot origin where supplied. Original opening-entry notes are ledger data. |
| Transactions | Filters, balances, exact input fields, generated cash legs, drawers and uncertain write guidance. Switching language preserves the original create payload and operation key. |

Market value uses available valuation inputs. Carrying cost comes from position history, and unrealized gain or loss compares current market value with carrying cost. Closed-position outcomes contribute to lifetime investment profit. Principal flows and valuation movement are separate parts of the monthly bridge. Cash settlement legs and estimated prices retain their existing financial meanings. See the [investment formulas](investment-overview.md) and [financial values contract](../data-model.md#financial-values).

Investment errors use optional allowlisted facts from the [API response contract](../api.md#response-contract). Unknown outcomes ask the user to check the ledger. Native confirmations use the language at invocation. Date and month inputs retain browser formatting and ISO values. Artwork, provider names, user notes and other stored labels retain their source text.
