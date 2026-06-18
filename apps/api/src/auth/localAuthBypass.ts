import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { AuthenticatedUser } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

export const LOCAL_AUTH_BYPASS_TOKEN = "family-ledger-local-dev-auth-bypass";
const defaultLocalAuthBypassEmail = "ricky.yu@outlook.com";

export class LocalAuthBypassUserNotFoundError extends Error {
  constructor(email: string) {
    super(`Local auth bypass user was not found: ${email}`);
  }
}

export interface LocalAuthBypassDependencies {
  findUserByEmail(email: string): Promise<{ id: string; email: string } | null>;
}

export async function getLocalAuthBypassUser(
  event: APIGatewayProxyEventV2,
  token: string,
  dependencies: LocalAuthBypassDependencies = { findUserByEmail }
): Promise<AuthenticatedUser | null> {
  if (!isLocalAuthBypassRequest(event, token)) {
    return null;
  }

  const email = process.env.LOCAL_AUTH_BYPASS_EMAIL?.trim() || defaultLocalAuthBypassEmail;
  const user = await dependencies.findUserByEmail(email);

  if (!user) {
    throw new LocalAuthBypassUserNotFoundError(email);
  }

  return {
    id: user.id,
    email: user.email,
    role: "admin"
  };
}

export function isLocalAuthBypassRequest(event: APIGatewayProxyEventV2, token: string): boolean {
  return (
    process.env.FAMILY_LEDGER_LOCAL_AUTH_BYPASS === "true" &&
    token === LOCAL_AUTH_BYPASS_TOKEN &&
    event.requestContext.accountId === "local" &&
    isLocalHost(event.headers.host ?? event.headers.Host ?? "") &&
    isLoopbackAddress(event.requestContext.http.sourceIp)
  );
}

async function findUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error) {
    throw new Error("Failed to list Supabase Auth users for local auth bypass.");
  }

  const matchedUser = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

  return matchedUser?.email ? { id: matchedUser.id, email: matchedUser.email } : null;
}

function isLocalHost(value: string): boolean {
  const host = value.trim().toLowerCase().replace(/^\[/, "").replace(/\](:\d+)?$/, "");
  const withoutPort = host.includes(":") && !host.includes("::") ? host.split(":")[0] : host;

  return withoutPort === "localhost" || withoutPort === "127.0.0.1" || withoutPort === "::1";
}

function isLoopbackAddress(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.startsWith("127.") ||
    normalized.startsWith("::ffff:127.")
  );
}
