import type { AuthenticatedUser } from "@family-ledger/shared";
import { getRuntimeConfig } from "./runtimeConfig";
import { clearReadCache, setReadCacheIdentity } from "./readCache";
export interface AuthSession { access_token: string; expiresAt: string; mustChangePassword: boolean; user: AuthenticatedUser }
interface SessionResponse { user: AuthenticatedUser; expiresAt: string; mustChangePassword: boolean }
const storageKey = "family-ledger:session";
const eventName = "family-ledger:auth-state";
let session: AuthSession | null = null;
let generation = 0;
export class AuthClientError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(status === 429 ? "操作过于频繁，请稍后再试。" : status === 503 ? "登录服务暂时不可用，请稍后重试。" : status === 401 ? "邮箱或密码不正确，或登录状态已失效。" : "操作未完成，请检查输入或稍后重试。");
  }
}
export function clearLegacyAuthStorage(): void {
  for (const storage of [window.localStorage, window.sessionStorage]) for (const key of Object.keys(storage)) {
    if (/^sb-.+-auth-token(?:-code-verifier|-user)?$/.test(key)) storage.removeItem(key);
  }
}
function storedToken(): string | null {
  const stored = window.sessionStorage.getItem(storageKey);
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as { token?: unknown; expiresAt?: unknown };
    if (typeof value.token === "string" && typeof value.expiresAt === "string" && Date.parse(value.expiresAt) > Date.now()) return value.token;
  } catch { /* Invalid local state requires a fresh login. */ }
  clearAuthSession(); return null;
}
async function request<T>(path: string, method = "GET", body?: unknown, token = storedToken()): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getRuntimeConfig().apiBaseUrl}${path}`, {
      method, cache: "no-store", headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch { throw new AuthClientError(503, "DEPENDENCY_UNAVAILABLE"); }
  const result = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: { code?: string } } | null;
  if (!response.ok || !result?.success) {
    if (response.status === 401 && path === "/auth/session" && token === storedToken()) clearAuthSession();
    throw new AuthClientError(response.status, result?.error?.code ?? "HTTP_ERROR");
  }
  return result.data as T;
}
function publish(next: AuthSession | null): void {
  session = next; setReadCacheIdentity(next?.user.id ?? null); clearReadCache();
  window.dispatchEvent(new Event(eventName));
}
export function clearAuthSession(): void {
  generation += 1; window.sessionStorage.removeItem(storageKey); publish(null);
}
export function getCurrentSession(): AuthSession | null {
  if (session && Date.parse(session.expiresAt) <= Date.now()) clearAuthSession();
  return session;
}
export async function loadSession(): Promise<AuthSession | null> {
  const token = storedToken(); if (!token) return null;
  const expectedGeneration = generation;
  const data = await request<SessionResponse>("/auth/session", "GET", undefined, token);
  if (expectedGeneration !== generation) return session;
  const next = { ...data, access_token: token }; publish(next); return next;
}
export async function login(email: string, password: string): Promise<AuthSession> {
  clearAuthSession(); const expectedGeneration = generation;
  const data = await request<{ token: string; expiresAt: string; mustChangePassword: boolean }>("/auth/login", "POST", { email, password }, null);
  const details = await request<SessionResponse>("/auth/session", "GET", undefined, data.token);
  if (generation !== expectedGeneration) throw new AuthClientError(409, "SESSION_CHANGED");
  window.sessionStorage.setItem(storageKey, JSON.stringify({ token: data.token, expiresAt: data.expiresAt }));
  const next = { ...details, access_token: data.token }; publish(next); return next;
}
/** False means a newer login superseded this operation; callers must not navigate. */
export async function logout(): Promise<boolean> {
  const token = session?.access_token ?? storedToken();
  const expectedGeneration = generation;
  try { await request("/auth/logout", "POST", {}, token); }
  catch (error) {
    if (generation !== expectedGeneration) return false;
    clearAuthSession();
    throw error;
  }
  if (generation !== expectedGeneration) return false;
  clearAuthSession();
  return true;
}
export async function changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
  const token = session?.access_token ?? storedToken();
  const expectedGeneration = generation;
  try { await request("/auth/change-password", "POST", { currentPassword, newPassword }, token); }
  catch (error) {
    if (generation !== expectedGeneration) return false;
    throw error;
  }
  if (generation !== expectedGeneration) return false;
  clearAuthSession();
  return true;
}export function resetUserPassword(userId: string, adminPassword: string, temporaryPassword: string): Promise<unknown> {
  return request(`/settings/users/${encodeURIComponent(userId)}/reset-password`, "POST", { adminPassword, temporaryPassword });
}
export function notifyAuthSessionExpired(): void { clearAuthSession(); }
export function subscribeAuthState(listener: () => void): () => void {
  window.addEventListener(eventName, listener); return () => window.removeEventListener(eventName, listener);
}
