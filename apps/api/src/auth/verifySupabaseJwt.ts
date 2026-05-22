import type { AuthenticatedUser } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

export class InvalidTokenError extends Error {
  constructor() {
    super("Invalid access token.");
  }
}

export async function verifySupabaseJwt(token: string): Promise<Omit<AuthenticatedUser, "role">> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new InvalidTokenError();
  }

  return {
    id: data.user.id,
    email: data.user.email ?? ""
  };
}
