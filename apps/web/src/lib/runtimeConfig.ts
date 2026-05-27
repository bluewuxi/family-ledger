export interface RuntimeConfig {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

type RuntimeConfigInput = Partial<Record<keyof RuntimeConfig, string | undefined>>;

let runtimeConfig: RuntimeConfig | null = null;

export async function initializeRuntimeConfig(): Promise<RuntimeConfig> {
  const fileConfig = await loadRuntimeConfigFile();
  const fallbackConfig: RuntimeConfigInput = {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
  };

  runtimeConfig = normalizeRuntimeConfig({ ...fallbackConfig, ...fileConfig });
  return runtimeConfig;
}

export function getRuntimeConfig(): RuntimeConfig {
  if (!runtimeConfig) {
    throw new Error("Runtime config has not been initialized.");
  }

  return runtimeConfig;
}

async function loadRuntimeConfigFile(): Promise<RuntimeConfigInput> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: "no-store" });

    if (response.status === 404) {
      return {};
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.toLowerCase().includes("application/json")) {
      return {};
    }

    const value = (await response.json()) as unknown;
    if (!isRecord(value)) {
      return {};
    }

    return {
      apiBaseUrl: readString(value, "apiBaseUrl"),
      supabaseUrl: readString(value, "supabaseUrl"),
      supabaseAnonKey: readString(value, "supabaseAnonKey")
    };
  } catch {
    return {};
  }
}

function normalizeRuntimeConfig(input: RuntimeConfigInput): RuntimeConfig {
  return {
    apiBaseUrl: normalizeRequiredUrl(input.apiBaseUrl, "apiBaseUrl"),
    supabaseUrl: normalizeRequiredUrl(input.supabaseUrl, "supabaseUrl"),
    supabaseAnonKey: normalizeRequiredString(input.supabaseAnonKey, "supabaseAnonKey")
  };
}

function normalizeRequiredUrl(value: string | undefined, key: keyof RuntimeConfig): string {
  const normalized = normalizeRequiredString(value, key);
  return normalized.replace(/\/+$/, "");
}

function normalizeRequiredString(value: string | undefined, key: keyof RuntimeConfig): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`Missing runtime config value: ${key}.`);
  }

  return normalized;
}

function readString(record: Record<string, unknown>, key: keyof RuntimeConfig): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
