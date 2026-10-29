# Investment Overview Specification

This document consolidates the dashboard, holdings overview, and asset-snapshot changes agreed on 2026-10-08, with account-detail and navigation refinements agreed on 2026-10-12. API DTOs are documented in [api.md](../api.md), valuation semantics in [data-model.md](../data-model.md), and verification in [local-testing.md](../local-testing.md).

Status: maintained product contract. Dated implementation, deployment, and visual acceptance evidence is recorded in [TEST release history](../releases/test-release-history.md); outstanding acceptance is tracked in [roadmap](../roadmap.md).

## Portfolio Performance

- Headline `投资盈利` is current investment net assets, including pooled cash, minus cumulative manual net investment from the ledger's first recorded date. It includes closed-position losses/gains and current price effects. Recorded dividends, interest, fees, and taxes affect asset balances; neither these amounts nor price movement are added again.
- `占总资产 · 自投资以来` is cumulative investment profit divided by current investment net assets, multiplied by 100. It describes profit as a share of assets, not a time-weighted or money-weighted return. Missing inputs or non-positive assets make the ratio unavailable.
- Principal includes manual opening positions/balances, deposits, and withdrawals under the existing rules and exact transaction-date FX. Generated settlement cash does not constitute principal. Matched portfolio-internal transfers cancel in the aggregate.
- Dashboard and investment holdings share current/delayed quotes, five-minute caching, provider deadlines, and stored-price fallback. API calculations use Decimal; performance amounts and ratios are decimal strings or null. Missing principal FX invalidates performance but does not invalidate independently available market values. Missing valuation inputs prevent partial portfolio totals.
- Holdings headline performance always covers all investment accounts and ignores table filters. Filtered market value, cash, and count are marked `筛选结果`. Position/detail P&L labels use `未实现盈亏`; closed positions are not added to the table.
- Valuation status reports current/delayed quotes, stored-price fallback, missing inputs, actual price/FX date ranges, and acquisition times. Expected FundRock publication lag alone is not a failure. Historical snapshots and reports retain stored prices; account detail supports cached valuation followed by explicit quote refresh.

## Dashboard Composition and Trends

- Main cards are current valuation, investment profit with its asset-share ratio, `本日变动`, and cash. Daily trade count and account count are secondary statistics.
- Daily movement includes only instruments with quotes or estimated prices for the current app business day, on current quantities. Eligibility depends on data kind/date, not a market or fund exclusion list. Cash is excluded; older quotes, delayed published fund unit prices, and confirmed historical closes alone do not qualify. US/UK session dates map to the following app business date; older provider dates contribute no daily movement.
- Its percentage is `todayChange / totalAssets * 100`, using current total investment assets in the same reporting currency. The denominator includes cash and instruments excluded from the numerator, valued at their latest available prices. Never replace it with participating instruments, their preceding value, net investment, or a previous snapshot. Missing/non-positive total assets produce an unavailable percentage.
- The chart card has `期间盈利` and `资产趋势` tabs. Profit is selected initially and the default range is one year. Switching tabs preserves range and reuses fetched data.
- Period profit is the change in assets minus net investment from the selected period's first valid valuation. It starts at zero, excludes direct principal changes, reports the actual starting date when needed, and has no period return percentage. Headline lifetime profit is independent of this range.
- Asset view shows net assets and stepped `累计净投入`. The full historical curve retains all stored snapshot dates for every range. Missing valuations remain gaps. Current valuation is a distinct endpoint connected to its immediately preceding valid point in both chart tabs, including gain/loss color crossings. Retain real gaps and saved closes; do not render the endpoint as an isolated marker-only series or fabricate intermediate live prices.
- Permanent markers are hidden. Hover/touch shows a vertical cursor, marker, and tooltip for every valid dated point in either trend tab. Synthetic color-crossing points remain excluded from tooltips. Selection never changes calculations or the curve shape.
- Dashboard cards, distribution amounts, and monetary chart tooltips use rounded whole amounts. Percentages and transaction unit prices retain their existing precision; stored values and calculations are unchanged.
- Recent trades use a bounded panel matching the trend panel height, with internal scrolling and a persistent `更多...` link to the full transaction page. The panels stack on narrow screens.
- Existing positive/negative colors and principal styling are retained. The supplied reference informs curve rendering and interaction only.
- On wide screens, trend and latest ten trades occupy the left and right columns; the two distribution panels follow. At widths up to 1100px, these panels stack. Tabs and controls fit narrow layouts and have at least 44px tap height.

