import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireRole } from "../auth/auth";
import { parseJsonBody } from "../utils/requestBody";
import { success, failure } from "../utils/response";
import * as service from "../services/spendingService";
import * as attachments from "../services/spendingAttachmentService";

export async function spendingRoute(
  event: APIGatewayProxyEventV2,
  authorize = requireRole,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  const user = await authorize(event, method === "GET" ? "viewer" : "admin");
  const query = event.queryStringParameters ?? {};
  const parts = event.rawPath.split("/").filter(Boolean);
  const [, kind, id, child] = parts;
  const body = () => parseJsonBody(event);
  if (parts.length === 2) {
    if (method === "GET" && kind === "accounts")
      return success({ user, accounts: await service.listSpendingAccounts() });
    if (method === "POST" && kind === "accounts")
      return success(
        { account: await service.saveSpendingAccount(body(), user) },
        201,
      );
    if (method === "GET" && kind === "statements")
      return success({ user, ...(await service.listStatements(query)) });
    if (method === "POST" && kind === "statements")
      return success(
        { statement: await service.saveStatement(body(), user) },
        201,
      );
    if (method === "GET" && kind === "rows")
      return success({ user, ...(await service.queryRows(query)) });
    if (method === "GET" && kind === "filter-options")
      return success(await service.filterOptions(query));
  }
  if (parts.length === 3 && id) {
    if (method === "GET" && kind === "statements")
      return success({ statement: await service.statementDetail(id) });
    if (method === "PATCH" && kind === "accounts")
      return success({
        account: await service.saveSpendingAccount(body(), user, id),
      });
    if (method === "PATCH" && kind === "statements")
      return success({
        statement: await service.saveStatement(body(), user, id),
      });
    if (method === "PATCH" && kind === "rows")
      return success({
        row: await service.saveRow(body(), user, undefined, id),
      });
    if (
      method === "DELETE" &&
      (kind === "accounts" || kind === "statements" || kind === "rows")
    )
      return success(await service.removeSpendingRecord(kind, id, user));
  }
  if (parts.length === 4 && kind === "statements" && id) {
    if (method === "POST" && child === "rows")
      return success({ row: await service.saveRow(body(), user, id) }, 201);
    if (method === "POST" && child === "attachment-upload")
      return success(await attachments.beginStatementUpload(id, body()));
    if (child === "attachment") {
      if (method === "GET")
        return success(await attachments.viewStatementAttachment(id));
      if (method === "PUT")
        return success({
          statement: await attachments.finishStatementUpload(id, body(), user),
        });
      if (method === "DELETE")
        return success(await attachments.removeStatementAttachment(id, user));
    }
  }
  return failure({ code: "NOT_FOUND", message: "Route not found." }, 404);
}
