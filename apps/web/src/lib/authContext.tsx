import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { getRuntimeConfig } from "./runtimeConfig";
import { createLocalAuthBypassSession, isLocalAuthBypassEnabled, LOCAL_AUTH_BYPASS_EMAIL } from "./localAuthBypass";
import { getCurrentSession, loadSession, logout, subscribeAuthState, type AuthSession } from "./authClient";
interface AuthContextValue {
  session: AuthSession | null; loading: boolean; error: string | null; retry: () => void;
  signOut: () => Promise<boolean>; localAuthBypassEmail: string | null;
}
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const bypass = isLocalAuthBypassEnabled(getRuntimeConfig());
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    if (bypass) { setSession(createLocalAuthBypassSession()); setLoading(false); return; }
    const unsubscribe = subscribeAuthState(() => { setSession(getCurrentSession()); setError(null); });
    void loadSession().then(value => { if (active) setSession(value); }).catch(reason => {
      if (active && reason?.status !== 401) setError(reason?.status === 403 ? "当前用户没有访问权限，请联系管理员。" : "登录服务暂时不可用，请重试。");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; unsubscribe(); };
  }, [attempt, bypass]);
  useEffect(() => {
    if (!session || bypass) return;
    const timer = window.setTimeout(() => { getCurrentSession(); }, Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session, bypass]);
  return <AuthContext.Provider value={{ session, loading, error, retry: () => setAttempt(x => x + 1), signOut: logout, localAuthBypassEmail: bypass ? LOCAL_AUTH_BYPASS_EMAIL : null }}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used inside AuthProvider."); return value;
}
