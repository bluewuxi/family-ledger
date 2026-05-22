import type { UserRole } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface UserRoleRow {
  role: UserRole;
}

export class UserRoleNotFoundError extends Error {
  constructor() {
    super("No active role found for this user.");
  }
}

export async function getUserRole(userId: string): Promise<UserRole> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle<UserRoleRow>();

  if (error) {
    throw new Error("Failed to load user role.");
  }

  if (!data) {
    throw new UserRoleNotFoundError();
  }

  return data.role;
}
