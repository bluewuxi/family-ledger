# Authentication Recovery

This procedure is operator-only. Preparing scripts does not authorize provisioning, password reset, SQL writes, DynamoDB restore, or deployment. Use the exact reviewed environment and stable application UUID; never place passwords in command arguments, files, logs or chat.

## Provision or reset a user

The local `.env.<environment>` must select the verified database and `AUTH_TABLE_NAME`. Existing backend database credentials resolve from SSM. The operator needs only the environment's SQL service access and DynamoDB item/transaction permissions. The browser never receives those credentials.

Run from an interactive terminal, only after explicit authorization:

```powershell
corepack pnpm exec tsx scripts/manage-auth-user.ts provision --env test --user-id <uuid> --email <email> --role admin --apply
corepack pnpm exec tsx scripts/manage-auth-user.ts reset --env test --user-id <uuid> --apply
corepack pnpm exec tsx scripts/manage-auth-user.ts provision --env test --user-id <uuid> --email <email> --role viewer --random-password --apply
corepack pnpm exec tsx scripts/manage-auth-user.ts activate-first-admin --env test --user-id <admin-uuid> --email <admin-email> --apply
```

Without --random-password, the prompts accept a temporary password twice without echoing it. With --random-password, provision/reset generates 24 random bytes as a 32-character base64url temporary password in process; it is not printed or written to files, environment or logs. Plaintext references are released after hashing (JavaScript does not guarantee memory erasure). The administrator can later reset an undisclosed random password. Provision refuses existing credentials and does not silently reset them. Reset does not create an unknown SQL identity or activate access. Passwords expire after 24 hours and require change on first login. Send the temporary password manually through an appropriate separate channel; the command never prints it.

Provisioning creates/retains the stable identity and profile, initializes inactive access, and then conditionally creates credentials. A failure between stores can leave a partial inactive user. Inspect both stores before retrying; if credentials now exist, use explicit reset rather than replaying provision. Profile preference values are not overwritten. Activation is separate: an existing admin can resume the user. The activate-first-admin operation requires matching UUID/email, an existing admin role and valid credentials, revokes prior sessions, then calls the service-role-only revision-checked activate_first_app_admin RPC. Apply 20261031110000_first_admin_activation.sql before using it. The RPC refuses another active administrator, a stale revision or a non-admin target; it does not promote users. A repeated activation reloads the revision and revokes sessions again; partial failure never rolls back a newer permission change. Run this only during the authorized maintenance/bootstrap window.

For the first administrator or a sole administrator who lost their password, use operator reset. Preserve the UUID and role. No email recovery or application self-reset endpoint exists.

## Authentication-table loss or PITR recovery

Never reconnect a restored DynamoDB table directly. PITR can restore previously revoked sessions and old passwords, including passwords for inactive users.

1. Place the application in maintenance and quarantine the restored table from API IAM/configuration.
2. Discard every restored session/rate item and every restored user password verifier, including inactive identities. For two users, using a fresh verified table and reprovisioning credentials is simplest. No old credential payload is imported.
3. Use authoritative `app_users` and current `user_roles` from SQL. Reprovision enabled users with new temporary passwords; leave inactive users without credentials until explicitly provisioned before future resume.
4. Verify old tokens and passwords fail, temporary-password login allows only password change, inactive users remain denied, and current permissions apply.
5. Independently verify/register the new table/configuration and reconnect through the authorized cutover procedure. Record target environment, commit and sanitized evidence. Do not include passwords, tokens, email mappings or exported credential items in release records.

Ledger backups contain identities and permissions, not credentials. Restoring SQL is not a synchronized authentication-store restore. A fresh auth table plus new temporary credentials avoids reviving historical secrets.
