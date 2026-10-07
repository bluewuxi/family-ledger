# Investment Overview Specification

This document consolidates the dashboard, holdings overview, and asset-snapshot changes agreed on 2026-10-08. API DTOs are documented in [api.md](api.md), valuation semantics in [data-model.md](data-model.md), and verification in [local-testing.md](local-testing.md).

## Portfolio Performance

- Headline `投资盈利` is current investment net assets, including pooled cash, minus cumulative manual net investment from the ledger's first recorded date. It includes closed-position losses/gains and current price effects. Recorded dividends, interest, fees, and taxes affect asset balances; neither these amounts nor price movement are added again.
- `占总资产 · 自投资以来` is cumulative investment profit divided by current investment net assets, multiplied by 100. It describes profit as a share of assets, not a time-weighted or money-weighted return. Missing inputs or non-positive assets make the ratio unavailable.
- Principal includes manual opening positions/balances, deposits, and withdrawals under the existing rules and exact transaction-date FX. Generated settlement cash does not constitute principal. Matched portfolio-internal transfers cancel in the aggregate.
- Dashboard and investment holdings share current/delayed quotes, five-minute caching, provider deadlines, and stored-price fallback. API calculations use Decimal; performance amounts and ratios are decimal strings or null. Missing principal FX invalidates performance but does not invalidate independently available market values. Missing valuation inputs prevent partial portfolio totals.
- Holdings headline performance always covers all investment accounts and ignores table filters. Filtered market value, cash, and count are marked `筛选结果`. Position/detail P&L labels use `未实现盈亏`; closed positions are not added to the table.
- Valuation status reports current/delayed quotes, stored-price fallback, missing inputs, actual price/FX date ranges, and acquisition times. Expected FundRock publication lag alone is not a failure. Historical snapshots and detail/report paths retain stored prices.

## Dashboard Composition and Trends

- Main cards are current valuation, investment profit with its asset-share ratio, `本日变动`, and cash. Daily trade count and account count are secondary statistics. Daily movement includes only instruments with current-business-day quotes or estimated prices, on current quantities. Cash is excluded; lagged fund prices and historical closes alone do not qualify. US/UK session dates map to the following app business date. Older provider dates contribute no daily movement, and the percentage uses only participating instruments' preceding value.
- The chart card has `期间盈利` and `资产趋势` tabs. Profit is selected initially and the default range is one year. Switching tabs preserves range and reuses fetched data.
- Period profit is the change in assets minus net investment from the selected period's first valid valuation. It starts at zero, excludes direct principal changes, reports the actual starting date when needed, and has no period return percentage. Headline lifetime profit is independent of this range.
- Asset view shows net assets and stepped `累计净投入`. The full historical curve retains all stored snapshot dates for every range. Missing valuations remain gaps. Current valuation is a separate endpoint; no intermediate live prices are fabricated.
- Permanent markers are hidden. Hover/touch shows a vertical cursor, marker, and tooltip for every valid dated point in either trend tab. Synthetic color-crossing points remain excluded from tooltips. Selection never changes calculations or the curve shape.
- Dashboard cards, distribution amounts, and monetary chart tooltips use rounded whole amounts. Percentages and transaction unit prices retain their existing precision; stored values and calculations are unchanged.
- Recent trades use a bounded panel matching the trend panel height, with internal scrolling and a persistent `更多...` link to the full transaction page. The panels stack on narrow screens.
- Existing positive/negative colors and principal styling are retained. The supplied reference informs curve rendering and interaction only.
- On wide screens, trend and latest ten trades occupy the left and right columns; the two distribution panels follow. At widths up to 1100px, these panels stack. Tabs and controls fit narrow layouts and have at least 44px tap height.

## Distributions

- `证券账户与现金` reports securities by investment account plus one pooled cash row. Cash account location is not a separate distribution.
- Both distribution panels use total investment net assets as denominator only when all values are available, non-negative, and the total is positive. Otherwise retain amount details and the explanation, hide pies and percentages, and do not renormalize surviving rows.

## Asset Snapshot Maintenance

- A read-only `资产快照` tab follows prices in data maintenance and loads only on entry. Dashboard has no snapshot list or dedicated list request.
- Viewer and admin can query investment snapshots by date and reporting currency, refresh, and paginate in descending date order with twenty rows per page. The default snapshot date range remains three months, independently of the dashboard's one-year default.
- Columns are snapshot date, net assets, change from the previous persisted snapshot, change percentage, and data status. Explain that net-value movement includes funding and is not investment profit.
- Optional snapshot API pagination/comparison parameters preserve legacy behavior when absent. Comparisons are keyed by snapshot ID and use the previous persisted snapshot in the same scope, including predecessors outside the page or date filter. Each snapshot uses its own saved FX. Missing values yield unavailable comparisons; non-positive predecessor assets yield an unavailable percentage.
- This release adds no database tables, migrations, historical rebuild, snapshot editing, or repair controls.

## Acceptance and Release

- Required example: investment 100, realized loss 20, and current unrealized gain 5 produce cumulative investment profit -15. Dashboard and holdings agree at the same inputs and quote time; date ranges and holdings filters do not change headline performance.
- Focused checks cover principal flows, opening imports, closed positions, income/costs, multi-currency FX, missing inputs, empty/negative assets, gaps, live endpoints, sparse hover selection, and snapshot comparison boundaries. Run typecheck, build, and the documented related verification scripts.
- Dashboard authenticated local visual acceptance passed at 320x740, 393x852, 430x932, 768x1024, and desktop on 2026-10-08. Separate holdings/snapshot-tab authenticated visual acceptance is not claimed by this result.
- The subsequent dashboard display hotfix (#106) defers authenticated responsive visual checks at the user's request; the earlier acceptance does not cover the hotfix.
- Delivery uses the existing test branch and test environment; release outcome is recorded in [deployment.md](deployment.md). Production and ledger data migrations are outside this release.
