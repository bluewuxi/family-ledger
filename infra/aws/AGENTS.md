# AWS Infrastructure Instructions

Apply these instructions to `infra/aws` together with the root rules and the maintained deployment contracts.

- Review templates and parameters together with deployment tooling, public runtime configuration, and live-equivalence gates. Follow [deployment](../../docs/deployment.md) and the [TEST contract](../../docs/test-auto-deployment.md#independent-changes).
- Derive resource identifiers and configuration through existing mechanisms; keep server secrets runtime-resolved and public configuration public-only. Consult [architecture](../../docs/architecture.md#boundaries) and [secret handling](../../docs/deployment.md#secrets).
- Identify independent IAM, schedule, runtime, resource, and configuration changes before proposing execution. Do not classify them as ordinary code publication; apply the [code-only boundary](../../docs/test-auto-deployment.md#independent-changes) and [delivery scope](../../docs/project-workflow.md#delivery-scope-and-workflow).
- Preserve Scheduler context, timezone, retry, and failed-job semantics when reviewing jobs infrastructure. Read [scheduled jobs](../../docs/deployment.md#scheduled-jobs) and the [time policy](../../docs/time-policy.md) together.
- Route approvals, registration, deployment locks, and recovery to the [TEST procedure](../../docs/test-auto-deployment.md). Preserve existing gates; planning or a failed automatic release does not authorize configuration mutation or manual recovery.
