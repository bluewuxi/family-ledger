import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { requireRole } from "../auth/auth";
import { parseJsonBody } from "../utils/requestBody";
import { success, failure } from "../utils/response";
import * as service from "../services/educationReserveService";

export async function educationReserveRoute(event: APIGatewayProxyEventV2, authorize = requireRole) {
  const method = event.requestContext.http.method;
  const user = await authorize(event, method === "GET" ? "viewer" : "admin");
  const parts = event.rawPath.split("/").filter(Boolean);
  if (parts.length === 1 && method === "GET") return success({ user, ...await service.getEducationReserve(event.queryStringParameters ?? {}) });
  if (parts.length === 2 && parts[1] === "entries" && method === "POST") return success({ entry: await service.saveEducationEntry(parseJsonBody(event), user) }, 201);
  if (parts.length === 3 && parts[1] === "entries") {
    if (method === "PATCH") return success({ entry: await service.saveEducationEntry(parseJsonBody(event), user, parts[2]) });
    if (method === "DELETE") { await service.deleteEducationEntry(parts[2], parseJsonBody(event), user); return success({ deleted: true }); }
  }
  return failure({ code: "NOT_FOUND", message: "页面不存在。" }, 404);
}
