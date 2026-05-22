import { resolveSecureParameter } from "./ssm";

export interface ApiServerConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

let cachedConfig: ApiServerConfig | null = null;

function getFirstEnvValue(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key];

    if (value) {
      return value;
    }
  }

  return null;
}

export async function getApiServerConfig(): Promise<ApiServerConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? null;
  const supabaseUrlParam = process.env.SUPABASE_URL_PARAM ?? null;
  const serviceKeyParam = getFirstEnvValue(["SUPABASE_SECRET_KEY_SSM_PARAM", "SUPABASE_SERVICE_ROLE_KEY_PARAM"]);

  const resolvedSupabaseUrl = supabaseUrl ?? (supabaseUrlParam ? await resolveSecureParameter(supabaseUrlParam) : null);

  if (!resolvedSupabaseUrl) {
    throw new Error("SUPABASE_URL or SUPABASE_URL_PARAM is required.");
  }

  if (!serviceKeyParam) {
    throw new Error("SUPABASE_SECRET_KEY_SSM_PARAM or SUPABASE_SERVICE_ROLE_KEY_PARAM is required.");
  }

  cachedConfig = {
    supabaseUrl: resolvedSupabaseUrl,
    supabaseServiceRoleKey: await resolveSecureParameter(serviceKeyParam)
  };

  return cachedConfig;
}
