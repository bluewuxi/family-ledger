import {
  USER_ROLES,
  type AuthenticatedUser,
  type ManagedUser,
  type UpdateManagedUserInput,
  type UserRole
} from "@family-ledger/shared";
import {
  listManagedUsers as listManagedUserRecords,
  ManagedUserNotFoundError,
  updateManagedUserRole
} from "../repositories/managedUserRepository";
import { ApiRequestError } from "../utils/apiError";

export async function getManagedUsers(): Promise<ManagedUser[]> {
  return listManagedUserRecords();
}

export async function updateManagedUser(
  id: string,
  body: unknown,
  currentUser: AuthenticatedUser
): Promise<ManagedUser> {
  assertUuid(id);

  if (id === currentUser.id) {
    throw new ApiRequestError("VALIDATION_ERROR", "You cannot change your own access from user management.", 400);
  }

  const input = parseUpdateManagedUserInput(body);

  try {
    return await updateManagedUserRole(id, input);
  } catch (error) {
    if (error instanceof ManagedUserNotFoundError) {
      throw new ApiRequestError("NOT_FOUND", "User was not found.", 404);
    }

    throw error;
  }
}

function parseUpdateManagedUserInput(body: unknown): UpdateManagedUserInput {
  const record = asRecord(body);
  const input: UpdateManagedUserInput = {};

  if ("role" in record) {
    input.role = requiredRole(record.role);
  }

  if ("isActive" in record) {
    input.isActive = requiredBoolean(record.isActive, "isActive");
  }

  if (Object.keys(input).length === 0) {
    throw new ApiRequestError("VALIDATION_ERROR", "role or isActive is required.", 400);
  }

  return input;
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }

  return body as Record<string, unknown>;
}

function requiredRole(value: unknown): UserRole {
  if (typeof value !== "string" || !USER_ROLES.includes(value as UserRole)) {
    throw new ApiRequestError("VALIDATION_ERROR", "role must be viewer or admin.", 400);
  }

  return value as UserRole;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} must be a boolean.`, 400);
  }

  return value;
}

function assertUuid(id: string): void {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(id)) {
    throw new ApiRequestError("VALIDATION_ERROR", "User id is invalid.", 400);
  }
}
