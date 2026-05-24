import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import {
  createInvestmentAccount,
  deleteInvestmentAccount,
  getAccounts,
  updateInvestmentAccount
} from "../services/accountService";
import { getDashboard } from "../services/dashboardService";
import { getHoldings } from "../services/holdingService";
import {
  getMarketDataFxRates,
  getMarketDataInstrumentPrices,
  getMarketDataJobRuns,
  getMarketDataProviderRuns,
  triggerMarketDataRetrieval
} from "../services/marketDataService";
import {
  createInvestmentInstrument,
  deleteInvestmentInstrument,
  getInstruments,
  updateInvestmentInstrument
} from "../services/instrumentService";
import {
  createInvestmentTransaction,
  deleteInvestmentTransaction,
  getTransactions,
  updateInvestmentTransaction
} from "../services/transactionService";
import { getPortfolioSnapshots } from "../services/portfolioSnapshotService";
import { getProfilePreferences, updateProfilePreferences } from "../services/profileService";
import { ApiAuthError, requireRole } from "../auth/auth";
import { ApiRequestError } from "../utils/apiError";
import { parseJsonBody } from "../utils/requestBody";
import { failure, preflight, success } from "../utils/response";

type RouteHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2>;
type DynamicRouteHandler = (
  event: APIGatewayProxyEventV2,
  params: Record<string, string>
) => Promise<APIGatewayProxyStructuredResultV2>;

const routes: Record<string, RouteHandler> = {
  "GET /health": async () => success({ status: "ok" }),
  "GET /me": async (event) => success({ user: await requireRole(event, "viewer") }),
  "GET /settings/preferences": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({ user, preferences: await getProfilePreferences(user) });
  },
  "PATCH /settings/preferences": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({ user, preferences: await updateProfilePreferences(parseJsonBody(event), user) });
  },
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
  "POST /instruments": async (event) => {
    const user = await requireRole(event, "admin");
    const instrument = await createInvestmentInstrument(parseJsonBody(event), user);
    return success({ instrument }, 201);
  },
  "GET /transactions": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({ user, transactions: await getTransactions() });
  },
  "POST /transactions": async (event) => {
    const user = await requireRole(event, "admin");
    const transaction = await createInvestmentTransaction(parseJsonBody(event), user);
    return success({ transaction }, 201);
  },
  "GET /holdings": async (event) => {
    const user = await requireRole(event, "viewer");
    const holdings = await getHoldings({ currency: event.queryStringParameters?.currency });
    return success({ user, ...holdings });
  },
  "GET /dashboard": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({ user, dashboard: await getDashboard({ currency: event.queryStringParameters?.currency }) });
  },
  "GET /portfolio-snapshots": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({
      user,
      snapshots: await getPortfolioSnapshots({
        from: event.queryStringParameters?.from,
        to: event.queryStringParameters?.to,
        currency: event.queryStringParameters?.currency
      })
    });
  },
  "GET /market-data/fx-rates": async (event) => {
    const user = await requireRole(event, "viewer");
    const result = await getMarketDataFxRates(event.queryStringParameters ?? {});
    return success({ user, fxRates: result.items, pagination: result.pagination });
  },
  "GET /market-data/instrument-prices": async (event) => {
    const user = await requireRole(event, "viewer");
    const result = await getMarketDataInstrumentPrices(event.queryStringParameters ?? {});
    return success({ user, prices: result.items, pagination: result.pagination });
  },
  "GET /market-data/job-runs": async (event) => {
    const user = await requireRole(event, "viewer");
    const result = await getMarketDataJobRuns(event.queryStringParameters ?? {});
    return success({ user, jobRuns: result.items, pagination: result.pagination });
  },
  "POST /market-data/retrievals": async (event) => {
    const user = await requireRole(event, "admin");
    const requestId = event.requestContext.requestId;
    const retrieval = await triggerMarketDataRetrieval(parseJsonBody(event), user, requestId);
    return success({ user, retrieval }, 202);
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
  },
  {
    method: "PUT",
    pattern: /^\/instruments\/(?<id>[^/]+)$/,
    handler: async (event, params) => {
      const user = await requireRole(event, "admin");
      const instrument = await updateInvestmentInstrument(params.id, parseJsonBody(event), user);
      return success({ instrument });
    }
  },
  {
    method: "DELETE",
    pattern: /^\/instruments\/(?<id>[^/]+)$/,
    handler: async (event, params) => {
      await requireRole(event, "admin");
      await deleteInvestmentInstrument(params.id);
      return success({ deleted: true });
    }
  },
  {
    method: "PUT",
    pattern: /^\/transactions\/(?<id>[^/]+)$/,
    handler: async (event, params) => {
      const user = await requireRole(event, "admin");
      const transaction = await updateInvestmentTransaction(params.id, parseJsonBody(event), user);
      return success({ transaction });
    }
  },
  {
    method: "DELETE",
    pattern: /^\/transactions\/(?<id>[^/]+)$/,
    handler: async (event, params) => {
      await requireRole(event, "admin");
      await deleteInvestmentTransaction(params.id);
      return success({ deleted: true });
    }
  },
  {
    method: "GET",
    pattern: /^\/market-data\/job-runs\/(?<id>[^/]+)\/provider-runs$/,
    handler: async (event, params) => {
      const user = await requireRole(event, "viewer");
      return success({ user, providerRuns: await getMarketDataProviderRuns(params.id) });
    }
  }
];

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    if (event.requestContext.http.method === "OPTIONS") {
      return preflight();
    }

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

    console.error("Unhandled API error", {
      method: event.requestContext.http.method,
      path: event.rawPath,
      error
    });
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
