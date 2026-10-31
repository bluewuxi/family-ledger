import { logCaughtError } from "../utils/errorLogging";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { AuthenticatedUser, UserRole } from "@family-ledger/shared";
import { getUserRole, UserRoleNotFoundError } from "../repositories/userRoleRepository";
import { getLocalAuthBypassUser, LocalAuthBypassUserNotFoundError } from "./localAuthBypass";
import { getAuthService, normalizeAuthError } from "../services/authService";

export class ApiAuthError extends Error {
  override readonly name = "ApiAuthError";
  constructor(
    message: string,
    public readonly statusCode: 401 | 403 = 401
  ) {
    super(message);
  }
}

export function getBearerToken(event: APIGatewayProxyEventV2): string | null {
  const header = event.headers.authorization ?? event.headers.Authorization;

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function getCurrentUser(event: APIGatewayProxyEventV2): Promise<AuthenticatedUser | null> {
  const token = getBearerToken(event);

  if (!token) {
    return null;
  }

  try {
    const localBypassUser = await getLocalAuthBypassUser(event, token);

    if (localBypassUser) {
      return localBypassUser;
    }

    return (await getAuthService().authenticate(token)).user;
  } catch (error) {
    logCaughtError("authMiddleware.getCurrentUser", error);


    if (error instanceof UserRoleNotFoundError) {
      throw new ApiAuthError("Active user role is required.", 403);
    }

    if (error instanceof LocalAuthBypassUserNotFoundError) {
      throw new ApiAuthError("Local auth bypass user is not configured.", 403);
    }

    normalizeAuthError(error);
  }
}

export async function requireAuth(event: APIGatewayProxyEventV2): Promise<AuthenticatedUser> {
  const user = await getCurrentUser(event);

  if (!user) {
    throw new ApiAuthError("Authentication is required.");
  }

  return user;
}

export async function requireRole(event: APIGatewayProxyEventV2, role: UserRole): Promise<AuthenticatedUser> {
  const user = await requireAuth(event);

  if (role === "admin" && user.role !== "admin") {
    throw new ApiAuthError("Admin role is required.", 403);
  }

  return user;
}