Changes to these daily-change calculation and chart contracts require an explicit user request. Keep this specification, [API semantics](../api.md#dashboard-read-api), and the focused `verify:dashboard` / `verify:portfolio-trend` checks aligned; commands are maintained in [local testing](../local-testing.md#validation).

## Account Detail

- Headline `投资收益` is the account's current total assets minus its cumulative net investment. Reuse dashboard principal events, transaction-date FX, missing-data rules, and the same valuation business date. Position rows retain their existing unrealized gain/loss calculation; account profit is not allocated to positions.
- The account trend panel uses the dashboard's `期间盈利` and `资产趋势` semantics and shared chart helpers. Default to period profit and one year; retain a valid saved range preference. Offer one month, three months, one year, three years, five years, and inception.
- Place `趋势范围` in the trend panel's upper-right corner. It controls only the chart; changing it must not reload the whole page, refresh market quotes, or alter headline metrics, holdings, or recent transactions. Range loading and errors stay inside the panel, with stale-response protection.
- The chart inherits the page's `报告币种`; do not add a separate chart currency selector or duplicate currency badge. Keep the current endpoint connected to its immediately preceding valid historical point, real missing-data gaps, gain/loss colors, and valuation/snapshot hover details. Internal color-crossing points have no axis label or tooltip; only the live endpoint may use `当前`.
- On desktop and tablet where space permits, align the page title and account context on the left and the reporting currency, refresh, and edit actions on the right. On phones, stack the header, use a full-width currency control, and place the two action buttons side by side with at least 44px tap height.
- Current holdings already include cash. Do not render a separate cash-balance table. Place recent transactions below holdings in a full-width panel; keep data tables horizontally scrollable on narrow screens.
- Remove the holdings table's `数据提示` column. Collect deduplicated holding, valuation, snapshot, and principal-FX warnings at the bottom, including negative positions/balances and relevant instrument, currency, date, and reason. Preserve estimated-price markers, price dates, and sources in the price column.

Shared navigation and responsive conventions follow [frontend guidelines](../frontend-guidelines.md), including the [shared back-navigation pattern](../frontend-guidelines.md#shared-back-navigation).

## Distributions

- `证券账户与现金` reports securities by investment account plus one pooled cash row. Cash account location is not a separate distribution.
- Both distribution panels use total investment net assets as denominator only when all values are available, non-negative, and the total is positive. Otherwise retain amount details and the explanation, hide pies and percentages, and do not renormalize surviving rows.

## Asset Snapshot Maintenance

- A read-only `资产快照` tab follows prices in data maintenance and loads only on entry. Dashboard has no snapshot list or dedicated list request.
- Viewer and admin can query investment snapshots by date and reporting currency, refresh, and paginate in descending date order with twenty rows per page. The default snapshot date range remains three months, independently of the dashboard's one-year default.
- Columns are snapshot date, net assets, change from the previous persisted snapshot, change percentage, and data status. Explain that net-value movement includes funding and is not investment profit.
- Optional snapshot API pagination/comparison parameters preserve legacy behavior when absent. Comparisons are keyed by snapshot ID and use the previous persisted snapshot in the same scope, including predecessors outside the page or date filter. Each snapshot uses its own saved FX. Missing values yield unavailable comparisons; non-positive predecessor assets yield an unavailable percentage.

The original implementation boundary is recorded with the [2026-10-08 release](../releases/test-release-history.md#total-assets-daily-ratio-and-connected-live-curves-2026-10-08-108); it does not authorize future schema changes or repairs.

## Acceptance Criteria

- Required example: investment 100, realized loss 20, and current unrealized gain 5 produce cumulative investment profit -15. Dashboard and holdings agree at the same inputs and quote time; date ranges and holdings filters do not change headline performance.
- Focused checks cover principal flows, opening imports, closed positions, income/costs, multi-currency FX, missing inputs, empty/negative assets, gaps, live endpoints, sparse hover selection, and snapshot comparison boundaries. Run typecheck, build, and the documented related verification scripts.
- Meaningful UI changes require [authenticated browser acceptance](../local-testing.md#authenticated-browser-acceptance), including all five viewports and the user-login handoff. Earlier acceptance applies only to the verified scope and version; report unperformed checks as pending or user-deferred.
