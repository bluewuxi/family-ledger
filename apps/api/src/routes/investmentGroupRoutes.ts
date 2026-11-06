import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { requireRole } from "../auth/auth";
import { parseJsonBody } from "../utils/requestBody";
import { success, failure } from "../utils/response";
import { getInvestmentGroupConfiguration, saveInvestmentGroup, deleteInvestmentGroup } from "../services/investmentGroupService";
export async function investmentGroupRoute(event: APIGatewayProxyEventV2) {
  const user = await requireRole(event, "admin");
  const method = event.requestContext.http.method;
  const parts = event.rawPath.split("/").filter(Boolean);
  if (parts.length === 1 && method === "GET") return success(await getInvestmentGroupConfiguration());
  if (parts.length === 1 && method === "POST") return success(await saveInvestmentGroup(null, parseJsonBody(event), user), 201);
  if (parts.length === 2 && method === "PUT") return success(await saveInvestmentGroup(parts[1], parseJsonBody(event), user));
  if (parts.length === 2 && method === "DELETE") return success(await deleteInvestmentGroup(parts[1], parseJsonBody(event), user));
  return failure({ code: "NOT_FOUND", message: "页面不存在。" }, 404);
}
