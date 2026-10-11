interface Entry { value: unknown; expires: number; }
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();
let identity: string | null = null;
let generation = 0;
export function clearReadCache(): void { generation++; cache.clear(); pending.clear(); }
export function setReadCacheIdentity(next: string | null): void {
  if (next !== identity) { identity = next; clearReadCache(); }
}
export async function cachedRead<T>(key: string, load: () => Promise<T>, ttl = 0, bypass = false): Promise<T> {
  const existing = cache.get(key);
  if (!bypass && existing && existing.expires > Date.now()) return existing.value as T;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight as Promise<T>;
  const startedGeneration = generation;
  const request = load().then(value => {
    if (generation !== startedGeneration) throw new Error("数据已更新，请重新加载。");
    if (ttl > 0) cache.set(key, { value, expires: Date.now() + ttl });
    return value;
  }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
  pending.set(key, request);
  return request;
}
