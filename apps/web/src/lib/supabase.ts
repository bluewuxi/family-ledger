import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// TODO: Add Supabase Auth sign-in with email/password.
// TODO: Read the current Supabase session before API calls.
// This client is for authentication only; investment business table writes must go through Lambda API.
