import type { ApiResponse } from "@family-ledger/shared";
import { isLocalAuthBypassEnabled, LOCAL_AUTH_BYPASS_TOKEN } from "./localAuthBypass";
import { getRuntimeConfig } from "./runtimeConfig";
import { getCurrentSession, notifyAuthSessionExpired } from "./supabase";
import { cachedRead, clearReadCache, setReadCacheIdentity } from "./readCache";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number
  ) {
    super(message);
  }
}

interface ApiRequestOptions {
  cacheMs?: number;
  bypassCache?: boolean;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const config = getRuntimeConfig();
  const { apiBaseUrl } = config;

  if (!apiBaseUrl) {
    throw new ApiClientError("缺少 API 地址配置。", "MISSING_API_BASE_URL");
  }

  const session = isLocalAuthBypassEnabled(config) ? null : await getCurrentSession();
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
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      authorization: `Bearer ${token}`
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const body = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !body.success) {
    const error = body.success ? null : body.error;
    if (response.status === 401 || error?.code === "UNAUTHORIZED") {
      notifyAuthSessionExpired();
      throw new ApiClientError("登录状态已失效，请重新登录。", "MISSING_SESSION", response.status);
    }

    throw new ApiClientError(error?.message ?? "API 请求失败。", error?.code ?? "HTTP_ERROR", response.status);
  }

  if (options.method && options.method !== "GET") clearReadCache();
  return body.data;
  };
  const mayCache = path === "/instruments" || path.startsWith("/portfolio-snapshots?");
  return !options.method || options.method === "GET"
    ? cachedRead(`${apiBaseUrl}${path}`, request, mayCache ? options.cacheMs ?? (path === "/instruments" ? 60_000 : 0) : 0, options.bypassCache)
    : request();
}

export function apiGet<T>(path: string, options: Pick<ApiRequestOptions, "cacheMs" | "bypassCache"> = {}): Promise<T> {
  return apiRequest<T>(path, options);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body });
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
