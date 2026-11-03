# Shared Package Instructions

Apply these instructions to `packages/shared` together with the root rules; shared changes trigger reading for every affected consumer.

- Keep DTOs, validators, parsers, and calculations in focused modules, with package exports where appropriate; follow [code organization](../../docs/architecture.md#code-organization).
- Trace API, jobs, and web consumers before changing a type, validator, enum-like value, or export. Reconcile the affected [API contract](../../docs/api.md) and [product contract](../../docs/README.md#maintained-sources) rather than assuming compiler success proves compatibility.
- Reuse the authoritative decimal calculation approach and preserve exact string boundaries from [financial values](../../docs/data-model.md#financial-values); do not substitute floating-point arithmetic for persisted financial semantics.
- Reuse shared business-date and provider-date helpers according to the [time policy](../../docs/time-policy.md); changing a helper must preserve its cross-layer meaning.
- Keep reusable calculations independent of credentials, persistence, and UI responsibilities. Reuse shared provider parsers across API/jobs instead of copying logic; check [architecture](../../docs/architecture.md#code-organization) and [market-data semantics](../../docs/data-model.md#market-data-foundation).
