import type { ManagedUser, UserRole } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface UserRoleRow {
  user_id: string;
  role: UserRole;
  is_active: boolean;
}

export class ManagedUserNotFoundError extends Error {
  constructor() {
    super("Managed user was not found.");
  }
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const supabase = await getSupabaseAdmin();
  const [{ data: authData, error: authError }, { data: roleRows, error: roleError }] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.from("user_roles").select("user_id, role, is_active").returns<UserRoleRow[]>()
  ]);

  if (authError) {
    throw new Error("Failed to list Supabase Auth users.");
  }

  if (roleError) {
    throw new Error("Failed to list user roles.");
  }

  const rolesByUserId = new Map((roleRows ?? []).map((row) => [row.user_id, row]));

  return authData.users
    .map((authUser) => {
      const role = rolesByUserId.get(authUser.id);
      return {
        id: authUser.id,
        email: authUser.email ?? null,
        role: role?.role ?? null,
        isActive: role?.is_active ?? false,
        createdAt: authUser.created_at,
        lastSignInAt: authUser.last_sign_in_at ?? null
      };
    })
    .sort((left, right) => {
      const leftEmail = left.email ?? "";
      const rightEmail = right.email ?? "";
      return leftEmail.localeCompare(rightEmail) || left.id.localeCompare(right.id);
    });
}

export async function updateManagedUserRole(
  userId: string,
  input: { role?: UserRole; isActive?: boolean }
): Promise<ManagedUser> {
  const supabase = await getSupabaseAdmin();
  const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(userId);

  if (authUserError || !authUserData.user) {
    throw new ManagedUserNotFoundError();
  }

  const { data: existingRole, error: existingRoleError } = await supabase
    .from("user_roles")
    .select("user_id, role, is_active")
    .eq("user_id", userId)
    .maybeSingle<UserRoleRow>();

  if (existingRoleError) {
    throw new Error("Failed to load existing user role.");
  }

  const payload: { user_id: string; role: UserRole; is_active?: boolean } = {
    user_id: userId,
    role: input.role ?? existingRole?.role ?? "viewer"
  };

  if (input.isActive !== undefined) {
    payload.is_active = input.isActive;
  }

  const { data: role, error: roleError } = await supabase
    .from("user_roles")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, role, is_active")
    .single<UserRoleRow>();

  if (roleError) {
    throw new Error("Failed to update user role.");
  }

  const authUser = authUserData.user;
  return {
    id: authUser.id,
    email: authUser.email ?? null,
    role: role.role,
    isActive: role.is_active,
    createdAt: authUser.created_at,
    lastSignInAt: authUser.last_sign_in_at ?? null
  };
}
