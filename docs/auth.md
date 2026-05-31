# Auth

Supabase Auth provides identity. The frontend uses Supabase Auth for email/password login and access token acquisition only.

Expected flow:

```text
Frontend login with Supabase Auth
  -> frontend receives access token
  -> frontend calls Lambda API with Authorization: Bearer <token>
  -> Lambda verifies token with Supabase Auth
  -> Lambda loads role from user_roles
  -> Lambda authorizes request
```

## Roles

Only two application roles exist:

- `viewer`: read-only access
- `admin`: read, write, update, delete, and manage access

These roles apply to access to the shared family ledger. They do not mean users own separate investment data.

The expected number of users is no more than 3 family members. Complex RBAC, organizations, teams, workspaces, invitations, and permission matrices are intentionally avoided.

## Enforcement

Lambda API enforces permissions. Frontend role checks are UI hints only.

- GET endpoints: `viewer` and `admin`
- POST/PUT/PATCH/DELETE endpoints: `admin` only, except `PATCH /settings/preferences`, which lets each authenticated `viewer` or `admin` update their own display preferences, and `POST /accounts/:id/trading-password/reveal`, which is available to `viewer` and `admin` after the extra password check
- maintenance/job endpoints: `admin` only

No active `user_roles` row means access denied. Admin users can pause/resume existing Supabase Auth users and maintain their `viewer` / `admin` role from the Settings page.

The server-side Supabase key is stored in AWS SSM Parameter Store and must never be exposed to `apps/web`. Browser Supabase sessions use `sessionStorage` so tokens do not persist after the browser session ends.

Trading account passwords are protected by a second shared password gate. The gate is an SSM SecureString parameter whose value is either `empty` before first setup or a salted scrypt verifier of the extra password. Admins maintain the extra password from Settings. A viewer can reveal a trading password only if they know this extra password after it has been initialized; updating the stored trading password remains admin-only. There is no paid WAF-based lockout in the default stack; keep the extra password strong.

## User Management

Create Auth users in the Supabase console. The app intentionally does not create, invite, edit email addresses, or delete Auth users. For this family ledger, keep the expected user count to no more than three.

Admins can manage existing users through the Lambda API:

- View Supabase Auth users.
- Set role to `viewer` or `admin`.
- Pause access by setting `user_roles.is_active = false`.
- Resume access by setting `user_roles.is_active = true`.

Password reset is self-service from the login screen. Supabase Auth sends reset emails and redirects the user back to the app to set a new password. Configure Supabase SMTP or allowed recipient settings in the Supabase project as needed.

## First Admin

After creating the first Supabase Auth user, assign the initial admin role from trusted SQL tooling such as the Supabase SQL Editor:

```sql
insert into public.user_roles (user_id, role, is_active)
values ('<auth-user-id>', 'admin', true)
on conflict (user_id)
do update set role = excluded.role, is_active = true;
```
