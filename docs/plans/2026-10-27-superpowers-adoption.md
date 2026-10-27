# Superpowers Adoption Plan

Status: Implemented
Created: 2026-10-27
Local adoption verified: 2026-10-27
Scope: Adopt Superpowers for this project's development workflow, with a verified distribution and a controlled pilot.

## Authority and current baseline

Follow [AGENTS.md](../../AGENTS.md), [Project Workflow](../project-workflow.md#superpowers-compatibility), and the [adopted decisions](../decisions/rules-cleanup-decisions.md). Those maintained sources define the rules; this plan does not duplicate or replace them.

The user approved this plan on 2026-10-27 and explicitly authorized installation, activation, and the isolated pilot, initially with no commit or push. Local desktop adoption and independent review are complete within the coverage recorded below. Subsequent documentation delivery authorization is recorded at the end of this plan; other operations retain their existing authorization boundaries.

Observed during the 2026-10-27 assessment:

- The checkout was on `test` with no pending changes before this plan.
- Project compatibility adaptations already exist; Superpowers remains disabled.
- The plugin directory offered Superpowers and reported `installed: false` with global scope. Actual activation scope and controls still need verification.
- Git 2.53.0, Node 24.14.0, Corepack 0.34.6, and Git Bash 5.2.37 ran successfully.
- PATH resolved `bash` to the Windows system directory. The verified Git Bash executable is `C:\Program Files\Git\bin\bash.exe`.
- `.local/` and `tmp/` are ignored; probe paths in `docs/specs/` and `docs/plans/` were not ignored.

These observations are a baseline, not proof that an installed distribution works. Recheck relevant state when executing.

## Outcome and exclusions

Success means the selected skills are discoverable, respect the project's adaptations in a small pilot, and have a verified disable/recovery path. Daily prompts should state intent and authorization without restating AGENTS.md.

This adoption does not replace Supabase Auth, change product behavior, require a new test framework, or modify CI, infrastructure, live data, or deployment configuration. The earlier self-hosted Auth discussion is an illustrative use case, not an approved feature or pilot implementation.

## Execution steps

### 1. Select and inspect the distribution

- Refresh plugin availability and inspect its manifest, version or commit, skills, hooks, helper scripts, dependencies, and update behavior.
- Prefer the supported plugin installation path if it exposes sufficient version and scope information; do not add a second manual installation alongside it.
- Determine whether activation is global or project-specific, how other projects are affected, whether a new session is needed, and how to disable or remove it.
- Inspect the selected package before activation where supported. If installation also activates it, establish scope and recovery first and perform the initial verification in a disposable context after authorization.
- Record the exact inspected and installed identities; if they differ, repeat the comparison. Do not infer installed behavior from upstream `main`.

Acceptance: installation source and identity are recorded; activation scope and recovery steps are understood. Any unavoidable global effect is disclosed before activation and covered by user authorization.

### 2. Verify compatibility against that version

Create a concise evidence table here or in a linked adoption record, with skill file/version, applicable workflow rule, adaptation needed, and result.

| Skill area | Required evidence |
| --- | --- |
| Entry/skill discovery | Project rules load with the skills; no duplicate installation or conflicting bootstrap instructions |
| Brainstorming and planning | Proportional planning, correct document paths, explicit design status, no automatic design commit |
| Execution and review | Scoped uncommitted and untracked changes are reviewed; agent authority and progress records follow project rules |
| Worktrees and finishing | Existing `test` checkout remains the default; no unauthorized branch, worktree, commit, push, or PR |
| TDD and debugging | Existing focused checks are reused; no destructive rewrite or live mutation to satisfy a template |
| Completion verification | Claims use actual evidence; implementation, deployment, and visual acceptance stay distinct |

Use the existing compatibility section as the adaptation source. Add only newly discovered gaps there; avoid copying an entire upstream workflow into AGENTS.md or editing cached plugin files as a durable solution. If required behavior cannot be reconciled, keep the affected workflow disabled and report the blocker.

Acceptance: no unresolved conflict can expand authority or override a protected project contract.

### 3. Check Windows helpers in disposable scratch space

- Use an ignored directory such as `.local/superpowers-adoption/`, including a child path with spaces.
- Review scripts before running them; use explicit Git Bash and verify helper-specific dependencies and path handling.
- Exercise only selected helpers with fixture data and no credentials, live data, commits, or deployment.
- Check temporary-file placement and the selected version's SDD ignore behavior. Confirm formal specs/plans remain visible to Git.
- If a helper starts a local service, verify its shutdown and remove only task-created scratch artifacts after preserving findings.

Acceptance: required helpers work on Windows; failures and unavailable optional helpers are recorded without claiming coverage for untested paths.

### 4. Install, activate, and run a bounded pilot

After authorization, install and activate the inspected distribution using the verified controls. If step 1 required coupled installation/activation, verify that existing installation instead of reinstalling it. Start a fresh session if required and confirm actual skill discovery.

Use a disposable local fixture for a small deterministic bug fix and an untracked new file. Do not use the Auth migration or an authenticated product page as the first pilot. Provide the project constraints and record the starting state. Allow subagents only within applicable authorization, and verify their context if used.

Exercise these scenarios:

1. A clear bug fix proceeds without unnecessary design approval; a focused failing check passes after the fix.
2. Review covers both the modified file and the untracked file, while preserving unrelated pre-existing content.
3. A design-only request produces discussion/design without implementation or automatic commits.
4. Completion reports evidence and stops at the authorized boundary; no branch/worktree, issue, commit, push, deployment, or live operation occurs.

Record the skills actually used, checks run, artifacts reviewed, and unexpected behavior. Correct material compatibility failures and repeat only affected scenarios. Broader workflows remain unverified until exercised.

Acceptance: skill loading and all four scenarios pass, with no material unresolved findings. A narrative statement that rules were followed is insufficient without observed actions and reviewed artifacts.

### 5. Record adoption and handoff

- Preserve version, compatibility results, helper checks, pilot evidence, limitations, and disable/recovery steps in a concise linked record or this plan.
- Update current activation statements in AGENTS.md, Project Workflow, and the documentation map only after activation and the pilot are verified. Preserve historical disabled-state statements in dated decisions; add a dated adoption reference where necessary.
- Include a few short daily prompt examples and their verified skill mappings without repeating project rules.
- Review documentation meaning, links, and consistency; run `git diff --check`. Validate any changed local skills with their validator. If project executable code or build inputs change, also run the checks required by AGENTS.md.
- Report local adoption, repository delivery, and product visual acceptance separately. Adoption alone does not require deploying the application or product visual acceptance.

Acceptance: the recorded status matches the actual installation and test results. Commit/push occurs only if separately authorized through the existing delivery workflow.

## Stop and recovery conditions

Stop the pilot for unauthorized actions, missing review coverage, protected-contract changes, unsafe helper behavior, or an unknown installation identity. Preserve evidence, disable the plugin through the verified control when authorized, and return to the existing family-ledger workflow. Do not undo unrelated project changes. Confirm skill discovery reflects the disabled state in a fresh session when required.

Treat plugin updates as new versions requiring a compatibility comparison and affected helper/pilot checks before claiming continued verification. If updates cannot be pinned, record that limitation and the installed identity at each verification.

## Progress

- [x] Create the draft plan and record the assessed baseline.
- [x] Receive authorization for installation/activation and the bounded pilot.
- [x] Select distribution and verify scope/recovery controls (removal not rehearsed).
- [x] Complete version-specific compatibility review.
- [x] Verify required Windows helpers.
- [x] Verify desktop activation and the four bounded pilot scenarios.
- [x] Record adoption evidence and update current status statements.
- Repository delivery was subsequently authorized and is tracked in [issue #116](https://github.com/bluewuxi/family-ledger/issues/116); the issue records the final commit/run outcome.

## Execution evidence (2026-10-27)

### Selected package and host

- Distribution: `superpowers@openai-curated-remote`; version: `7.0.1`.
- Supported CLI `plugin add` returned the same existing package path; no second manual installation was added. CLI `plugin list --json` reported installed and enabled. The host subsequently confirmed installation and supplied all 15 skills in this chat and fresh subagent catalogs.
- Manifest SHA256: `1a8ddab7b9b6d8c5077a3a4b3a3b4efb8e4fc50e3b60430f5ea7e662b7974577`. A local snapshot records hashes of all 106 package files. This is the installed distribution, not a claim about an upstream Git commit.
- The manifest declares skills only; no MCP servers, lifecycle hooks, or external app dependencies were declared for this package.
- Installation scope is global; the project adaptations remain repository-scoped. No global model configuration or cached skill files were edited.
- Recovery control inspection confirmed the supported `plugin remove` command and the selected plugin ID. Actual uninstall/deactivation was not rehearsed. Recovery must verify metadata and a fresh desktop catalog after a requested change; see [operating guidance](../operations/superpowers.md).

### Compatibility comparison

All skill references below are the installed `skills/<name>/SKILL.md` files from 7.0.1.

| Area / files inspected | Finding and project adaptation | Evidence / result |
| --- | --- | --- |
| `using-superpowers` and its Codex reference | User/project instructions take priority; use actual host tools and model capabilities instead of upstream model/config assumptions | Desktop and two fresh pilot agents saw all 15 entries; no duplicate bootstrap or global configuration edit |
| `brainstorming`, `writing-plans` | Adapt design/plan paths and automatic commit defaults; preserve proportional planning and existing approval | Design-only scenario remained discussion-only; document defaults checked by inspection |
| `executing-plans`, `subagent-driven-development` | Retain ledger and task boundaries; omit unauthorized commits/worktrees; rulings cannot override protected contracts | Adoption ledger retained; bounded bug-fix worker used explicit scope; broad multi-task execution not claimed |
| `requesting-code-review`, reviewer template, `review-package` | Commit-only ranges cannot cover working/new files; provide an explicit scope packet | Empty-range guard passed; final independent review includes fixture working diff, new test contents, and adoption documents |
| `using-git-worktrees`, `finishing-a-development-branch` | Existing `test` checkout and current delivery authorization replace upstream worktree/merge/PR defaults | Main HEAD, branch/remote/tag refs, index, and worktree inventory checked against baseline; no delivery operations |
| `systematic-debugging`, `test-driven-development` | Diagnose and demonstrate red/green; preserve existing code and use existing checks | Fixture observed 2 intended failures, then 3/3 passing tests; sentinel and fixture index preserved |
| `verification-before-completion` | Require actual evidence and separate completion categories | Root independently reruns the fixture suite and checks state/docs before completion |

The only additional maintained adaptation discovered was to use project Corepack/pnpm commands instead of the upstream worktree skill's `npm install` example. Existing compatibility rules covered the other findings.

### Windows helper evidence

Explicit Git Bash ran nine selected checks: workspace resolution with spaces, task extraction, missing-task rejection, task-start, failed task-done not recording completion, successful task-done recording evidence, empty commit-range rejection, same-basename plan isolation, and self-ignore behavior without ignoring formal documents. No real credentials or live services were used. Helper-generated completion lines concern synthetic helper checks only, not application tasks or commits.

### Pilot evidence and limitations

The disposable fixture lives under ignored `.local/superpowers-adoption/2026-10-27/`, in a path containing spaces. Setup initialized an empty fixture repository and staged supplied baseline files only; it created no commit or branch ref. During the scenario, the executor did not change its index, symbolic HEAD, or refs. Main project state is checked separately.

1. Clear correction: `inclusiveRange` omitted the final integer. The executor loaded debugging/TDD/verification skills, added an untracked Node test, observed endpoint and equal-endpoint failures, and changed only the length expression. Full fixture suite: 3 tests passed, 0 failed. No new design approval was requested.
2. Uncommitted review: the final review packet includes the actual source diff against the fixture index, the entire new test, the index baseline, and verification reports. Ordinary `git diff` alone omits that new test.
3. Design-only request: a fresh agent loaded `brainstorming`, compared persistence options for a hypothetical colour preference, and asked one simulated clarification. Its only write was the authorized evidence report; no implementation or design document was created.
4. Authorization/completion: fixture and project delivery state are checked against baseline. The app's internal `refs/codex/turn-diffs/` checkpoint refs changed during editing; this is recorded separately from unchanged HEAD, branch/remote/tag refs, index, and worktree inventory. Reports distinguish local implementation, no deployment, and inapplicable visual acceptance. No product runtime code was changed.

Ignored local evidence includes installation metadata, package hashes, helper results, discovery observations, pilot reports, the progress ledger, and the final review packet. Durable conclusions are retained here and in the operating guide; local evidence must not be mistaken for committed release evidence.

Coverage is the desktop workflow and the bounded scenarios above. Separate CLI discovery remained absent even when metadata reported installed/enabled; early CLI-only discovery failures are preserved, not relabeled as passes. Optional visual-server/graph helpers, persistent removal, automatic-update pinning, and a full multi-task SDD rollout are not validated. No application deployment or authenticated UI change occurred. Repository changes are documentation/instructions only; they require semantic/link/diff checks rather than product typecheck/build. Scratch fixture code is validated with its own Node suite.

### Final independent review and completion

A fresh reviewer read the scoped working/index diffs, both new repository documents, the actual fixture source diff, and the entire untracked test file. It independently reran the full fixture suite (3 passed, 0 failed), compared all 106 installed package hashes (zero mismatches), and inspected the helper and installation evidence. Verdict: accept local Codex desktop adoption; no Critical, Important, or Minor findings. There are no deferred minor findings.

The reviewer explicitly declined the following broader claims. The coordinator retains these scope decisions:

| Unverified area | Disposition |
| --- | --- |
| CLI automatic discovery/use | Open follow-up with impact and closure criteria in [operating guidance](../operations/superpowers.md#open-follow-up-cli-skill-discovery); excluded from desktop acceptance until demonstrated |
| Actual disable/uninstall | Control discovery only; execute and verify a fresh catalog when removal/deactivation is requested |
| Optional visual helpers and broad multi-task SDD | Not exercised; verify the relevant workflow when introduced |
| Future versions, pinning, and automatic updates | No pin/update control established; compare the new installed identity before extending verification |
| Non-integer, non-finite, unsafe, or unallocatable range inputs | Outside the disposable fixture contract; fixture code is not a production API |
| Product deployment and authenticated visual acceptance | Not applicable to this tooling/documentation adoption; no deployment or UI acceptance claim |

Execution decisions preserved from the local ledger: retain the existing `test` checkout and apply the approved compatibility rules; use an index-only fixture baseline rather than creating a commit for a review range; distinguish app-managed checkpoint refs from delivery refs. None changes a protected product contract or delivery authorization. Original local evidence remains ignored for inspection; it is not assumed recoverable from commits.

Final local-adoption validation: repository diff/whitespace checks, relative-document link checks, semantic consistency review, fixture red/green evidence and independent reruns, package identity/hash verification, and unchanged project delivery-state checks passed. No local skill source was changed, so skill validation was not required. Implementation/local adoption: complete. At that checkpoint, repository delivery/application deployment had not been requested or performed. Product visual acceptance: not applicable.

### Subsequent documentation delivery authorization (2026-10-27)

After local adoption, the user explicitly requested documenting the uncovered CLI discovery point and delivering this change together with the adoption documents. This supersedes the earlier no-commit/no-push boundary for this documentation delivery only. Use the existing `test` CI/automatic TEST mechanism and verify the expected documentation-only skip; no manual application deployment is needed. The CLI follow-up remains open after delivery.

See the [dated delivery record](../releases/2026-10-27-superpowers-documentation.md) and [issue #116](https://github.com/bluewuxi/family-ledger/issues/116) for validation and final commit/workflow evidence. The issue is the outcome record for this documentation delivery, independent of the completed local-adoption checklist.
