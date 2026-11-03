# Web Instructions

Apply these instructions to `apps/web`, including colocated client checks, together with the root rules and all affected cross-layer reading routes.

- Use existing API/auth clients for data access. Keep role and account-scope checks as UI hints; server authorization remains authoritative. Follow [architecture](../../docs/architecture.md#code-organization) and [Auth](../../docs/auth.md#enforcement).
- Reuse existing business-date, decimal, formatting, cache, and navigation helpers for their intended roles. Frontend decimal helpers support display and local validation; authoritative financial calculations remain server-side. Read the [time policy](../../docs/time-policy.md) and affected [product specification](../../docs/README.md#maintained-sources).
- When changing private reads, preserve session/scope invalidation, cancellation, deduplication, loading, and refresh behavior. Check the [session lifecycle](../../docs/auth.md#password-and-session-lifecycle) and [read verification](../../docs/local-testing.md#loading-and-account-detail-verification-2026-10-12).
- Preserve runtime configuration precedence and initialization. Diagnose deployed API URLs using the generated runtime file and the [runtime-configuration procedure](../../docs/project-workflow.md#frontend-verification-and-runtime-configuration).
- Follow [frontend guidelines](../../docs/frontend-guidelines.md) and the affected product contract for visible changes, including shared navigation, accessible states, and mobile tables.
- Route browser verification through [authenticated acceptance](../../docs/local-testing.md#authenticated-browser-acceptance), preserving user login/readiness and the complete viewport procedure. Report implementation, deployment, and visual acceptance separately under the [completion contract](../../docs/project-workflow.md#completion-reporting).
