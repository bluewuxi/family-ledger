const delays = [300, 700, 1500];

/** Retry only the gateway clock-skew rejection of read-only requests. */
export function createResilientFetch(fetchFn: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      const response = await fetchFn(input, init);
      if (!["GET", "HEAD"].includes(method) || response.ok) return response;
      const body = await response.clone().json().catch(() => null) as { code?: string; message?: string } | null;
      if (body?.code !== "PGRST303" || body.message !== "JWT issued at future") return response;
      console.info(JSON.stringify({ event: "api-timing", operation: "supabase.clockSkew", attempt, exhausted: attempt === delays.length }));
      if (attempt === delays.length) return new Response(JSON.stringify({ code: "DEPENDENCY_UNAVAILABLE", message: "数据服务暂时不可用，请稍后重试。" }), { status: 503, headers: { "content-type": "application/json" } });
      await response.body?.cancel();
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal?.reason); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, delays[attempt]);
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
      });
    }
  };
}
