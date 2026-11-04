/** Acquisition contracts contain no transport, database, or credential dependencies. */
export interface ProviderCapabilities {
  latestQuote: boolean;
  dailyHistory: boolean;
  nativeBatch: boolean;
  maximumBatchSize: number;
}

export const PRICE_PROVIDER_CAPABILITIES: Readonly<Record<string, Readonly<ProviderCapabilities>>> = {
  yahoo_finance: { latestQuote: true, dailyHistory: true, nativeBatch: false, maximumBatchSize: 1 },
  eastmoney: { latestQuote: true, dailyHistory: false, nativeBatch: false, maximumBatchSize: 1 },
  fundrock: { latestQuote: false, dailyHistory: false, nativeBatch: true, maximumBatchSize: 3 },
  kernel_estimate: { latestQuote: false, dailyHistory: false, nativeBatch: false, maximumBatchSize: 1 }
};

export type PriceQuery =
  | { kind: "latest_quote"; instrumentId: string; sourceSymbol: string }
  | { kind: "daily_history"; instrumentId: string; sourceSymbol: string; fromDate: string; toDate: string };

export type PriceItemOutcome<T> =
  | { key: string; status: "success"; value: T }
  | { key: string; status: "failed"; reason: "ACQUISITION_FAILED"; retryAfterSeconds?: number }
  | { key: string; status: "unavailable" | "unsupported"; reason: string };

export interface PriceBatchResult<T> {
  provider: string;
  fetchedAt: string;
  items: PriceItemOutcome<T>[];
  coverage?: Array<{ instrumentId: string; fromDate: string; toDate: string; coveredDates: string[]; missingDates: string[]; supported: boolean }>;
}

/** Retain independent successes, preserve request order, and deduplicate before IO. */
export function runPriceBatch<I, O>(inputs: readonly I[], options: {
  key(input: I): string;
  concurrency: number;
  acquire(input: I): Promise<O>;
  signal?: AbortSignal;
}): Promise<PriceItemOutcome<O>[]> {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) throw new Error("Concurrency must be a positive integer.");
  const unique = [...new Map(inputs.map(input => [options.key(input), input])).entries()];
  const results: PriceItemOutcome<O>[] = new Array(unique.length);
  let cursor = 0;
  let sourceDelay: number | undefined;
  async function worker() {
    while (cursor < unique.length) {
      const index = cursor++;
      const [key, input] = unique[index];
      if (sourceDelay !== undefined) {
        results[index] = { key, status: "failed", reason: "ACQUISITION_FAILED", retryAfterSeconds: sourceDelay };
        continue;
      }
      if (options.signal?.aborted) {
        results[index] = { key, status: "failed", reason: "ACQUISITION_FAILED" };
        continue;
      }
      try {
        const signal = options.signal;
        const pending = options.acquire(input);
        let abort: (() => void) | undefined;
        const aborted = signal ? new Promise<never>((_, reject) => {
          abort = () => reject(new Error("Acquisition deadline exceeded."));
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        }) : null;
        try { results[index] = { key, status: "success", value: await (aborted ? Promise.race([pending, aborted]) : pending) }; }
        finally { if (signal && abort) signal.removeEventListener("abort", abort); }
      }
      catch (error) {
        const seconds = (error as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
        if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) sourceDelay = Math.max(sourceDelay ?? 0, seconds);
        results[index] = { key, status: "failed", reason: "ACQUISITION_FAILED", ...(typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? { retryAfterSeconds: seconds } : {}) };
      }
    }
  }
  return Promise.all(Array.from({ length: Math.min(options.concurrency, unique.length) }, worker)).then(() => results);
}

export function retryAfterSeconds(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value.trim()) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(2_147_483_647, Math.ceil(seconds)) : undefined;
}

export function providerHttpError(response: { status: number; headers?: { get(name: string): string | null } }): Error & { retryAfterSeconds?: number } {
  return Object.assign(new Error(`Provider HTTP request failed with status ${response.status}.`), { retryAfterSeconds: retryAfterSeconds(response.headers?.get("retry-after")) });
}

export function retryDecision(input: {
  attempts: number; now: number; transient: boolean; historical?: boolean; dailyAttempts?: number; phase?: "transient" | "daily"; retryAfterMs?: number;
}): { status: "retry" | "needs_attention"; nextAttemptAt: number | null } {
  if (!Number.isInteger(input.attempts) || input.attempts < 1 || !Number.isFinite(input.now)) throw new Error("Invalid retry state.");
  if (!input.transient || (input.historical && (input.dailyAttempts ?? 0) >= 7)) return { status: "needs_attention", nextAttemptAt: null };
  const delays = [300_000, 900_000, 3_600_000];
  const delay = input.historical && input.phase === "daily" ? 86_400_000 : delays[Math.min(input.attempts - 1, delays.length - 1)];
  return { status: "retry", nextAttemptAt: input.now + Math.max(delay, input.retryAfterMs ?? 0) };
}
