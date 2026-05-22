import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { getAccounts } from "../services/accountService";
import { getDashboard } from "../services/dashboardService";
import { getHoldings } from "../services/holdingService";
import { getInstruments } from "../services/instrumentService";
import { getTransactions } from "../services/transactionService";
import { ApiAuthError, requireAuth } from "../auth/auth";
import { failure, success } from "../utils/response";

type RouteHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2>;

const routes: Record<string, RouteHandler> = {
  "GET /health": async () => success({ status: "ok" }),
  "GET /me": async (event) => success({ user: await requireAuth(event) }),
  "GET /accounts": async (event) => {
    await requireAuth(event);
    return success({ accounts: await getAccounts() });
  },
  "GET /instruments": async (event) => {
    await requireAuth(event);
    return success({ instruments: await getInstruments() });
  },
  "GET /transactions": async (event) => {
    await requireAuth(event);
    return success({ transactions: await getTransactions() });
  },
  "GET /holdings": async (event) => {
    await requireAuth(event);
    return success({ holdings: await getHoldings() });
  },
  "GET /dashboard": async (event) => {
    await requireAuth(event);
    return success({ dashboard: await getDashboard() });
  }
};

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const routeKey = `${event.requestContext.http.method} ${event.rawPath}`;
  const handler = routes[routeKey];

  if (!handler) {
    return failure({ code: "NOT_FOUND", message: "Route not found." }, 404);
  }

  try {
    return await handler(event);
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

    return failure({ code: "INTERNAL_ERROR", message: "Unexpected server error." }, 500);
  }
}
