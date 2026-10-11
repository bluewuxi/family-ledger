import { logDependencyError, logAuthenticationError, registerLogSecret } from "../utils/errorLogging";
import type { AuthenticatedUser } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

export class InvalidTokenError extends Error {
  override readonly name = "InvalidTokenError";
  constructor() {
    super("Invalid access token.");
  }
}

export async function verifySupabaseJwt(token: string): Promise<Omit<AuthenticatedUser, "role">> {
  registerLogSecret(token, true);
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    if (error?.code === "DEPENDENCY_UNAVAILABLE") logDependencyError("verifySupabaseJwt.verifySupabaseJwt", error);
    logAuthenticationError("verifySupabaseJwt.verifySupabaseJwt", error);
    throw new InvalidTokenError();
  }

  return {
    id: data.user.id,
    email: data.user.email ?? ""
  };
}
