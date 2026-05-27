import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RuntimeConfig } from "./runtimeConfig";

let supabaseClient: SupabaseClient | null = null;

export function initializeSupabaseClient(config: RuntimeConfig): SupabaseClient {
  supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey);
  return supabaseClient;
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error("Supabase client has not been initialized.");
  }

  return supabaseClient;
}
