import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getApiServerConfig } from "../config/serverConfig";

let supabaseAdmin: SupabaseClient | null = null;

export async function getSupabaseAdmin(): Promise<SupabaseClient> {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  const config = await getApiServerConfig();

  // This server-side client must never be imported by frontend code.
  supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return supabaseAdmin;
}
