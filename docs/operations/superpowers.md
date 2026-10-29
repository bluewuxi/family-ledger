# Superpowers Development Workflow

Superpowers 7.0.1 is installed and enabled in the Codex desktop environment. This project's [compatibility rules](../project-workflow.md#superpowers-compatibility) govern its use. The [adoption plan and evidence](../plans/2026-10-27-superpowers-adoption.md) record the bounded verification and limitations.

## Installation and coverage

The selected distribution is `superpowers@openai-curated-remote`, installed through the supported plugin mechanism. Its manifest declares version `7.0.1` and skills under `./skills/`; this package contains no declared MCP servers or lifecycle hooks. Do not add a duplicate manual skill installation.

The plugin has global installation scope. The family-ledger adaptations apply when this project's instructions are loaded; installing it does not copy those adaptations to other projects. Installation is local tooling state, not an application deployment or a repository dependency.

Verified coverage is the Codex desktop chat and its fresh subagent contexts: all 15 Superpowers skills were visible in their supplied catalogs. Separate CLI sessions and CLI prompt inspection did not discover these remote skills, despite installed/enabled metadata. CLI automatic use is not accepted by this adoption; do not infer it from desktop success or silently add another installation as a workaround.

## Open follow-up: CLI skill discovery

Status: Open; outside the completed desktop acceptance. Observed on 2026-10-27 with Superpowers 7.0.1 and Codex CLI 0.164.0-alpha.11.1. The cause has not been established.

CLI discovery means a terminal-launched Codex session automatically lists the installed skills and can select/load them for a task without a manually supplied skill-file path. This matters for interactive terminal use, `codex exec`, and scripted automation. Installed/enabled plugin metadata and readable cached files alone do not demonstrate it. The observed CLI catalogs omitted Superpowers; desktop chats and fresh desktop subagents exposed all 15 skills.

Before extending acceptance to CLI:

1. Record the actual CLI and plugin versions and reproduce discovery in a fresh interactive terminal session and a fresh `codex exec` session.
2. Confirm the skills appear in the session's discovered catalog and relevant skills load for a bounded fixture task without manually supplying their paths. Confirm project rules and authorization boundaries still apply.
3. Preserve the commands, catalog/loading evidence, and fixture result; investigate any discrepancy without adding a duplicate installation or changing global settings by assumption.
4. Update this open status and the [adoption evidence](../plans/2026-10-27-superpowers-adoption.md) only after those checks pass. A plugin or CLI update also requires the affected compatibility checks.

The current documentation delivery records this gap; it does not resolve or accept CLI automation.

## Daily prompts

State the goal, phase, and authorization. Existing project instructions supply the remaining constraints.

| Example prompt | Expected skill |
| --- | --- |
| "Evaluate replacing Supabase Auth with self-hosted authentication. Discuss the design first." | `brainstorming` |
| "The design is approved. Write the implementation plan; do not implement yet." | `writing-plans` |
| "Implement the approved plan inline, validate and review it; do not commit." | `executing-plans`, relevant verification skills, and final review |
| "Implement the approved plan using subagents; do not commit." | `subagent-driven-development` |
| "Refreshing after login signs me out. Diagnose and fix it." | `systematic-debugging`, `test-driven-development` |
| "Check completion and list remaining TEST release prerequisites." | `verification-before-completion`, review where appropriate |

These are usage examples, not feature approvals. Skill selection follows the installed descriptions and the actual task; routine clear corrections retain the proportional workflow.

## Windows helpers and review

Use the explicitly resolved Git Bash executable, currently `C:\Program Files\Git\bin\bash.exe`. PATH's Windows-system `bash.exe` is not the tested helper runtime. Use project Corepack/pnpm commands when project setup or verification is needed; do not copy upstream `npm install` setup examples into this pnpm workspace.

Version 7.0.1's `sdd-workspace`, `task-brief`, `task-start`, and `task-done` passed the selected Windows fixture checks, including paths with spaces. The workspace helper creates a self-ignoring `.superpowers/sdd/` directory and isolates plans by recorded identity. Keep formal documents in the project locations.

The upstream `review-package` helper covers committed ranges only and rejects `HEAD..HEAD`. For uncommitted work, supply an explicit scoped package containing working/index diffs and relevant new-file contents as required by Project Workflow. A rejected empty range is not a reason to create a commit or skip review. Preserve the ledger until its decisions and findings are recorded durably.

The optional visual-companion server, graph renderer, and large multi-task SDD workflow were not exercised. Product authenticated visual acceptance remains a separate requirement when applicable.

## Disable, removal, and updates

Inspect the Superpowers entry in the desktop Plugins surface to manage the installed plugin. A supported removal control was confirmed through `codex plugin remove --help`; the exact selected entry is `superpowers@openai-curated-remote`. Actual removal was not rehearsed during adoption. Removal is a separate explicit user action; do not remove or disable it merely because a task is complete.

If removal or deactivation is requested, use the supported control, then check installed/enabled metadata and the skill catalog in a fresh desktop context. Resume the existing family-ledger workflow if Superpowers is unavailable. Do not delete product changes, formal plans, or unrelated local work. A CLI catalog with no skills cannot validate a desktop disable operation because that CLI catalog was already empty during the enabled-state check.

Record a new package version and compare affected skills/helpers before claiming continued verification after updates. No version pin or automatic-update control was established during this adoption. Recheck the installed identity when troubleshooting unexpected behavior. Keep upstream package files unmodified and maintain project adaptations in the repository.

## Activation and upgrade verification

Before a future separately authorized activation, or verification of an updated version, record the selected distribution/version or commit and compare its installed skills with the [project compatibility rules](../project-workflow.md#superpowers-compatibility). Check brainstorming, planning, execution/review, worktree, TDD, and finishing behavior; upstream `main` is not proof of the installed version.

Verify helper scripts in disposable local scratch space without real credentials, live data, commits, or deployment. On Windows, resolve a compatible Git Bash explicitly rather than assuming PATH's `bash` is Git Bash; verify paths containing spaces and availability of Git, Node, Corepack, and any helper-specific dependencies. Confirm execution scratch is ignored without ignoring formal specs/plans. Current upstream SDD creates a self-ignoring `.superpowers/sdd/` directory; verify this behavior for the selected version instead of adding a blanket ignore by assumption.

Preserve uncommitted work: a new worktree does not automatically include it. Update current activation statements only after installation and activation have actually been verified. These checks do not extend the desktop acceptance to CLI or optional features without the corresponding evidence above.

Upstream references for version-specific comparison: [brainstorming](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md), [writing plans](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md), [execution and review](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md), [worktrees](https://github.com/obra/superpowers/blob/main/skills/using-git-worktrees/SKILL.md), [TDD](https://github.com/obra/superpowers/blob/main/skills/test-driven-development/SKILL.md), and [finishing](https://github.com/obra/superpowers/blob/main/skills/finishing-a-development-branch/SKILL.md).
