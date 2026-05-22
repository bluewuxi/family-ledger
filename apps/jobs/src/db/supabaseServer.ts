import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getJobsServerConfig } from "../config/serverConfig";

let supabaseAdmin: SupabaseClient | null = null;

export async function getSupabaseAdmin(): Promise<SupabaseClient> {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  const config = await getJobsServerConfig();

  // Jobs use trusted server-side Supabase access and will run in Lambda triggered by EventBridge.
  supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return supabaseAdmin;
}
