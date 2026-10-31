import { logCaughtError } from "../utils/errorLogging";
import { createSessionToken, hashSessionToken } from "./sessionToken";

export interface SessionIdentity {
  userId: string;
  credentialVersion: number;
  purpose: "full" | "password_change";
  expiresAt: number;
}

export interface CredentialState {
  credentialVersion: number;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: number | null;
}

export interface SessionStore {
  getSession(digest: string): Promise<SessionIdentity | null>;
  getCredential(userId: string): Promise<CredentialState | null>;
  /** Must condition-check credentialVersion and insert atomically. */
  createSession(digest: string, session: SessionIdentity): Promise<void>;
  deleteSession(digest: string): Promise<void>;
}

export class InvalidSessionError extends Error {
  constructor() { super("Authentication is required."); }
}

export class SessionService {
  constructor(private readonly store: SessionStore, private readonly now = () => Math.floor(Date.now() / 1000)) {}

  async create(userId: string, credential: CredentialState): Promise<{ token: string; expiresAt: string; mustChangePassword: boolean }> {
    const now = this.now();
    if (credential.mustChangePassword && (credential.temporaryPasswordExpiresAt === null || credential.temporaryPasswordExpiresAt <= now)) {
      throw new InvalidSessionError();
    }
    const purpose = credential.mustChangePassword ? "password_change" : "full";
    const expiresAt = purpose === "full" ? now + 12 * 3600 : Math.min(now + 600, credential.temporaryPasswordExpiresAt!);
    const token = createSessionToken();
    await this.store.createSession(hashSessionToken(token), { userId, credentialVersion: credential.credentialVersion, purpose, expiresAt });
    return { token, expiresAt: new Date(expiresAt * 1000).toISOString(), mustChangePassword: credential.mustChangePassword };
  }

  async authenticateSession(token: string): Promise<SessionIdentity> {
    let digest: string;
    try { digest = hashSessionToken(token); } catch { logCaughtError("auth.validation", {name:"ApiAuthError",message:"Authentication input rejected.",statusCode:400}); throw new InvalidSessionError(); }
    const session = await this.store.getSession(digest);
    if (!session || session.expiresAt <= this.now()) throw new InvalidSessionError();
    const credential = await this.store.getCredential(session.userId);
    if (!credential || credential.credentialVersion !== session.credentialVersion ||
      (session.purpose === "full" && credential.mustChangePassword) ||
      (session.purpose === "password_change" && (!credential.mustChangePassword ||
        credential.temporaryPasswordExpiresAt === null || credential.temporaryPasswordExpiresAt <= this.now()))) {
      throw new InvalidSessionError();
    }
    return session;
  }

  async logout(token: string): Promise<void> {
    let digest: string;
    try { digest = hashSessionToken(token); } catch { logCaughtError("auth.validation", {name:"ApiAuthError",message:"Authentication input rejected.",statusCode:400}); return; }
    await this.store.deleteSession(digest);
  }
}
