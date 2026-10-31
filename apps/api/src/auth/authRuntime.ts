import { AuthStateRepository } from "../repositories/authStateRepository";
let repository: AuthStateRepository | undefined;
export function getAuthStateRepository(): AuthStateRepository {
 return repository ??= new AuthStateRepository(process.env.AUTH_TABLE_NAME ?? "");
}
