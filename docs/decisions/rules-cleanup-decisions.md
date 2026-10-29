# Rules Cleanup: Adopted Policy Decisions

Approved by the user on 2026-10-27. All seven decisions below are active through [AGENTS.md](../../AGENTS.md) and [Project Workflow](../project-workflow.md). This record supersedes the former pending proposals. Business contracts, the routine `test` branch, deployment mechanisms, and login/viewport requirements remain in place. Superpowers was not enabled during this preparation stage; [subsequent authorized adoption](#subsequent-authorized-adoption-2026-10-27) records its later activation and current operating guidance.

| Topic | Adopted decision |
| --- | --- |
| Delivery trigger | Implementation/finish/complete requests stop at changes, validation, and summary. Commit-only stops locally; push includes necessary commit preparation and CI/automatic TEST monitoring. Explicit default delivery runs the full sequence. Existing authorization persists within scope. Clarify ambiguous release targets; deploying a committed version does not include uncommitted edits. |
| Deployment authorization | Push authorization includes configured automatic TEST deployment. Migration application, data repair, independent infrastructure/configuration changes, enabling automation, and manual deployment/bootstrap/recovery require separate explicit authorization. Diagnose disabled/failed/blocked automation without bypassing gates or substituting manual deployment. Production remains operator-run. |
| Issue references | Use `Refs #<issue-number>` for project delivery commits. Close explicitly after verification; do not use automatic closing keywords. |
| Documentation-only delivery | An authorized documentation-only delivery may close its issue after applicable local checks and CI pass and the workflow confirms the expected documentation-only skip for the pushed commit. Record commit/run evidence; report the skip without claiming live deployment. Other skip/failure conditions do not qualify. |
| Completion checks | Code changes retain typecheck/build and affected focused verification. Documentation/instruction-only changes use meaning, consistency, link, diff, and applicable skill checks; no typecheck/build unless executable behavior/build inputs change. Read-only analysis uses evidence review. Mixed changes require all applicable checks. |
| Authenticated frontend acceptance | Report implementation, deployment, and visual acceptance separately. User-deferred visual acceptance remains outstanding but does not block reporting implementation/deployment completion or deployment-verified issue closure. Never claim unperformed acceptance passed. Retain all five viewports and user agreement/login/readiness requirements. |
| Branch switching | Retain the existing ask-before-switching policy: routine work uses `test`; ask before switching from another branch unless the user explicitly requested work on another branch. No automatic-switch exception is introduced. |

## Maintained sources

- AGENTS.md holds project constraints and essential policy boundaries.
- `docs/project-workflow.md` holds implementation, verification, migration tools, delivery scope, and completion reporting.
- The local `family-ledger-workflow` skill loads these tracked sources rather than duplicating their procedures. Its local path is only a fallback locator for a checkout not already identified by the task.
- `docs/test-auto-deployment.md` remains the authority for deployment mechanics, locks, independent verification, and operator registration. No CI, deployment script, or infrastructure changes are made by this policy update.

## Documentation and SuperPowers preparation (2026-10-27)

Subsequent user-approved preparation establishes the lightweight [documentation structure](../README.md) and [SuperPowers compatibility rules](../project-workflow.md#superpowers-compatibility). Formal plans are version-controlled, small contract-restoring hotfixes do not require retrospective plans, and the root README's bilingual opening description is the sole documentation-prose language exception. Maintained contracts, plans, operations, decisions, and historical release evidence have separate locations and responsibilities.

The compatibility rules resolve workspace defaults, planning/approval scope, commit authorization, review of uncommitted changes, verification, delegated authority, and delivery ownership. The local workflow skill's decision-document reference is updated to this location. Browser acceptance retains real user login; the existing local bypass mechanism is not an acceptance path. These decisions do not install or enable SuperPowers. Actual distribution/version verification and helper-script checks remain part of a separately authorized activation.

## Subsequent authorized adoption (2026-10-27)

The user subsequently authorized installation, activation, and an isolated pilot, with no commit or push. Superpowers 7.0.1 is installed and available in the Codex desktop workflow. The [adoption record](../plans/2026-10-27-superpowers-adoption.md) and [operating guidance](../operations/superpowers.md) record evidence and coverage limits. Earlier disabled-state statements above describe the preparation stage and are preserved as history.
