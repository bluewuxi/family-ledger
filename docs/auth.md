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
- POST/PUT/PATCH/DELETE endpoints: `admin` only
- maintenance/job endpoints: `admin` only

No active `user_roles` row means access denied.

The server-side Supabase key is stored in AWS SSM Parameter Store and must never be exposed to `apps/web`.

## First Admin

After creating the first Supabase Auth user, assign the initial admin role from trusted SQL tooling such as the Supabase SQL Editor:

```sql
insert into public.user_roles (user_id, role, is_active)
values ('<auth-user-id>', 'admin', true)
on conflict (user_id)
do update set role = excluded.role, is_active = true;
```

Do not add role-management UI until a later stage.
