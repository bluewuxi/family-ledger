import { createHash, randomBytes } from "node:crypto";

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || Buffer.from(token, "base64url").toString("base64url") !== token) {
    throw new Error("Invalid session token.");
  }
  return createHash("sha256").update(token).digest("hex");
}
