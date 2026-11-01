import type { UserRole, UpdateManagedUserInput } from "@family-ledger/shared";
import type { UserAccess } from "../repositories/managedUserRepository";

export interface UserAccessDependencies<Result> {
  getAccess(userId: string): Promise<UserAccess | null>;
  updateAccess(userId: string, input: UpdateManagedUserInput, expected: UserAccess | null): Promise<Result>;
  hasCredential(userId: string): Promise<boolean>;
  invalidateSessions(userId: string): Promise<void>;
}

/** SQL access is authoritative; revision CAS prevents stale resume from undoing pause. */
export async function updateUserAccessLifecycle<Result>(
  userId: string,
  input: UpdateManagedUserInput,
  dependencies: UserAccessDependencies<Result>
): Promise<Result> {
  const current = await dependencies.getAccess(userId);
  if (input.isActive === true) {
    // A failed invalidation must never reach the activation write.
    await dependencies.invalidateSessions(userId);
    return dependencies.updateAccess(userId, input, current);
  }
  const result = await dependencies.updateAccess(userId, input, current);
  if (input.isActive === false && await dependencies.hasCredential(userId)) {
    // Even if invalidation fails, SQL has already denied subsequent access.
    await dependencies.invalidateSessions(userId);
  }
  return result;
}
