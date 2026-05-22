import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { AuthenticatedUser, UserRole } from "@family-ledger/shared";

export class ApiAuthError extends Error {
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

  return header.slice("Bearer ".length).trim();
}

export async function verifySupabaseJwt(token: string): Promise<AuthenticatedUser> {
  // TODO: Stage 1 will verify the Supabase JWT using SUPABASE_JWT_SECRET or Supabase JWKS.
  // SUPABASE_SERVICE_ROLE_KEY must only be used in Lambda API/jobs and never in apps/web.
  if (!token) {
    throw new ApiAuthError("Missing access token.");
  }

  return {
    id: "stage-0-user",
    email: "placeholder@example.com",
    role: "admin"
  };
}

export async function getCurrentUser(event: APIGatewayProxyEventV2): Promise<AuthenticatedUser | null> {
  const token = getBearerToken(event);

  if (!token) {
    return null;
  }

  return verifySupabaseJwt(token);
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

  // TODO: Stage 1 will load the user role from the user_roles table.
  // Lambda API enforces viewer/admin permissions; frontend role checks are only UI hints.
  if (role === "admin" && user.role !== "admin") {
    throw new ApiAuthError("Admin role is required.", 403);
  }

  return user;
}
