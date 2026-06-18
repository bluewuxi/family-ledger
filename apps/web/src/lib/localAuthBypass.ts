import type { Session, User } from "@supabase/supabase-js";
import type { RuntimeConfig } from "./runtimeConfig";

export const LOCAL_AUTH_BYPASS_TOKEN = "family-ledger-local-dev-auth-bypass";
export const LOCAL_AUTH_BYPASS_EMAIL = "ricky.yu@outlook.com";

export function isLocalAuthBypassEnabled(config: RuntimeConfig): boolean {
  return (
    import.meta.env.DEV === true &&
    import.meta.env.VITE_LOCAL_AUTH_BYPASS === "true" &&
    isLocalBrowserHost(window.location.hostname) &&
    isLocalUrl(config.apiBaseUrl)
  );
}

export function createLocalAuthBypassSession(): Session {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: "local-auth-bypass-user",
    aud: "authenticated",
    role: "authenticated",
    email: LOCAL_AUTH_BYPASS_EMAIL,
    email_confirmed_at: new Date(now * 1000).toISOString(),
    phone: "",
    confirmed_at: new Date(now * 1000).toISOString(),
    last_sign_in_at: new Date(now * 1000).toISOString(),
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: new Date(now * 1000).toISOString(),
    updated_at: new Date(now * 1000).toISOString(),
    is_anonymous: false
  } satisfies User;

  return {
    access_token: LOCAL_AUTH_BYPASS_TOKEN,
    token_type: "bearer",
    expires_in: 60 * 60 * 24,
    expires_at: now + 60 * 60 * 24,
    refresh_token: "local-auth-bypass-refresh-token",
    user
  };
}

function isLocalBrowserHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return isLocalBrowserHost(url.hostname);
  } catch {
    return false;
  }
}
