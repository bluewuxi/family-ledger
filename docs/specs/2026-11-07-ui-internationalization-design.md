# UI Internationalization Design

Status: Approved (overall direction and phased scope approved in the conversation on 2026-11-07). Implementation has not started.

The user accepted this design and roadmap and authorized committing and pushing the related documentation on 2026-11-07. Detailed phase plans, implementation and dependency installation remain outside scope. Documentation delivery follows the existing CI and documentation-only deployment-skip contract; application deployment is not requested. Implementation defaults below are design decisions, not claims that the user individually specified each detail.

## Intent and scope

Provide a single-language-at-a-time Simplified Chinese or English interface for Family Ledger. Preserve existing Chinese behavior and financial meaning while making the complete application usable in English. Chinese remains the default. Product display names are `�����` and `Family Ledger`; original logo artwork is preserved.

Cover login and recovery, navigation, investment views, account and transaction workflows, custom investment groups, spending/import, education reserves, settings, and maintenance. Include forms, validation, errors, loading/empty states, charts/tooltips, dialogs/drawers, notifications, page titles and accessible labels. User-entered names, notes, instrument/provider names and raw source quotations retain their original content. Application-owned enum/status labels are translated without changing stored identifiers. Diagnostic/source payloads remain source data; their surrounding UI is translated.

Non-goals: parallel bilingual pages, additional languages, translation services, live machine translation, separate language routes, new backend services, account-level language synchronization, financial formula changes, data migration and redesign of existing workflows.

## Evidence and contract ownership

Baseline: `test`, HEAD `d85e78682e590c46275d387206f7ecf14999a1bf`, clean working tree before documentation work. The web package has no internationalization dependencies. `apps/web/src/lib/numberFormat.ts`, `timeFormat.ts` and several page/chart helpers use fixed Chinese formatting. The preferences API currently exposes currency, gain-color scheme and theme, not language.

This document describes approved future behavior, not delivered functionality. Until implementation, the current Chinese-only contract remains in force. During implementation reconcile [frontend guidelines](../frontend-guidelines.md) and [root instructions](../../AGENTS.md) with the new language behavior. Preserve [architecture](../architecture.md), [auth](../auth.md), [API](../api.md), [financial data semantics](../data-model.md), [time policy](../time-policy.md), [investment](investment-overview.md), [spending](spending.md) and [education](education-reserve.md) contracts. Update their affected wording only when implementing the corresponding scope.

## Approaches and decision

| Approach | Benefit | Cost / decision |
| --- | --- | --- |
| Typed dictionaries and custom React context | No runtime dependency | Custom interpolation, reactivity and completeness infrastructure; not selected |
| i18next and react-i18next | Established React integration, interpolation, plural handling and typed resources | Two direct dependencies plus explicit resource checks; selected |
| Separate language pages | Independent content/layout | Duplicated workflows and regression exposure; rejected |

Use the selected library minimally: TypeScript resources bundled with the frontend, one application i18n instance and functional namespaces. No remote resource backend, detector plugin, translation platform or initial lazy-loading infrastructure. Check compatible package versions when implementing; this design does not pin an unverified version.

## Architectural decisions

