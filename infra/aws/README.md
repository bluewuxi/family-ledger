# AWS Infrastructure

Stage 0 does not deploy AWS resources.

Future infrastructure will cover:

- S3 Static Website Hosting for `apps/web`
- Optional CloudFront distribution
- API Gateway and Lambda for `apps/api`
- EventBridge schedules and Lambda jobs for `apps/jobs`
- Secrets Manager or SSM Parameter Store for server-side secrets

Do not commit account IDs, bucket names, ARNs, credentials, or secrets.
