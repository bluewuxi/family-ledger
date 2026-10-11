import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "INFO" | "WARN" | "ERROR";
interface RequestLogContext { requestId: string; method: string; path: string; recorded: WeakMap<object, LogLevel>; secrets: Set<string>; }
const requests = new AsyncLocalStorage<RequestLogContext>();
const secretValues = new Set<string>();
export function registerLogSecret(value: string, requestOnly = false): void {
  if (requestOnly) { requests.getStore()?.secrets.add(value); return; }
  if (value.length >= 4) {
    if (secretValues.size >= 512) secretValues.delete(secretValues.values().next().value!);
    secretValues.add(value);
  }
}
function field(value: unknown, key: string): unknown {
  try { return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined; }
  catch { return "[unreadable diagnostic field]"; }
}

export function withRequestLogging<T>(context: Omit<RequestLogContext, "recorded" | "secrets">, work: () => T): T {
  return requests.run({ ...context, recorded: new WeakMap(), secrets: new Set() }, work);
}

export function redactLogText(value: string): string {
  for (const secret of secretValues) value = value.replaceAll(secret, "[redacted]");
  for (const secret of requests.getStore()?.secrets ?? []) value = value.replaceAll(secret, "[redacted]");
  return value
    .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/\bBearer\s+[^\s"',;]+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .replace(/("(?:password|passwd|secret|token|authorization|api[_-]?key|service[_-]?role[_-]?key|credential)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi, "$1\"[redacted]\"")
    .replace(/\b(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/((?:password|passwd|secret|token|authorization|api[_-]?key|service[_-]?role[_-]?key|credential)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[redacted]")
    .replace(/Key \([^)]*\)=\([^)]*\)/gi, "Key [redacted]")
    .replace(/Failing row contains [\s\S]*/gi, "Failing row contains [redacted]")
    .replace(/\[DecimalError\] Invalid argument:[^\n]*/gi, "[DecimalError] Invalid argument: [redacted]")
    .replace(/(?:Unexpected token|Unexpected non-whitespace character)[^\n]*/gi, "Invalid JSON input [redacted]")
    .replace(/invalid input syntax for type ([^:]+):[^\n]*/gi, "invalid input syntax for type $1: [redacted]")
    .slice(0, 16000);
}

/** Only diagnostic fields are retained; arbitrary SDK payloads can contain credentials. */
export function serializeLogError(value: unknown, seen = new WeakSet<object>(), depth = 0): Record<string, unknown> {
  if (depth > 5) return { message: "[cause depth exceeded]" };
  if (value === null || typeof value !== "object") return { message: redactLogText(String(value)) };
  if (seen.has(value)) return { message: "[circular error]" };
  seen.add(value);
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of ["name", "message", "stack", "code", "details", "hint", "status", "statusCode", "requestId"]) {
    const diagnostic = field(source, key);
    if (typeof diagnostic === "string") result[key] = redactLogText(diagnostic);
    else if (typeof diagnostic === "number") result[key] = diagnostic;
  }
  const cause = field(source, "cause"), metadata = field(source, "$metadata");
  if (cause !== undefined) result.cause = serializeLogError(cause, seen, depth + 1);
  if (metadata && typeof metadata === "object") {
    const requestId = field(metadata, "requestId"), status = field(metadata, "httpStatusCode");
    result.metadata = { requestId: typeof requestId === "string" ? redactLogText(requestId) : undefined,
      httpStatusCode: typeof status === "number" ? status : undefined };
  }
  return Object.keys(result).length ? result : { message: "Non-standard error object" };
}

export function logError(operation: string, error: unknown, level: LogLevel = "ERROR", context: Record<string, string | number | null> = {}): void {
  try {
    const request = requests.getStore();
    if (error && typeof error === "object") {
      const previous = request?.recorded.get(error);
      const rank = { INFO: 0, WARN: 1, ERROR: 2 };
      if (previous && rank[previous] >= rank[level]) return;
      request?.recorded.set(error, level);
    }
    const safeContext = Object.fromEntries(Object.entries(context).map(([key, value]) => [key, typeof value === "string" ? redactLogText(value) : value]));
    const entry = JSON.stringify({ event: "api-diagnostic", level, operation,
      requestId: request ? redactLogText(request.requestId) : undefined,
      method: request ? redactLogText(request.method) : undefined, path: request ? redactLogText(request.path) : undefined,
      context: safeContext, error: serializeLogError(error) });
    if (level === "ERROR") console.error(entry);
    else if (level === "WARN") console.warn(entry);
    else console.info(entry);
  } catch { /* Diagnostics must never change a request's result. */ }
}

export function logDependencyError(operation: string, error: unknown, expectedCodes: string[] = []): void {
  if (!error) return;
  const code = field(error, "code");
  logError(operation, error, typeof code === "string" && expectedCodes.includes(code) ? "WARN" : "ERROR");
}

export function logCaughtError(operation: string, error: unknown): void {
  const status = field(error, "statusCode"), constructor = field(error, "constructor");
  const explicitName = field(error, "name");
  const name = typeof explicitName === "string" && explicitName !== "Error" ? explicitName : typeof constructor === "function" ? constructor.name : "";
  if (["ParameterNotFound", "ParameterAlreadyExists"].includes(String(field(error, "name")))) {
    logError(operation, error, "INFO");
    return;
  }
  const expected = (typeof status === "number" && status < 500)
    || /(?:NotFound|Duplicate|InUse|Reference|Constraint|InvalidToken|ApiAuth)Error$/.test(name);
  logError(operation, error, expected ? "WARN" : "ERROR");
}

export function logAuthenticationError(operation: string, error: unknown): void {
  if (!error) return;
  const status = field(error, "status");
  logError(operation, error, typeof status === "number" && status >= 400 && status < 500 ? "WARN" : "ERROR");
}
