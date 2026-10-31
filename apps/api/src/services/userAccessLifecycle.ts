import type { UserRole } from "@family-ledger/shared";
import type { UserAccess } from "../repositories/managedUserRepository";

export interface UserAccessDependencies<Result> {
  getAccess(userId: string): Promise<UserAccess | null>;
  updateAccess(userId: string, input: { role?: UserRole; isActive?: boolean }, expected: UserAccess | null): Promise<Result>;
  hasCredential(userId: string): Promise<boolean>;
  invalidateSessions(userId: string): Promise<void>;
}

/** SQL access is authoritative; revision CAS prevents stale resume from undoing pause. */
export async function updateUserAccessLifecycle<Result>(
  userId: string,
  input: { role?: UserRole; isActive?: boolean },
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
