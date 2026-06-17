import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import {
  createInvestmentAccount,
  deleteInvestmentAccount,
  getAccounts,
  updateInvestmentAccount
} from "../services/accountService";
import {
  getTradingPasswordGateStatus,
  revealTradingPassword,
  updateTradingPassword,
  updateTradingPasswordGate
} from "../services/accountTradingPasswordService";
import { getDashboard } from "../services/dashboardService";
import { getHoldingDetail, getHoldings } from "../services/holdingService";
import {
  getDataMaintenanceBackupRuns,
  getDataMaintenanceFxRates,
  getDataMaintenanceInstrumentPrices,
  getDataMaintenanceJobRuns,
  getDataMaintenanceProviderRuns,
  triggerDataMaintenanceRetrieval
} from "../services/dataMaintenanceService";
import { getManagedUsers, updateManagedUser } from "../services/managedUserService";
import { getMonthlySummary } from "../services/monthlySummaryService";
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
import { getPortfolioSnapshotsResponse } from "../services/portfolioSnapshotService";
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
  "GET /settings/trading-password-gate": async (event) => {
    await requireRole(event, "admin");
    return success(await getTradingPasswordGateStatus());
  },
  "GET /users": async (event) => {
    const user = await requireRole(event, "admin");
    return success({ user, users: await getManagedUsers() });
  },
  "PATCH /settings/preferences": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({ user, preferences: await updateProfilePreferences(parseJsonBody(event), user) });
  },
  "PATCH /settings/trading-password-gate": async (event) => {
    await requireRole(event, "admin");
    return success(await updateTradingPasswordGate(parseJsonBody(event)));
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
    const result = await getTransactions(event.queryStringParameters ?? {});
    return success({ user, transactions: result.items, pagination: result.pagination });
  },
  "POST /transactions": async (event) => {
    const user = await requireRole(event, "admin");
    const transaction = await createInvestmentTransaction(parseJsonBody(event), user);
    return success({ transaction }, 201);
  },
  "GET /holdings": async (event) => {
    const user = await requireRole(event, "viewer");
    const holdings = await getHoldings({ currency: event.queryStringParameters?.currency, user });
    return success({ user, ...holdings });
  },
  "GET /holdings/detail": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({
      user,
      holdingDetail: await getHoldingDetail({
        accountId: event.queryStringParameters?.accountId,
        instrumentId: event.queryStringParameters?.instrumentId,
        currency: event.queryStringParameters?.currency,
        user
      })
    });
  },
  "GET /dashboard": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({ user, dashboard: await getDashboard({ currency: event.queryStringParameters?.currency, user }) });
  },
  "GET /portfolio-snapshots": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({
      user,
      ...await getPortfolioSnapshotsResponse({
        from: event.queryStringParameters?.from,
        to: event.queryStringParameters?.to,
        currency: event.queryStringParameters?.currency,
        limit: event.queryStringParameters?.limit,
        order: event.queryStringParameters?.order,
        includeTrend: event.queryStringParameters?.includeTrend,
        trendRange: event.queryStringParameters?.trendRange,
        user
      })
    });
  },
  "GET /reports/monthly-summary": async (event) => {
    const user = await requireRole(event, "viewer");
    return success({
      user,
      monthlySummary: await getMonthlySummary({
        month: event.queryStringParameters?.month,
        currency: event.queryStringParameters?.currency,
        user
      })
    });
  },
  "GET /data-maintenance/fx-rates": async (event) => {
    const user = await requireRole(event, "viewer");
    const result = await getDataMaintenanceFxRates(event.queryStringParameters ?? {});
    return success({ user, fxRates: result.items, pagination: result.pagination });
  },
  "GET /data-maintenance/instrument-prices": async (event) => {
    const user = await requireRole(event, "viewer");
    const result = await getDataMaintenanceInstrumentPrices(event.queryStringParameters ?? {});
    return success({ user, prices: result.items, pagination: result.pagination });
  },
  "GET /data-maintenance/job-runs": async (event) => {
    const user = await requireRole(event, "viewer");
    const result = await getDataMaintenanceJobRuns(event.queryStringParameters ?? {});
    return success({ user, jobRuns: result.items, pagination: result.pagination });
  },
  "GET /data-maintenance/backups": async (event) => {
    const user = await requireRole(event, "viewer");
    const result = await getDataMaintenanceBackupRuns(event.queryStringParameters ?? {});
    return success({ user, backupRuns: result.items, backupSummary: result.summary, pagination: result.pagination });
  },
  "POST /data-maintenance/retrievals": async (event) => {
    const user = await requireRole(event, "admin");
    const requestId = event.requestContext.requestId;
    const retrieval = await triggerDataMaintenanceRetrieval(parseJsonBody(event), user, requestId);
    return success({ user, retrieval }, 202);
  }
};

const dynamicRoutes: Array<{
  method: string;
  pattern: RegExp;
  handler: DynamicRouteHandler;
}> = [
  {
    method: "POST",
    pattern: /^\/accounts\/(?<id>[^/]+)\/trading-password\/reveal$/,
    handler: async (event, params) => {
      await requireRole(event, "viewer");
      return success(await revealTradingPassword(params.id, parseJsonBody(event)));
    }
  },
  {
    method: "PUT",
    pattern: /^\/accounts\/(?<id>[^/]+)\/trading-password$/,
    handler: async (event, params) => {
      await requireRole(event, "admin");
      return success(await updateTradingPassword(params.id, parseJsonBody(event)));
    }
  },
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
    method: "PATCH",
    pattern: /^\/users\/(?<id>[^/]+)$/,
    handler: async (event, params) => {
      const user = await requireRole(event, "admin");
      return success({ managedUser: await updateManagedUser(params.id, parseJsonBody(event), user) });
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
    pattern: /^\/data-maintenance\/job-runs\/(?<id>[^/]+)\/provider-runs$/,
    handler: async (event, params) => {
      const user = await requireRole(event, "viewer");
      return success({ user, providerRuns: await getDataMaintenanceProviderRuns(params.id) });
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
