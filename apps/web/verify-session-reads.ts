import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";
import type * as Auth from "./src/lib/authClient";
import type * as Api from "./src/lib/apiClient";

// Real client modules, isolated storage and deferred HTTP responses; no live credentials or network.
const bundle = await build({
  stdin: { contents: 'export * from "./src/lib/authClient"; export * from "./src/lib/apiClient"; export {initializeRuntimeConfig} from "./src/lib/runtimeConfig";', resolveDir: resolve("apps/web") },
  bundle: true, write: false, platform: "browser", format: "cjs",
  define: { "import.meta.env": JSON.stringify({ VITE_API_BASE_URL: "https://fixture.invalid", BASE_URL: "/", DEV: false }) }
});
type Client = typeof Auth & typeof Api & { initializeRuntimeConfig(): Promise<unknown> };
const expiresAt = "2099-01-01T00:00:00.000Z";
const details = { user: { id: "one", email: "one@example.com", role: "admin" }, expiresAt, mustChangePassword: false, accountAccess: { userId: "one", revision: 1, scope: { mode: "all" } } };
async function harness() {
  const storage = new Map<string, string>();
  const events = new EventTarget();
  const requests: Array<{ path: string; finish(data: unknown, status?: number, scope?: string): void; fail(): void }> = [];
  const fakeWindow = {
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
    dispatchEvent: events.dispatchEvent.bind(events), addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events)
  };
  const fetcher = (url: string) => {
    if (url.endsWith("config.json")) return Promise.resolve(new Response("", { status: 404 }));
    return new Promise<Response>((resolve, reject) => requests.push({
      path: new URL(url).pathname,
      finish: (data, status = 200, scope) => resolve(new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }), { status, headers: scope ? { "x-account-scope": scope } : {} })),
      fail: () => reject(new TypeError("Failed to fetch"))
    }));
  };
  const module = { exports: {} as Client };
  new Function("module", "exports", "window", "fetch", bundle.outputFiles[0].text)(module, module.exports, fakeWindow, fetcher);
  await module.exports.initializeRuntimeConfig();
  storage.set("family-ledger:session", JSON.stringify({ token: "fixture-session-one", expiresAt }));
  async function take(path: string) {
    for (let i = 0; i < 30; i++) {
      const index = requests.findIndex(request => request.path === path);
      if (index >= 0) return requests.splice(index, 1)[0];
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    throw new Error(`Missing request: ${path}`);
  }
  return { client: module.exports, take, events, storage };
}

const failures: string[] = [];
for (const path of ["/settings/preferences", "/accounts", "/transactions", "/transactions/balances"]) {
  for (const first of [0, 1]) {
    const h = await harness();
    // StrictMode starts two restores. The live effect can finish before the discarded effect.
    const restores = [h.client.loadSession(), h.client.loadSession()];
    const responses = [await h.take("/auth/session"), await h.take("/auth/session")];
    responses[first].finish(details); await restores[first];
    const read = h.client.apiGet(path);
    const outcome = read.then(value => ({ value, error: null }), error => ({ value: null, error }));
    const response = await h.take(path);
    responses[1 - first].finish(structuredClone(details)); await restores[1 - first];
    response.finish({ marker: "authorized" }, 200, "one:1");
    const result = await outcome;
    const retry = h.client.apiGet(path);
    (await h.take(path)).finish({ marker: "authorized" }, 200, "one:1");
    assert.deepEqual(await retry, { marker: "authorized" });
    if (result.error) failures.push(`${path}, restore ${first} first: HTTP 200 rejected: ${String(result.error)}`);
    else assert.deepEqual(result.value, { marker: "authorized" });
  }
}
assert.deepEqual(failures, [], "Unchanged session restoration must not reject authorized in-flight reads; every retry succeeded");
console.log("Concurrent restoration: all four read surfaces pass in both response orders.");

async function ready() {
  const h = await harness();
  const restore = h.client.loadSession(); (await h.take("/auth/session")).finish(details); await restore;
  return h;
}
for (const change of ["logout", "identity", "token", "role", "restriction", "scope", "expiry", "write"]) {
  const h = await ready();
  const read = h.client.apiGet("/accounts");
  const rejected = assert.rejects(read, /登录状态已变化|数据已更新/);
  const response = await h.take("/accounts");
  if (change === "logout") h.client.clearAuthSession();
  else if (change === "write") {
    const write = h.client.apiPatch("/fixture", {}); (await h.take("/fixture")).finish({}); await write;
  } else {
    const next = structuredClone(details);
    if (change === "identity") next.user.id = "two";
    if (change === "token") h.storage.set("family-ledger:session", JSON.stringify({ token: "fixture-session-two", expiresAt }));
    if (change === "role") next.user.role = "viewer";
    if (change === "restriction") next.mustChangePassword = true;
    if (change === "scope") next.accountAccess.revision = 2;
    if (change === "expiry") next.expiresAt = "2000-01-01T00:00:00.000Z";
    const restore = h.client.loadSession(); (await h.take("/auth/session")).finish(next); await restore;
  }
  response.finish({ marker: "obsolete" }); await rejected;
}
// Distinguish actual transport/dependency errors from local invalidation, without retrying writes.
for (const kind of ["network", "dependency", "unauthorized", "stale-scope", "changed-scope"]) {
  const h = await ready();
  const initial = h.client.apiGet("/accounts"); (await h.take("/accounts")).finish({}, 200, "one:2"); await initial;
  const read = h.client.apiGet("/accounts");
  const rejected = assert.rejects(read, (error: unknown) => {
    if (kind === "network") return error instanceof TypeError;
    return error instanceof h.client.ApiClientError && error.code === ({ dependency: "DEPENDENCY_UNAVAILABLE", unauthorized: "MISSING_SESSION", "stale-scope": "STALE_SCOPE", "changed-scope": "SCOPE_CHANGED" } as Record<string, string>)[kind];
  });
  const response = await h.take("/accounts");
  if (kind === "network") response.fail();
  else if (kind === "dependency") response.finish({ code: "DEPENDENCY_UNAVAILABLE", message: "Unavailable" }, 503);
  else if (kind === "unauthorized") response.finish({ code: "UNAUTHORIZED" }, 401);
  else if (kind === "stale-scope") response.finish({}, 200, "one:1");
  else {
    response.finish({}, 200, "one:3");
    (await h.take("/auth/session")).finish({ ...details, accountAccess: { ...details.accountAccess, revision: 3 } });
  }
  await rejected;
}
{
  const h = await ready();
  const restore = h.client.loadSession(); const response = await h.take("/auth/session");
  h.client.clearAuthSession(); response.finish(details); await restore;
  assert.equal(h.client.getCurrentSession(), null, "Late restore must not revive a logged-out session");
}
console.log("Session, scope, expiry and write invalidation; HTTP/network classification; late restore rejection passed.");

for (const accountAccess of [
  { userId: "one", revision: 1, scope: { mode: "selected", resources: [] } },
  undefined
] satisfies Array<Auth.AuthSession["accountAccess"]>) {
  const h = await ready();
  const read = h.client.apiGet("/accounts");
  const rejected = assert.rejects(read, /数据已更新/);
  const response = await h.take("/accounts");
  const restore = h.client.loadSession();
  (await h.take("/auth/session")).finish({ ...details, accountAccess }); await restore;
  response.finish({ marker: "obsolete" }); await rejected;
}
console.log("Full policy changes and policy removal invalidate reads even without a revision increase.");
