import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { requireRole } from "../auth/authMiddleware";
import { getApiErrorEvents, getApiErrors, patchApiError, queryApiErrors } from "../services/apiErrorTrackingService";
import { parseJsonBody } from "../utils/requestBody";
import { failure, success } from "../utils/response";

export async function apiErrorRoute(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const user = await requireRole(event, "admin");
  const method = event.requestContext.http.method, path = event.rawPath;
  if (path === "/data-maintenance/errors" && method === "GET") return success(await getApiErrors(event.queryStringParameters ?? {}));
  if (path === "/data-maintenance/errors/query" && method === "POST") return success(await queryApiErrors(parseJsonBody(event)));
  const events = path.match(/^\/data-maintenance\/errors\/([^/]+)\/events$/);
  if (events && method === "GET") return success(await getApiErrorEvents(events[1], event.queryStringParameters ?? {}));
  const group = path.match(/^\/data-maintenance\/errors\/([^/]+)$/);
  if (group && method === "PATCH") return success(await patchApiError(group[1], parseJsonBody(event), user.id));
  return failure({ code: "NOT_FOUND", message: "Route not found." }, 404);
}
