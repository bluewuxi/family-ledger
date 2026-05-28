import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentSession, getSupabaseClient, subscribeAuthSessionExpired } from "./supabase";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseClient();

    getCurrentSession()
      .then((currentSession) => {
        if (mounted) {
          setSession(currentSession);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load auth session.", error);
        if (mounted) {
          setSession(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    const unsubscribeSessionExpired = subscribeAuthSessionExpired(() => {
      setSession(null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
      unsubscribeSessionExpired();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      signOut: async () => {
        await getSupabaseClient().auth.signOut();
      }
    }),
    [loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return value;
}
