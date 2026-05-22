# Deployment

Deployment is not implemented in Stage 0.

## Future Frontend

- Build `apps/web` as a static Vite app.
- Host static files with AWS S3 Static Website Hosting.
- Configure SPA routing fallback to `index.html`.
- Optionally add CloudFront for TLS, caching, and custom domains.

## Future API

- Deploy `apps/api` as Lambda functions behind API Gateway.
- Keep handlers thin and route to services.
- Configure server-side secrets outside Git.

## Future Jobs

- Deploy `apps/jobs` handlers as Lambda functions.
- Trigger scheduled jobs with EventBridge.
- Planned jobs include price updates, FX updates, and portfolio snapshots.

## Secrets

Use AWS Secrets Manager or SSM Parameter Store for production secrets such as Supabase service role keys and JWT configuration. Do not hard-code bucket names, account IDs, ARNs, credentials, or secrets.

## CI/CD

GitHub Actions currently installs dependencies, type-checks, and builds. Deployment workflows can be added in a later stage.
