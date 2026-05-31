import { createClient } from "@supabase/supabase-js";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { RuntimeConfig } from "./runtimeConfig";

let supabaseClient: SupabaseClient | null = null;
let supabaseStorageKey: string | null = null;
const authSessionExpiredEvent = "family-ledger:auth-session-expired";

export function initializeSupabaseClient(config: RuntimeConfig): SupabaseClient {
  supabaseStorageKey = getSupabaseStorageKey(config.supabaseUrl);
  supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      storage: window.sessionStorage,
      storageKey: supabaseStorageKey
    }
  });
  clearLegacyLocalSupabaseSession();
  return supabaseClient;
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error("Supabase client has not been initialized.");
  }

  return supabaseClient;
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.getSession();

  if (!error) {
    return data.session;
  }

  if (isStaleRefreshTokenError(error)) {
    await clearStaleSupabaseSession();
    return null;
  }

  throw error;
}

export function clearPersistedSupabaseSession(): void {
  if (!supabaseStorageKey || typeof window === "undefined") {
    return;
  }

  for (const storage of [window.sessionStorage, window.localStorage]) {
    storage.removeItem(supabaseStorageKey);
    storage.removeItem(`${supabaseStorageKey}-code-verifier`);
    storage.removeItem(`${supabaseStorageKey}-user`);
  }
}

export function notifyAuthSessionExpired(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(authSessionExpiredEvent));
}

export function subscribeAuthSessionExpired(listener: () => void): () => void {
  window.addEventListener(authSessionExpiredEvent, listener);
  return () => window.removeEventListener(authSessionExpiredEvent, listener);
}

async function clearStaleSupabaseSession(): Promise<void> {
  clearPersistedSupabaseSession();
  notifyAuthSessionExpired();
  await getSupabaseClient().auth.signOut({ scope: "local" });
}

function getSupabaseStorageKey(supabaseUrl: string): string {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

function clearLegacyLocalSupabaseSession(): void {
  if (!supabaseStorageKey || typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(supabaseStorageKey);
  window.localStorage.removeItem(`${supabaseStorageKey}-code-verifier`);
  window.localStorage.removeItem(`${supabaseStorageKey}-user`);
}

function isStaleRefreshTokenError(error: unknown): boolean {
  if (!isObject(error)) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code.toLowerCase() : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return (
    code === "refresh_token_not_found" ||
    code === "invalid_refresh_token" ||
    message.includes("refresh token not found") ||
    message.includes("invalid refresh token")
  );
}

function isObject(value: unknown): value is { code?: unknown } {
  return typeof value === "object" && value !== null;
}
