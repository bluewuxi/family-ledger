const entries = new Map<string, { expires: number; promise: Promise<unknown> }>();
export function invalidateHistoryCache(): void { entries.clear(); }
export function readHistoryCache<T>(key: string, load: () => Promise<T>): Promise<T> {
  const entry = entries.get(key);
  if (entry && entry.expires > Date.now()) return entry.promise as Promise<T>;
  if (entries.size >= 64) entries.delete(entries.keys().next().value!);
  const promise = load().catch(error => { if (entries.get(key)?.promise === promise) entries.delete(key); throw error; });
  entries.set(key, { expires: Date.now() + 60_000, promise });
  return promise;
}