1. **Web ownership.** Translation resources, language state and display formatting belong to `apps/web`. Keep business DTOs, persisted enum values, calculations and job behavior language-independent. Shared pure time helpers may accept an explicit locale; shared financial code must not depend on React or i18next.
2. **Language lifecycle.** Support `zh-CN` and `en`; map English display formats to `en-NZ` as the initial design default. Read a validated browser-local choice before the first application render; otherwise use Chinese. Storage failure falls back to an in-memory choice. Do not auto-detect system language. The choice is browser-wide, survives logout and applies to both login and authenticated screens; it is not a per-account preference. Offer clearly labelled `����` / `English` controls at login and in the authenticated shell without relying on flags.
3. **Stable interaction.** Language changes rerender presentation without a full reload, route change, app remount, data-cache invalidation, automatic form submission or ledger refetch. Preserve filter values, pagination, drafts, selected IDs, dialogs, focus and session state. Update document language/title and existing validation messages. Memoized labels and chart formatters must react to language changes.
4. **Resources.** Use semantic, typed keys organized by functional namespace, with a small shared namespace. Keep complete sentences and interpolation parameters rather than concatenated fragments. Use explicit mappings for domain enum values. Maintain a terminology glossary linked to metric definitions; context-specific meanings must not share a key merely because their Chinese text matches. Chinese runtime fallback is a resilience measure, not evidence of English completeness.
5. **Display boundary.** Centralize locale-aware presentation through existing formatting helpers. Preserve their precision, rounding, signs, missing-value and negative-zero behavior. Locale never selects the report currency, gain-color scheme, timezone or business day. Use explicit currency codes where symbols are ambiguous. Keep numeric input parsing independent of formatted output; never round-trip presentation text into authoritative arithmetic. Percentage formatters must preserve whether inputs are ratios or percentage points. Locale-dependent abbreviated chart units, if present, must scale values and labels consistently, with full values available in tooltips.
6. **Dates and ordering.** Preserve viewer-local timestamp display and the Shanghai 06:00 business-day cutoff. Calendar-date strings remain calendar dates without timezone conversion. Prefer unambiguous English date presentation. Translate display labels without changing server ordering, pagination or stable identifiers; do not incidentally change existing sorting while replacing `zh-CN` occurrences.
7. **Errors.** Present frontend validation, transport, session, permission and API failures through stable identifiers and safe parameters. Do not match or translate arbitrary `error.message` strings. Retain error descriptors so visible errors can update on a language change. Unknown failures use a localized safe fallback. Where one existing API code cannot preserve an actionable distinction, introduce only the necessary additive structured reason/parameters and document compatibility in API/shared contracts. No blanket backend localization or database change is required.
8. **Incremental migration.** Migrate whole workflows including exceptional states. Keep the production-facing language switch unavailable until the full coverage and release-readiness gates pass. Development verification may exercise English earlier through a local-only preview mechanism chosen during Phase 1 planning; this must not modify authentication or deployment configuration. Chinese remains usable throughout. Do not represent partially translated builds as complete English support.

## Quality gates and acceptance

- Resource checks detect missing/empty translations, invalid keys and inconsistent interpolation parameters. Plural completeness is checked using each language's required forms, not naive equality of plural-suffixed keys. Type safety alone is insufficient.
- Track remaining hardcoded UI text by migrated scope, with explicit exceptions for source data and original branding. Avoid a blanket ban on Chinese characters. Completion means all in-scope application-owned text is translated, not that all displayed content is English.
- Verify switch persistence, first-render language, invalid/unavailable storage, guest/login/logout behavior, state preservation, existing-error retranslation and absence of language-triggered ledger requests.
- Verify representative monetary/percentage/date boundaries against existing contracts, including negative zero, missing values, calendar dates, timezone boundaries and chart scale labels. Finance calculations and stored data remain identical across languages.
- Each implementation phase runs required lint, typecheck, build and affected focused checks under [workflow validation](../project-workflow.md#validation). Use isolated fixtures for write/error paths; shared TEST data is real family data.
- Perform real-login visual acceptance under [local testing](../local-testing.md#authenticated-browser-acceptance): both languages and both themes at `320x740`, `393x852`, `430x932`, `768x1024`, and recorded desktop dimensions (recommended `1440x1000`). Check long text, tables, action footers, charts, dialogs, keyboard focus and accessible names. Record scenario coverage, not just screenshots. No bypass or synthetic shared-data writes.
- Separate implementation, deployment and visual-acceptance status. Phase-local validation occurs throughout; final verification does not replace it. Any deferred/waived coverage must be recorded as such, never passed.

## Risks and deferred choices

Primary risks are missed exceptional-state text, mistranslated financial metrics, stale translated state and English overflow. Mitigate with a complete workflow pilot, glossary review, scope-aware checks and incremental visual evidence. Translation dictionaries are eagerly bundled initially; measure actual bundle impact before adding loading complexity.

Exact directory layout, library API style, pilot selection, preview mechanism and focused-check implementation are delegated to phase planning. The pilot must include a form, validation, a modal/drawer and a failure state, with isolated write verification. Cross-device sync is a separate future proposal requiring a login/local preference precedence policy, API/schema review and independent migration authorization if needed.

Execution sequencing and handoff gates are in the [phased roadmap](../plans/2026-11-07-ui-internationalization-roadmap.md).
