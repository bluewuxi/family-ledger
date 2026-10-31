import type { AuthSession } from "./authClient";
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

export function createLocalAuthBypassSession(): AuthSession {
  return { access_token: LOCAL_AUTH_BYPASS_TOKEN, expiresAt: new Date(Date.now() + 86400000).toISOString(), mustChangePassword: false,
    user: { id: "local-auth-bypass-user", email: LOCAL_AUTH_BYPASS_EMAIL, role: "admin" } };
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
