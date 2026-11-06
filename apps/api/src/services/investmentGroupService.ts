import { parseSaveInvestmentGroupInput, parseDeleteInvestmentGroupInput, type AuthenticatedUser } from "@family-ledger/shared";
import { readInvestmentGroupConfiguration, writeInvestmentGroup } from "../repositories/investmentGroupRepository";
import { ApiRequestError } from "../utils/apiError";
import { uuid } from "./spendingValidation";
export const getInvestmentGroupConfiguration = readInvestmentGroupConfiguration;
function parse<T>(parser: (value: unknown) => T, body: unknown): T {
  try { return parser(body); } catch (error) { throw new ApiRequestError("VALIDATION_ERROR", error instanceof Error ? error.message : "分组输入无效。", 400); }
}
export function saveInvestmentGroup(id: string | null, body: unknown, user: AuthenticatedUser) {
  const input = parse(parseSaveInvestmentGroupInput, body);
  return writeInvestmentGroup({ operation: id ? "update" : "create", groupId: id ? uuid(id) : null, ...input, actorId: user.id });
}
export async function deleteInvestmentGroup(id: string, body: unknown, user: AuthenticatedUser): Promise<{ revision: string; group: null }> {
  const input = parse(parseDeleteInvestmentGroupInput, body);
  const saved = await writeInvestmentGroup({ operation: "delete", groupId: uuid(id), name: null, instrumentIds: [], ...input, actorId: user.id });
  return { revision: saved.revision, group: null };
}
