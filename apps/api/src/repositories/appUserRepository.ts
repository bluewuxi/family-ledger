import { getSupabaseAdmin } from "../db/supabaseServer";

export interface AppUser {
  id: string;
  email: string;
  createdAt: string;
}

interface AppUserRow {
  id: string;
  email: string;
  created_at: string;
}

async function findUser(column: "id" | "email", value: string): Promise<AppUser | null> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.from("app_users").select("id,email,created_at")
    .eq(column, value).maybeSingle<AppUserRow>();
  if (error) throw new Error("Application identity store is unavailable.");
  return data ? { id: data.id, email: data.email, createdAt: data.created_at } : null;
}

export function findAppUserByEmail(email: string): Promise<AppUser | null> {
  return findUser("email", email.trim().toLowerCase());
}

export function getAppUserById(id: string): Promise<AppUser | null> {
  return findUser("id", id);
}
