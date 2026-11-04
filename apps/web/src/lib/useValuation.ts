import { observeAsync } from "./observeAsync";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "./apiClient";

/** Publish the stored valuation before waiting for provider refresh. */
export function useValuation<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const inFlight = useRef<{ path: string; id: number } | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<string | null>(null);
  const reload = useCallback(async (force = false) => {
    if (!path) return;
    if (inFlight.current?.path === path && inFlight.current.id === sequence.current) return;
    const id = ++sequence.current;
    inFlight.current = { path, id };
    const current = () => id === sequence.current;
    setError(null);
    setRefreshing(true);
    try {
      const separator = path.includes("?") ? "&" : "?";
      const stored = await apiGet<T>(`${path}${separator}quoteMode=cached`);
      if (!current()) return;
      setData(stored); setLoading(false);
      const cached = stored as Record<string, unknown>;
      const cachedValuation = (cached.dashboard ?? cached.accountDetail ?? cached) as { nextRefreshAt?: string | null; valuationMetadata?: { nextRefreshAt?: string | null } };
      const due = cachedValuation.valuationMetadata ? cachedValuation.valuationMetadata.nextRefreshAt : cachedValuation.nextRefreshAt;
      setNextRefreshAt(due ?? null);
      if (!force && (due === null || (due !== undefined && new Date(due).getTime() > Date.now()))) return;
      const fresh = await apiGet<T>(`${path}${separator}quoteMode=${force ? "refresh" : "auto"}`);
      if (current()) {
        setData(fresh);
        const envelope = fresh as Record<string, unknown>;
        const valuation = (envelope.dashboard ?? envelope.accountDetail ?? envelope) as { quoteRefreshWarnings?: string[]; nextRefreshAt?: string | null; valuationMetadata?: { nextRefreshAt?: string | null } };
        setNextRefreshAt(valuation.valuationMetadata?.nextRefreshAt ?? valuation.nextRefreshAt ?? null);
        if (valuation.quoteRefreshWarnings?.length) setError(`${valuation.quoteRefreshWarnings.join("；")}。当前显示可用估值，可点击刷新重试。`);
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : "加载失败，请重试。");
    } finally {
      if (current()) { setLoading(false); setRefreshing(false); }
      if (inFlight.current?.id === id) inFlight.current = null;
    }
  }, [path]);
  useEffect(() => {
    setData(null); setLoading(true);
    observeAsync(reload());
    const requests = sequence;
    return () => { requests.current++; };
  }, [reload]);
  return { data, loading, refreshing, error, reload, nextRefreshAt };
}
