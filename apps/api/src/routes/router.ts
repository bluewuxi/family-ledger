import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import {
  createInvestmentAccount,
  deleteInvestmentAccount,
  getAccounts,
  updateInvestmentAccount
} from "../services/accountService";
import { getDashboard } from "../services/dashboardService";
import { getHoldings } from "../services/holdingService";
import { getInstruments } from "../services/instrumentService";
import { getTransactions } from "../services/transactionService";
import { ApiAuthError, requireRole } from "../auth/auth";
import { ApiRequestError } from "../utils/apiError";
import { parseJsonBody } from "../utils/requestBody";
import { failure, success } from "../utils/response";

type RouteHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2>;
type DynamicRouteHandler = (
  event: APIGatewayProxyEventV2,
  params: Record<string, string>
) => Promise<APIGatewayProxyStructuredResultV2>;

const routes: Record<string, RouteHandler> = {
  "GET /health": async () => success({ status: "ok" }),
  "GET /me": async (event) => success({ user: await requireRole(event, "viewer") }),
  "GET /accounts": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({ user, accounts: await getAccounts() });
  },
  "POST /accounts": async (event) => {
    const user = await requireRole(event, "admin");
    const account = await createInvestmentAccount(parseJsonBody(event), user);
    return success({ account }, 201);
  },
  "GET /instruments": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({ user, instruments: await getInstruments() });
  },
  "GET /transactions": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({ user, transactions: await getTransactions() });
  },
  "GET /holdings": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({ user, holdings: await getHoldings() });
  },
  "GET /dashboard": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({ user, dashboard: await getDashboard() });
  }
};

const dynamicRoutes: Array<{
  method: string;
  pattern: RegExp;
  handler: DynamicRouteHandler;
}> = [
  {
    method: "PUT",
    pattern: /^\/accounts\/(?<id>[^/]+)$/,
    handler: async (event, params) => {
      const user = await requireRole(event, "admin");
      const account = await updateInvestmentAccount(params.id, parseJsonBody(event), user);
      return success({ account });
    }
  },
  {
    method: "DELETE",
    pattern: /^\/accounts\/(?<id>[^/]+)$/,
    handler: async (_event, params) => {
      await requireRole(_event, "admin");
      await deleteInvestmentAccount(params.id);
      return success({ deleted: true });
    }
  }
];

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const handler = resolveRoute(event);

    if (!handler) {
      return failure({ code: "NOT_FOUND", message: "Route not found." }, 404);
    }

    return await handler();
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return failure(
        {
          code: error.statusCode === 403 ? "FORBIDDEN" : "UNAUTHORIZED",
          message: error.message
        },
        error.statusCode
      );
    }

    if (error instanceof ApiRequestError) {
      return failure({ code: error.code, message: error.message }, error.statusCode);
    }

    return failure({ code: "INTERNAL_ERROR", message: "Unexpected server error." }, 500);
  }
}

function resolveRoute(event: APIGatewayProxyEventV2): (() => Promise<APIGatewayProxyStructuredResultV2>) | null {
  const method = event.requestContext.http.method;
  const routeKey = `${method} ${event.rawPath}`;
  const exactHandler = routes[routeKey];

  if (exactHandler) {
    return () => exactHandler(event);
  }

  for (const routeDefinition of dynamicRoutes) {
    if (routeDefinition.method !== method) {
      continue;
    }

    const match = routeDefinition.pattern.exec(event.rawPath);

    if (match?.groups) {
      return () => routeDefinition.handler(event, match.groups as Record<string, string>);
    }
  }

  return null;
}
