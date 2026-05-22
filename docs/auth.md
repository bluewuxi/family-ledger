# Auth

Supabase Auth provides identity. The frontend will use Supabase Auth for login and token acquisition only.

Expected flow:

```text
Frontend login with Supabase Auth
  -> frontend receives access token
  -> frontend calls Lambda API with Authorization: Bearer <token>
  -> Lambda verifies token
  -> Lambda loads role from user_roles
  -> Lambda authorizes request
```

## Roles

Only two application roles are planned:

- `viewer`: read-only access
- `admin`: read, write, update, delete, and manage access

The expected number of users is no more than 3 family members. Complex RBAC, organizations, teams, workspaces, invitations, and permission matrices are intentionally avoided.

## Enforcement

Lambda API enforces permissions. Frontend role checks are UI hints only.

General rule:

- GET endpoints: `viewer` and `admin`
- POST/PUT/PATCH/DELETE endpoints: `admin` only
- maintenance/job endpoints: `admin` only

Stage 0 contains placeholders only. Real Supabase JWT verification and `user_roles` loading are planned for Stage 1.
