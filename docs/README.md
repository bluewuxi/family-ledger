# Documentation Map

Maintained contracts describe current intended behavior. Implementation plans explain a particular change; historical release records establish what was delivered and checked. A plan or old release prerequisite does not override a maintained contract or authorize new operations.

## Directory structure

```text
docs/
  README.md              Documentation map
  architecture.md        Cross-layer design
  auth.md                Identity and access
  api.md                 API contracts
  data-model.md          Persistence semantics
  frontend-guidelines.md Shared UI and responsive conventions
  time-policy.md         Cross-layer date/time conventions
  roadmap.md             Current progress and outstanding acceptance
  project-workflow.md    Implementation and delivery workflow
  local-testing.md       Verification guidance
  deployment.md          Current deployment entry point
  test-auto-deployment.md TEST release gates
  specs/                 Maintained product behavior
  plans/                 Implementation plans
  operations/            Backup, restore, and repair procedures
  decisions/             Adopted decisions and rationale
  releases/              Dated historical delivery evidence
  assets/                Documentation images and branding
```

New plans use `YYYY-MM-DD-<topic>.md`, with the date the plan is created. Existing imported plans retain their names because their original creation dates are not established. Use descriptive stable filenames for maintained specifications and runbooks. Link release evidence rather than copying it into specifications or plans.

## Maintained sources

| Area | Source and responsibility |
| --- | --- |
| Project entry point | [AGENTS.md](../AGENTS.md): product boundaries, code map, universal constraints, authorization, required checks, and mandatory task-reading routes |
| Execution | [Project workflow](project-workflow.md): implementation, validation, delivery scope, and completion reporting |
| Architecture and identity | [Architecture](architecture.md), [auth](auth.md) |
| Interface and persistence | [API](api.md): endpoint/DTO contracts; [data model](data-model.md): persistence semantics; versioned SQL in `supabase/migrations` defines schema changes |
| Shared frontend conventions | [Frontend guidelines](frontend-guidelines.md): UI language, mobile layout, shared back navigation; page behavior belongs in product specifications |
| Date/time conventions | [Time policy](time-policy.md): instants, calendar dates, business-day cutoff, provider dates, and shared helper use; data model/deployment own storage and schedule details |
| Investment behavior | [Investment overview](specs/investment-overview.md) |
| Family cashflow behavior | [Spending](specs/spending.md), [education reserve](specs/education-reserve.md) |
| Verification | [Local testing](local-testing.md): commands, focused checks, user-login handoff, and all five viewport requirements; specifications define behavioral acceptance criteria |
| Current progress | [Roadmap](roadmap.md): implemented/pending work and outstanding acceptance |
| Deployment | [TEST automatic deployment](test-auto-deployment.md): release gates and recovery; [deployment](deployment.md): current operational entry point; [historical TEST releases](releases/test-release-history.md): dated delivery evidence and one-time procedures |
| Backup and repair | [Backup and restore](operations/backup-restore.md), [Kernel NTA repair](operations/kernel-nta-repair.md); data changes and migration application require separate authorization |
| Development skills | [Superpowers](operations/superpowers.md): installed version, desktop coverage, daily prompts, helper caveats, and recovery controls |

## Plans and decisions

- [AWS authentication design](specs/2026-10-31-auth-migration-design.md) and [implementation plan](plans/2026-10-31-auth-migration.md) propose the selected Lambda/DynamoDB opaque-session migration. Design is Approved and local implementation evidence is recorded in the plan; TEST cutover and automatic verification completed; real-login visual acceptance passed. Account visibility is deferred.
- [Superpowers adoption plan](plans/2026-10-27-superpowers-adoption.md) records the authorized adoption, version review, Windows helper checks, activation, and controlled pilot evidence.
- [Agent instruction organization plan](plans/2026-10-30-agent-instruction-organization.md) tracks the authorized documentation reorganization and rule-coverage checks; consult its status for implementation progress.
- [Spending import plan](plans/spending-import-plan.md) and [education reserve plan](plans/education-reserve-unification-plan.md) preserve completed implementation history. Their original empty-data assumptions, backup versions, and release permissions are historical.
- [Adopted cleanup decisions](decisions/rules-cleanup-decisions.md) record policy rationale; active procedures are maintained in AGENTS.md and the project workflow.
- Formal plans belong in version control and reach GitHub through authorized commit/push work. Temporary drafts, private mappings, backups, and diagnostic output remain in ignored local locations.
- Plan status should be explicit: Draft, Approved, Implemented, or Superseded. Link the maintained specification and, when available, delivery evidence. Design approval does not imply implementation or delivery authorization.

When documents disagree, reconcile the affected maintained sources against implementation and release evidence. Do not silently change business contracts or infer live environment state from local code. Superpowers is enabled for the Codex desktop workflow; [usage and verified coverage](operations/superpowers.md) and [project compatibility rules](project-workflow.md#superpowers-compatibility) define its boundaries.

## Rules review remediation

The [2026-10-30 review and plan](plans/2026-10-30-rules-review-and-remediation.md) records documentation remediation and separately open implementation/evidence items. Auth owns access exceptions; API owns DTOs/compatibility; product specifications own formulas and visible behavior; data model owns persistence; time policy owns date conventions; local testing owns commands and login/viewports; the TEST contract owns release gates. Other documents summarize and link rather than copying complete contracts.
