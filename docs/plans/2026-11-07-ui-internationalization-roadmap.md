# UI Internationalization Phased Roadmap

**Status:** Approved

All implementation phases: Not started.

This is an overall roadmap, not a detailed implementation plan. The [approved design](../specs/2026-11-07-ui-internationalization-design.md) owns architectural decisions and acceptance boundaries. The user accepted both documents and authorized committing and pushing related documentation on 2026-11-07. Detailed phase planning and implementation remain unauthorized.

## Dependencies and phase gates

Default order is Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5. Phases 3 and 4 both depend technically on Phase 2; execute sequentially by default to avoid competing changes to shared resources/helpers. Phase 5 requires both. Detailed planning for a phase begins only when requested and after its prerequisite evidence is available; later phases remain at roadmap level.

| Phase | Scope and deliverables | Dependencies | Exit / acceptance criteria |
| --- | --- | --- | --- |
| 1. Rules and foundation | Initial financial terminology glossary; language/resource conventions; minimal library integration; typed bundled resources; browser preference lifecycle; shared format strategy; completeness checks; local English preview | Approved design; fresh code and contract inspection | Defaults and storage behavior verified; resource defects detectable; existing Chinese behavior preserved; formatter invariants covered; public switch remains unavailable |
| 2. Shared UI and complete pilot | Login/recovery, shell/navigation, common controls/states, error presentation; one complete representative workflow including validation and exceptional states | Phase 1 foundation/checks | Pilot fully bilingual; language switches preserve drafts, route and interaction state; no language-triggered ledger requests; actionable errors remain distinguishable; required focused and visual evidence recorded |
| 3. Investment workflows | Dashboard/trends, monthly review, holdings/details, accounts, instruments, investment groups and transactions; financial labels, charts, filters, drawers and errors | Phase 2 conventions proven; investment/API/time contracts reviewed | Complete investment translation coverage; glossary consistent with formulas; display precision, dates, currency and gain colors preserved; existing investment verification plus bilingual visual coverage recorded |
| 4. Remaining workflows | Spending/import, education reserves, settings, access management, maintenance and remaining system states; whole-app coverage reconciliation; update affected maintained language conventions | Phase 2 foundation; Phase 3 completed in default sequence; domain contracts reviewed | All in-scope application UI translated; source data intentionally unchanged; no untracked hardcoded UI or untranslated actionable states; documentation matches implemented behavior; focused and visual coverage recorded |
| 5. Integrated acceptance and release readiness | Whole-app regression; terminology and resource audit; bilingual/theme/viewport acceptance; bundle/performance review; final coverage and handoff record | Phases 1-4 complete with evidence | Required automated checks pass; no unresolved blocking correctness/layout defects; acceptance matrix complete or explicitly qualified; enable ordinary switch only after readiness gates; implementation/deployment/visual statuses independently recorded |

No phase completion is asserted by this document. UI acceptance is incremental in Phases 2-4; Phase 5 reconciles coverage and verifies integration. Readiness is not deployment authorization. If acceptance is deferred, record the outstanding coverage and retain the release gate unless the user explicitly changes it.

## Cross-phase acceptance

Apply the [design quality gates](../specs/2026-11-07-ui-internationalization-design.md#quality-gates-and-acceptance). Code phases require `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build` and affected focused verification. Use the existing verification discovery process and inspect command effects before executing checks. Do not create a new test framework solely for this work.

Browser acceptance follows real user login/readiness and all five maintained viewports, covering both languages and themes. Use isolated fixtures for write scenarios. Existing shared TEST records must not be edited to demonstrate translation. Visual acceptance of read-only scenarios does not imply write-path acceptance.

## Phase handoff and progress

At each phase boundary record scope completed, changed contracts, actual validation evidence, remaining defects, deferred acceptance, glossary/resource conventions and prerequisites for the next phase. Link the corresponding detailed plan only when separately requested and created. Update this roadmap's phase status and [project roadmap](../roadmap.md) from evidence, not from planned work.

New sessions must read this design/roadmap and inspect the current repository rather than relying solely on inherited conversation context. Apply [root instructions](../../AGENTS.md), [project workflow](../project-workflow.md) and [web instructions](../../apps/web/AGENTS.md); add [shared](../../packages/shared/AGENTS.md), [API](../../apps/api/AGENTS.md) and [scripts](../../scripts/AGENTS.md) guidance when those areas are affected. Follow all applicable maintained-source reading routes. Do not create branches/worktrees or expand delivery authorization implicitly.

## Optional later work

Cross-device language synchronization is outside these five phases. Reassess actual need after browser-local bilingual support is accepted. It requires a separately agreed preference precedence model and API/persistence design; it is not a prerequisite for English support.
