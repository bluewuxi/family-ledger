import { createHash } from "node:crypto";
import type { ApiErrorGroupsPage, ApiErrorEventsPage, ApiErrorQueryResult, ApiErrorTrackingStatus } from "@family-ledger/shared";
import { findApiError, listApiErrorEvents, listApiErrors, observeApiErrors, updateApiError, type ErrorObservation } from "../repositories/apiErrorRepository";
import { apiLogGroup, queryCloudWatchErrors, readCloudWatchErrorEvent, type CloudWatchErrorEvent } from "../repositories/cloudWatchErrorRepository";
import { ApiRequestError } from "../utils/apiError";
import { logCaughtError, logError, redactLogText } from "../utils/errorLogging";

const day = 86400000;
const statuses: ApiErrorTrackingStatus[] = ["open", "in_progress", "resolved"];
function invalid(message: string): never { throw new ApiRequestError("VALIDATION_ERROR", message, 400); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("Expected an object.");
  return value as Record<string, unknown>;
}
function instant(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return invalid("Time must be an ISO timestamp with a time zone.");
  return Date.parse(value);
}
function optionalStatus(value: unknown): ApiErrorTrackingStatus | undefined {
  if (value === undefined || value === "") return undefined;
  if (!statuses.includes(value as ApiErrorTrackingStatus)) return invalid("Invalid error status.");
  return value as ApiErrorTrackingStatus;
}
function pagination(input: Record<string, unknown>) {
  const offset = Number(input.offset ?? 0), limit = Number(input.limit ?? 20);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) invalid("Invalid pagination.");
  return { offset, limit };
}
function uuid(id: string) { if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) invalid("Invalid error group ID."); return id; }
export function normalizeErrorText(value: string): string {
  return redactLogText(value).replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, ":id")
    .replace(/\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?/g, ":time")
    .replace(/\b\d{3,}\b/g, ":number").replace(/\s+/g, " ").trim().slice(0, 1000);
}
function routeTemplate(value: string): string {
  return value.replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, ":id").replace(/\/\d+(?=\/|$)/g, "/:id").split("?")[0];
}
/** Verify the severity field, never a keyword in the message body. */
export function parseCloudWatchError(event: CloudWatchErrorEvent, logGroup: string): ErrorObservation | null {
  if (!event.message || event.timestamp === undefined || !event.eventId || !event.logStreamName) return null;
  const text = event.message;
  const prefix = text.match(/^\S+\t([^\t]+)\t(ERROR|WARN|INFO|DEBUG)\t([\s\S]*)$/);
  let payload = prefix?.[3] ?? text;
  let requestId: string | null = prefix?.[1] ?? null;
  if (prefix && prefix[2] !== "ERROR") return null;
  let entry: Record<string, unknown> | null = null;
  let nativeError = false;
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (parsed.level && parsed.level !== "ERROR") return null;
    if (parsed.level === "ERROR" && typeof parsed.message === "string" && parsed.event !== "api-diagnostic") {
      nativeError = true;
      requestId = typeof parsed.requestId === "string" ? parsed.requestId : requestId;
      payload = parsed.message;
      try { entry = JSON.parse(payload) as Record<string, unknown>; } catch { /* Legacy message inside native JSON logs. */ }
    } else if (parsed.level === "ERROR") {
      nativeError = true;
      entry = parsed.message && typeof parsed.message === "object" ? parsed.message as Record<string, unknown> : parsed;
    }
  } catch { /* Historical Lambda text logs are supported below. */ }
  if (entry && entry.level !== undefined && entry.level !== "ERROR") return null;
  if (!prefix && !entry && !nativeError) return null;
  const error = entry?.error && typeof entry.error === "object" ? entry.error as Record<string, unknown> : {};
  const method = typeof entry?.method === "string" ? entry.method : payload.match(/method:\s*['"]([^'"]+)['"]/)?.[1] ?? "";
  const path = routeTemplate(typeof entry?.path === "string" ? entry.path : payload.match(/path:\s*['"]([^'"]+)['"]/)?.[1] ?? "");
  const operation = typeof entry?.operation === "string" ? entry.operation : payload.split(/[\n{]/)[0].trim();
  const summary = normalizeErrorText(typeof error.message === "string" ? error.message : payload.match(/(?:error:\s*)?(?:\w*Error):\s*([^\n]+)/)?.[1] ?? operation);
  const code = typeof error.code === "string" ? error.code : typeof error.name === "string" ? error.name : null;
  const fingerprint = createHash("sha256").update(JSON.stringify([logGroup, method, path, operation, code, summary])).digest("hex");
  return { fingerprint, summary, method, path, operation, error_code: code,
    log_group: logGroup, log_stream: event.logStreamName, event_id: event.eventId,
    occurred_at: new Date(event.timestamp).toISOString(), request_id: typeof entry?.requestId === "string" ? entry.requestId : requestId,
    legacy: entry?.event !== "api-diagnostic" };
}
export function resolveErrorQuery(body: unknown, now = Date.now()) {
  const input = record(body);
  let from = input.from === undefined ? now - 7 * day : instant(input.from);
  let to = input.to === undefined ? now : instant(input.to);
  let nextToken: string | undefined;
  if (input.cursor !== undefined) {
    if (typeof input.cursor !== "string" || input.cursor.length > 16000) invalid("Invalid query cursor.");
    try {
      const cursor = JSON.parse(Buffer.from(input.cursor as string, "base64url").toString("utf8")) as Record<string, unknown>;
      if (typeof cursor.from !== "number" || typeof cursor.to !== "number" || typeof cursor.token !== "string") invalid("Invalid query cursor.");
      if ((input.from !== undefined && from !== cursor.from) || (input.to !== undefined && to !== cursor.to)) invalid("Cursor belongs to a different time range.");
      from = cursor.from; to = cursor.to; nextToken = cursor.token;
    } catch (error) {
      if (error instanceof ApiRequestError) logCaughtError("apiErrorTrackingService.cursor", error);
      else logError("apiErrorTrackingService.cursor", error, "WARN");
      invalid("Invalid query cursor.");
    }
  }
  // Keep the selected range stable while a cursor is valid (CloudWatch tokens expire after 24h).
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || to > now + 60000 || to - from > 30 * day || from < now - (nextToken ? 31 : 30) * day - 60000) invalid("Query must be within the last 30 days.");
  return { from, to, nextToken };
}
export async function queryApiErrors(body: unknown): Promise<ApiErrorQueryResult> {
  const query = resolveErrorQuery(body);
  const result = await queryCloudWatchErrors(query);
  const events = (result.events ?? []).filter(event => event.timestamp !== undefined && event.timestamp >= Date.now() - 30 * day)
    .map(event => parseCloudWatchError(event, apiLogGroup())).filter((event): event is ErrorObservation => event !== null);
  const observed = await observeApiErrors(events);
  const token = result.nextToken && result.nextToken !== query.nextToken ? result.nextToken : null;
  return { observed, from: new Date(query.from).toISOString(), to: new Date(query.to).toISOString(),
    nextCursor: token ? Buffer.from(JSON.stringify({ from: query.from, to: query.to, token })).toString("base64url") : null };
}
export async function getApiErrors(input: Record<string, string | undefined>): Promise<ApiErrorGroupsPage> {
  const page = pagination(input);
  const from = input.from ? new Date(instant(input.from)).toISOString() : undefined;
  const to = input.to ? new Date(instant(input.to)).toISOString() : undefined;
  if (from && to && from > to) invalid("Start time must precede end time.");
  if (input.path && (input.path.length > 300 || !input.path.startsWith("/"))) invalid("Invalid route filter.");
  const result = await listApiErrors({ ...page, from, to, path: input.path || undefined, status: optionalStatus(input.status) });
  return { items: result.items, pagination: { ...page, total: result.total, hasMore: page.offset + page.limit < result.total } };
}
export async function patchApiError(id: string, body: unknown, userId: string) {
  uuid(id); const input = record(body), status = optionalStatus(input.status);
  if (!status || typeof input.notes !== "string" || input.notes.length > 2000) invalid("Status and notes (maximum 2000 characters) are required.");
  if (!await findApiError(id)) throw new ApiRequestError("NOT_FOUND", "Error group not found.", 404);
  await updateApiError(id, status, redactLogText(input.notes as string).slice(0, 2000), userId);
  return { item: await findApiError(id) };
}
export async function getApiErrorEvents(id: string, input: Record<string, string | undefined>): Promise<ApiErrorEventsPage> {
  uuid(id);
  if (!await findApiError(id)) throw new ApiRequestError("NOT_FOUND", "Error group not found.", 404);
  const page = pagination(input), result = await listApiErrorEvents(id, page.offset, page.limit);
  const items = await Promise.all(result.items.map(async event => {
    // Stored metadata cannot redirect reads to another log group.
    const message = event.log_group === apiLogGroup() && Date.parse(event.occurred_at) >= Date.now() - 30 * day
      ? await readCloudWatchErrorEvent({ stream: event.log_stream, timestamp: Date.parse(event.occurred_at), eventId: event.event_id }) : null;
    return { eventId: event.event_id, occurredAt: event.occurred_at, requestId: event.request_id,
      message: message === null ? null : redactLogText(message), unavailable: message === null, legacy: event.legacy };
  }));
  return { items, pagination: { ...page, total: result.total, hasMore: page.offset + page.limit < result.total } };
}
