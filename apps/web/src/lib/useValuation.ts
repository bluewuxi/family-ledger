import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "./apiClient";

/** Publish the stored valuation before waiting for provider refresh. */
export function useValuation<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const id = ++sequence.current;
    const current = () => id === sequence.current;
    setError(null);
    setRefreshing(true);
    try {
      const separator = path.includes("?") ? "&" : "?";
      const stored = await apiGet<T>(`${path}${separator}quoteMode=cached`);
      if (!current()) return;
      setData(stored); setLoading(false);
      const fresh = await apiGet<T>(`${path}${separator}quoteMode=refresh`);
      if (current()) {
        setData(fresh);
        const envelope = fresh as Record<string, unknown>;
        const valuation = (envelope.dashboard ?? envelope.accountDetail ?? envelope) as { quoteRefreshWarnings?: string[] };
        if (valuation.quoteRefreshWarnings?.length) setError(`${valuation.quoteRefreshWarnings.join("；")}。当前显示可用估值，可点击刷新重试。`);
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : "加载失败，请重试。");
    } finally {
      if (current()) { setLoading(false); setRefreshing(false); }
    }
  }, [path]);
  useEffect(() => {
    setData(null); setLoading(true);
    void reload();
    return () => { sequence.current++; };
  }, [reload]);
  return { data, loading, refreshing, error, reload };
}
