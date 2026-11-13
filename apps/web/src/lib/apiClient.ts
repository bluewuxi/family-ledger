import { parseApiErrorDetails, type ApiErrorDetails, type ApiResponse } from "@family-ledger/shared";
import { observeAccountScope, reloadAccountScope } from "./accountScopeState";
import { isLocalAuthBypassEnabled, LOCAL_AUTH_BYPASS_TOKEN } from "./localAuthBypass";
import { getRuntimeConfig } from "./runtimeConfig";
import { getCurrentSession, loadSession, notifyAuthSessionExpired } from "./authClient";
import { cachedRead, clearReadCache, setReadCacheIdentity } from "./readCache";

export class ApiClientError extends Error {
  readonly details?: ApiErrorDetails;
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    details?: unknown
  ) {
    super(message);
    this.details = parseApiErrorDetails(details);
  }
}

interface ApiRequestOptions {
  cacheMs?: number;
  bypassCache?: boolean;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const config = getRuntimeConfig();
  const { apiBaseUrl } = config;

  if (!apiBaseUrl) {
    throw new ApiClientError("缺少 API 地址配置。", "MISSING_API_BASE_URL");
  }

  const session = isLocalAuthBypassEnabled(config) ? null : await Promise.resolve(getCurrentSession());
  const token = isLocalAuthBypassEnabled(config) ? LOCAL_AUTH_BYPASS_TOKEN : session?.access_token;
  setReadCacheIdentity(isLocalAuthBypassEnabled(config) ? "local" : session?.user.id ?? null);

  if (!token) {
    notifyAuthSessionExpired();
    throw new ApiClientError("登录状态已失效，请重新登录。", "MISSING_SESSION");
  }

  const request = async (): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      authorization: `Bearer ${token}`
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const body = (await response.json()) as ApiResponse<T>;
  if (getCurrentSession()?.access_token !== token && !isLocalAuthBypassEnabled(config)) throw new ApiClientError("登录状态已变化，请重新加载。", "STALE_SESSION");
  const scopeToken = response.headers.get("x-account-scope");
  if (scopeToken) {
    const change = observeAccountScope(scopeToken);
    if (change === "stale") throw new ApiClientError("账户权限已更新，请重新加载。", "STALE_SCOPE");
    if (change === "changed") {
      await reloadAccountScope({
        clearCache: clearReadCache,
        remount: () => window.dispatchEvent(new Event("family-ledger:account-scope")),
        refreshSession: loadSession
      });
      throw new ApiClientError("账户权限已更新，正在重新加载。", "SCOPE_CHANGED");
    }
  }

  if (!response.ok || !body.success) {
    const error = body.success ? null : body.error;
    if (response.status === 401 || error?.code === "UNAUTHORIZED") {
      if (getCurrentSession()?.access_token === token) notifyAuthSessionExpired();
      throw new ApiClientError("登录状态已失效，请重新登录。", "MISSING_SESSION", response.status);
    }

    if (error?.code === "PASSWORD_CHANGE_REQUIRED" && getCurrentSession()?.access_token === token) await loadSession();
    throw new ApiClientError(error?.message ?? "API 请求失败。", error?.code ?? "HTTP_ERROR", response.status, error?.details);
  }

  if (options.method && options.method !== "GET") clearReadCache();
  return body.data;
  };
  // Always reauthorize private reads; only deduplicate concurrent requests.
  return !options.method || options.method === "GET"
    ? cachedRead(`${apiBaseUrl}${path}`, request, 0, options.bypassCache)
    : request();
}

export function apiGet<T>(path: string, options: Pick<ApiRequestOptions, "cacheMs" | "bypassCache"> = {}): Promise<T> {
  return apiRequest<T>(path, options);
}

export function apiPost<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body, idempotencyKey });
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PUT", body });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", body });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE" });
}
