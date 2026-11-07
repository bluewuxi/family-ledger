import type { DashboardSummary } from "./index";

export interface InvestmentGroup { id: string; name: string; instrumentIds: string[] }
export interface InvestmentGroupConfiguration { revision: string; groups: InvestmentGroup[] }
export interface SaveInvestmentGroupInput { name: string; instrumentIds: string[]; expectedRevision: string }
export interface DeleteInvestmentGroupInput { expectedRevision: string }
export interface GroupAllocationRow {
  id: string;
  allocationType: "group" | "instrument" | "cash";
  name: string;
  groupId: string | null;
  instrumentId: string | null;
  marketValue: string | null;
  percentageOfTotal: string | null;
  members: Array<{ instrumentId: string; shortName: string }>;
}
export interface GroupDistribution {
  status: "ready" | "unavailable";
  revision: string | null;
  rows: GroupAllocationRow[];
  canShowPercentages: boolean;
  reason: "missing_valuation" | "negative_value" | "non_positive_total" | "classification_unavailable" | null;
}
export interface InvestmentDashboardSummary extends DashboardSummary { groupDistribution: GroupDistribution }

export type InvestmentGroupInputReason = "invalid_request" | "invalid_revision" | "invalid_name" | "invalid_members" | "duplicate_members";
export class InvestmentGroupInputError extends Error {
  constructor(public readonly reason: InvestmentGroupInputReason, message: string) { super(message); }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function inputRecord(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new InvestmentGroupInputError("invalid_request", "分组请求无效。");
  return value as Record<string, unknown>;
}
function revision(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value) || value.length > 19 || BigInt(value) > 9223372036854775807n) throw new InvestmentGroupInputError("invalid_revision", "请重新加载分组后重试。");
  return value;
}
export function parseSaveInvestmentGroupInput(value: unknown): SaveInvestmentGroupInput {
  const row = inputRecord(value, ["name", "instrumentIds", "expectedRevision"]);
  if (typeof row.name !== "string" || !row.name.trim() || [...row.name.trim()].length > 32) throw new InvestmentGroupInputError("invalid_name", "分组名称须为1至32个字符。");
  if (!Array.isArray(row.instrumentIds) || row.instrumentIds.some(id => typeof id !== "string" || !uuid.test(id))) throw new InvestmentGroupInputError("invalid_members", "请选择有效的非现金证券。");
  const instrumentIds = (row.instrumentIds as string[]).map(id => id.toLowerCase());
  if (new Set(instrumentIds).size !== instrumentIds.length) throw new InvestmentGroupInputError("duplicate_members", "证券不能重复。");
  return { name: row.name.trim(), instrumentIds, expectedRevision: revision(row.expectedRevision) };
}
export function parseDeleteInvestmentGroupInput(value: unknown): DeleteInvestmentGroupInput {
  const row = inputRecord(value, ["expectedRevision"]);
  return { expectedRevision: revision(row.expectedRevision) };
}
