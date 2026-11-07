# Frontend Guidelines

This document owns shared UI language, responsive layout, and navigation conventions. Page-specific behavior belongs in the relevant [product specification](README.md#maintained-sources). Browser verification follows [authenticated browser acceptance](local-testing.md#authenticated-browser-acceptance); completion reporting follows [Project Workflow](project-workflow.md#completion-reporting).

## Language and terminology

The [Phase 1 internationalization foundation](specs/ui-internationalization.md) adds typed resources, explicit formatting and a loopback-development-only preview. Ordinary builds remain Chinese; login, navigation and business workflows have not yet migrated. Preserve current labels until their approved workflow phase.

The UI uses Simplified Chinese and the product names `金财屋` / `Family Ledger`. Preserve established labels such as 登录, 财富足迹, 投资账户, 投资标的, 交易记录, 持仓总览, 设置, 总资产, 最新变动, 未实现收益, and 账户数量. Follow the relevant specification for metric-specific wording rather than substituting a similar financial term.

Tax features use cautious wording such as 税务辅助, 税务估算, or 税务记录. Do not promise compliance through labels such as 自动报税, 准确报税, or 税务申报系统. The project's limited tax scope is defined in [AGENTS.md](../AGENTS.md#product-and-scope).

## Mobile layout

Treat mobile layout as a first-class requirement for every web UI change.

- Mobile navigation is closed by default after login and opens as an overlay drawer. Desktop sidebar collapse controls must not appear on mobile.
- Use readable Simplified Chinese text, avoiding tiny labels and cramped helper text. Controls must provide at least `44px` tap height.
- Prefer stacked controls, wrapped actions, and clear spacing on narrow screens. Text and controls must not overlap or depend on hover-only affordances.
- Keep data-heavy pages as horizontally scrollable tables unless the task explicitly requests a mobile card/list redesign.
- Drawers, dialogs, filters, pagination, tabs, and footer content must fit common phone widths without clipping important actions.

The required viewport sizes and user-login handoff are maintained in [local testing](local-testing.md#authenticated-browser-acceptance). Page specifications add their own acceptance criteria; they do not replace these shared requirements.

## Shared back navigation

- All existing page-level return-to-parent links use the shared `PageBackLink` component: a small left arrow followed by the destination name, muted text, no button border, background, or shadow.
- Place the link above the page title and align its left edge with the title. Highlight its text on hover, retain a visible keyboard focus outline, and provide a minimum `44px` click/tap area. The accessible name includes the return action.
- Apply this pattern to account detail (`投资账户`), holding detail (`持仓总览`), and administrator-contact password recovery (`登录`). Preserve each destination route. Dedicated actions such as `返回编辑` remain action buttons.

## Accessible interaction and states

Settings groups the user-access heading, management actions, feedback, and user table in one panel. The extra-password form is a separate panel. Administrators find `修改登录密码` immediately before `刷新用户`; viewers retain their self-service password link in user preferences. Extra-password recovery guidance appears only after activating `忘记密码？`, in a dismissible modal dialog with keyboard focus containment and return.

For changed UI, provide labeled inputs, perceivable field validation, keyboard-operable controls, visible focus, dialog focus entry and return, readable contrast, and explicit loading, empty, and failure states. Apply this baseline proportionally; it does not certify an audit of existing pages. Preserve the required [authenticated acceptance procedure](local-testing.md#authenticated-browser-acceptance).

## Workspace composition and workflows

Use warm near-white and warm charcoal canvases, quiet neutral surfaces, fine borders, restrained brown/gold actions, and tabular financial numerals in both themes. Authenticated pages do not use decorative tree, star, glow or strong gradient backgrounds. Retain the original logo files and brand lettering; a light backing may support original artwork in dark mode. Reserve substantial shadows for overlays.

Group navigation as 概览 (财富足迹, 月度回顾), 投资 (持仓总览, 交易记录, 投资标的), and 家庭 (家庭收支, 账户管理). Place 数据维护 and 设置 in bottom utilities. Reach 关于 through Settings and retain its direct route. Desktop collapse preferences and initially closed mobile navigation remain unchanged.

Aggregate labels describe the metric without reminders about partial account visibility. Neutral empty states must not disclose hidden accounts. Headline investment metrics remain independent of table filters; label table summaries 筛选结果.

Short edits and record details use labelled drawers with focus containment/return, Escape/backdrop/close dismissal, pending-save protection and confirmation after meaningful edits. Keep one scrolling content region and an accessible action footer. Phones use full-width drawers and horizontally scrolling tables.

Statement import uses /daily-expense/import and /daily-expense/import/:statementId, retaining spending query parameters for return navigation. Account creation uses /accounts/new with basic information, opening assets and review stages; basic edits remain in drawers. In-progress workflows protect departure and never automatically replay writes. Account and opening-asset requests remain separate; partial success must be explicit.
