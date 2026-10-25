# TEST automatic deployment

## Release contract

CI runs on `main`, `test`, and pull requests. A successful `test` push calls the reusable **Deploy TEST** workflow when the repository variable `TEST_AUTO_DEPLOY_ENABLED` is `true`. Deterministic build/check jobs have no AWS credentials. A manual dispatch repeats those checks and accepts only `test`. GitHub requires a dispatchable workflow to exist on the default branch; until this workflow is promoted to `main`, use **Re-run all jobs** on the `test` CI run for controlled manual releases. Keep `main` as the default branch.

The deployment job uses the branch-restricted `test` Environment and OIDC temporary credentials. GitHub concurrency prevents overlapping running releases; an SSM lock also excludes operator registration. New pushes never interrupt an active release. Queued releases check the branch head before mutation and exit if superseded. Runner loss or cancellation can leave a stale lock requiring operator recovery.

Only documentation changes skip deployment. Other changes publish backend and frontend. Identical-commit reruns are supported. No SQL, data repair, production deployment, issue closure, or authenticated visual acceptance is performed automatically.

## Bootstrap

Run `corepack pnpm deploy:bootstrap:test` with operator AWS/GitHub credentials. It creates the separate `family-ledger-test-delivery` stack: a private encrypted versioned artifact bucket, a restricted CloudFormation execution role and a GitHub OIDC deployment role. Existing OIDC providers are reused only with the STS audience. The repository's actual OIDC subject prefix is discovered, including immutable identifiers when enabled.

The bootstrap sets Environment variables `AWS_REGION`, `DEPLOY_ROLE_ARN`, `DEPLOY_EXECUTION_ROLE_ARN` and `DEPLOY_ARTIFACT_BUCKET`. No AWS identifiers are committed. Public web configuration comes from checked-in public values, optionally overridden by `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; use identical values during infrastructure registration. No private environment files or financial data are uploaded as workflow artifacts. Actions and SAM CLI are pinned; AWS CLI v2 comes from the fixed Ubuntu runner image.

The execution role can also read the exact S3 objects used by currently deployed Lambda packages, discovered during bootstrap. This preserves CloudFormation's ability to restore the previous code during a failed first update, without granting access to unrelated buckets or ledger backups. This is stack-update recovery, not automatic rollback after a failed application smoke check.

Read-only permissions include the existing hosted-zone parameter validation, existing IAM role metadata/policy reads for ARN resolution, and CloudFormation's Lambda stabilization reads, restricted to the configured zone/roles/functions. DNS records, runtime settings, API configuration and IAM policies remain unwritable. A fully completed update rollback is a stable retry state; in-progress or failed rollback states remain blocked.

Independently confirm current migration effects, live infrastructure and the existing release. At a clean `test` checkout initialize the baseline:

```text
corepack pnpm deploy:register:test bootstrap <full-HEAD-SHA> <verification-evidence-reference>
```

Historical migrations are never replayed by registration. Set repository variable `TEST_AUTO_DEPLOY_ENABLED=true`, manually rerun CI for the first controlled release, then leave it enabled for later pushes. Setting it to `false` pauses push deployment, but does not interrupt an active release or disable explicit dispatch.

## Independent changes

SSM records under `/family-ledger/test-deployment/` hold complete migration paths/hashes, infrastructure/configuration hashes, confirmation SHA/time and evidence. Records are losslessly compressed to standard parameter size; oversize or absent records fail closed. The migration gate compares the complete target manifest, including modified/deleted files, against `migration-approval`. Later commits reuse confirmation only while the full manifest remains identical.

After independent migration application and focused verification, register the clean verified commit:

```text
corepack pnpm deploy:register:test migrations <full-HEAD-SHA> <verification-evidence-reference>
```

This is an operator attestation, not proof that SQL ran. Retain schema/data verification evidence before registration. CI cannot write approvals or read database passwords, service keys, trading secrets or backups.

Source templates, parameters and public runtime configuration must match `infrastructure-approval`. The pipeline also compares live configuration, generated package and actual change-set details. Only existing Lambda code updates pass. A schedule dependency reevaluation is allowed only for its unchanged existing function ARN; additions, deletions, replacements, IAM, runtime/schedule changes and unknown changes stop publication. The inspected change set itself is executed, never regenerated.

Classification uses CloudFormation's standard executable change listing. The optional property-value preview can expand unchanged intrinsic references into `KNOWN_AFTER_APPLY` placeholders, including unrelated DNS and role fields; it is not used as the executable change list. Full source/package equivalence and live schedule checks remain mandatory.

The invocation policies and explicit API integration URIs use ARNs derived from the existing Lambda function names rather than `GetAtt` dependencies. This preserves exactly the same allowed resources, routes and integration settings while preventing code-only changes from inducing IAM or API Gateway updates. Introducing or changing a function name still requires independent infrastructure review; do not restore dynamic references or grant IAM/API configuration writes to the automated execution role to bypass this gate.

For independent infrastructure changes, pause push deployment and ensure no run is active. The existing local TEST deployment commands acquire the shared SSM lock automatically; other operator scripts must use `acquireLock` from the deployment runtime. The restricted execution role remains attached to the application stack after automatic deployment: independent infrastructure commands must set `DEPLOY_OPERATOR_ROLE_ARN` to an independently reviewed operator CloudFormation role. The next automatic update restores the restricted role. After successful independent verification register:

```text
corepack pnpm deploy:register:test infrastructure <full-HEAD-SHA> <verification-evidence-reference>
```

Registration acquires the shared lock automatically and never bypasses the other approval gate. Independent releases/registrations must not overlap automatic runs.

## Publication and recovery

Lambda artifacts and templates are retained in the private artifact bucket. Lambda bundling uses the locked workspace esbuild and the existing SAM build metadata; SAM validates and packages the generated template. This avoids SAM's source-copy step traversing pnpm workspace links and avoids installing a second, unlocked npm dependency tree. Schedule dependency reevaluation also checks actual Scheduler configuration against resolved existing resource ARNs before execution, so out-of-band schedule drift blocks release. One checked change set uses previous stack parameters, then waits for CloudFormation and Lambda success; empty changes proceed normally. Web publication uploads hashed assets first, other public files second, and `index.html` last. Old hashed assets remain available to open pages. CloudFront invalidation must complete before live checks.

Live checks verify API health, unauthenticated rejection, public runtime configuration, exact HTML and referenced JS/CSS entry assets. The summary records commit, artifact digest and run link. `last-success` advances only after verification; `status` records current/failed phase. Failure after backend mutation can leave a partial release. There is no automatic rollback: inspect AWS state, fix and rerun, or push a corrective commit. Reverting code never undoes migrations. Login-dependent browser/mobile acceptance remains separate.

For a stale lock, pause automatic pushes, confirm the owning run ended and CloudFormation is stable, inspect/cancel pending runs, then delete only `/family-ledger/test-deployment/lock` using operator credentials. Never remove a lock whose owner might still mutate TEST. Independent application recovery must be registered only after verification.

`verify:deployment` typechecks tooling and tests complete manifests, conservative risk classification, SAM normalization, pinned workflows, smoke-check failures/timeouts and identical-release retries. Live destructive migration/infrastructure rejection is verified with fixtures rather than modifying real financial data for tests.
