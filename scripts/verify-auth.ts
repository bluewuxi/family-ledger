import { SessionService, type SessionIdentity, type CredentialState } from "../apps/api/src/auth/sessionService";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, validatePassword } from "../apps/api/src/auth/password";
import { createSessionToken, hashSessionToken } from "../apps/api/src/auth/sessionToken";
async function main() {
 assert.throws(() => validatePassword("1234567"));
 validatePassword("12345678"); validatePassword("x".repeat(128));
 assert.throws(() => validatePassword("x".repeat(129)));
 validatePassword("密".repeat(8));
 const first = await hashPassword(" 12345678 ");
 const second = await hashPassword(" 12345678 ");
 assert.notEqual(first.salt, second.salt);
 assert.equal(await verifyPassword(" 12345678 ", first), true);
 assert.equal(await verifyPassword("12345678", first), false);
 assert.equal(await verifyPassword("wrong-password", first), false);
 assert.equal(await verifyPassword(" 12345678 ", {...first, N: 1}), false);
 const token = createSessionToken();
 assert.match(token, /^[A-Za-z0-9_-]{43}$/);
 assert.notEqual(hashSessionToken(token), token);
 assert.equal(hashSessionToken(token).length,64);
 assert.throws(() => hashSessionToken("invalid"));
 let now = 1000;
 let credential: CredentialState = {credentialVersion:1,mustChangePassword:false,temporaryPasswordExpiresAt:null};
 const sessions = new Map<string,SessionIdentity>();
 const service = new SessionService({
  getSession: async digest => sessions.get(digest) ?? null,
  getCredential: async () => credential,
  createSession: async (digest,session) => { if(session.credentialVersion!==credential.credentialVersion) throw new Error("Version conflict"); sessions.set(digest,session); },
  deleteSession: async digest => { sessions.delete(digest); }
 },()=>now);
 const full=await service.create("user",credential);
 assert.equal((await service.authenticateSession(full.token)).purpose,"full");
 credential={...credential,credentialVersion:2};
 await assert.rejects(service.authenticateSession(full.token));
 await assert.rejects(service.create("user",{...credential,credentialVersion:1}));
 credential={...credential,mustChangePassword:true,temporaryPasswordExpiresAt:now+300};
 const restricted=await service.create("user",credential);
 assert.equal((await service.authenticateSession(restricted.token)).purpose,"password_change");
 now+=300;
 await assert.rejects(service.authenticateSession(restricted.token));
 assert.equal(sessions.has(hashSessionToken(restricted.token)),true);
 await service.logout(restricted.token); await service.logout(restricted.token);
 await service.logout("invalid");
 credential={...credential,mustChangePassword:false};
 const expiring=await service.create("user",credential); now+=12*3600;
 await assert.rejects(service.authenticateSession(expiring.token));
 console.log("Session version races, restricted sessions, exact expiry with undeleted rows and idempotent logout passed.");
 console.log("Password bounds, Unicode, salts, exact whitespace, malformed verifier and opaque tokens passed.");
}
main().catch(error => { console.error(error); process.exitCode=1; });
