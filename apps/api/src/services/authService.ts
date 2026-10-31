import { logCaughtError } from "../utils/errorLogging";
import type { AuthenticatedUser } from "@family-ledger/shared";
import { AuthFailure, invalidCredentials, unavailable } from "../auth/authErrors";
import { hashPassword, verifyPassword, validatePassword, type PasswordVerifier } from "../auth/password";
import { SessionService, InvalidSessionError } from "../auth/sessionService";
import { enforceRate } from "../auth/rateLimit";
import { getAuthStateRepository } from "../auth/authRuntime";
import { findAppUserByEmail, getAppUserById } from "../repositories/appUserRepository";
import { getUserRole, UserRoleNotFoundError } from "../repositories/userRoleRepository";
import type { StoredCredential, AuthStateRepository } from "../repositories/authStateRepository";
import { ApiRequestError } from "../utils/apiError";
import { registerLogSecret } from "../utils/errorLogging";

const dummy: PasswordVerifier = {algorithm:"scrypt",version:1,N:131072,r:8,p:1,salt:"00".repeat(16),hash:"00".repeat(64)};
export interface AuthDependencies {
 store: Pick<AuthStateRepository,"getSession"|"getCredential"|"createSession"|"deleteSession"|"replaceCredential"|"consumeAttempt">;
 findByEmail: typeof findAppUserByEmail;
 findById: typeof getAppUserById;
 role: typeof getUserRole;
 now: () => number;
}
export class AuthService {
 private readonly sessions: SessionService;
 constructor(private readonly deps: AuthDependencies) { this.sessions=new SessionService(deps.store,deps.now); }
 async login(email: string,password: string,sourceIp: string) {
  await enforceRate(this.deps.store,"email",email.trim().toLowerCase(),10,this.deps.now());
  await enforceRate(this.deps.store,"ip",sourceIp,100,this.deps.now());
  const user=await this.deps.findByEmail(email);
  const credential=user ? await this.deps.store.getCredential(user.id) : null;
  const valid=await verifyPassword(password,credential?.verifier ?? dummy);
  if(!user || !credential || !valid) throw invalidCredentials();
  try { await this.deps.role(user.id); } catch(error) { logCaughtError("auth.operation", {name:"ApiAuthError",message:"Authentication operation failed.",statusCode: error && typeof error === "object" && "statusCode" in error ? error.statusCode : 503}); if(error instanceof UserRoleNotFoundError) throw invalidCredentials(); throw error; }
  try { return await this.sessions.create(user.id,credential); }
  catch(error) { logCaughtError("auth.operation", {name:"ApiAuthError",message:"Authentication operation failed.",statusCode: error && typeof error === "object" && "statusCode" in error ? error.statusCode : 503}); if(error instanceof InvalidSessionError) throw invalidCredentials(); throw error; }
 }
 async authenticate(token: string,allowRestricted=false) {
  registerLogSecret(token,true);
  let session;
  try { session=await this.sessions.authenticateSession(token); }
  catch(error) { logCaughtError("auth.operation", {name:"ApiAuthError",message:"Authentication operation failed.",statusCode: error && typeof error === "object" && "statusCode" in error ? error.statusCode : 503}); if(error instanceof InvalidSessionError) throw invalidCredentials(); throw error; }
  const identity=await this.deps.findById(session.userId);
  if(!identity) throw invalidCredentials();
  let role;
  try { role=await this.deps.role(identity.id); }
  catch(error) { logCaughtError("auth.operation", {name:"ApiAuthError",message:"Authentication operation failed.",statusCode: error && typeof error === "object" && "statusCode" in error ? error.statusCode : 503}); if(error instanceof UserRoleNotFoundError) throw new AuthFailure("FORBIDDEN",403,"账户访问已暂停。"); throw error; }
  if(!allowRestricted && session.purpose!=="full") throw new AuthFailure("PASSWORD_CHANGE_REQUIRED",403,"请先修改临时密码。");
  return {user:{id:identity.id,email:identity.email,role} as AuthenticatedUser,session};
 }
 async logout(token: string) { return this.sessions.logout(token); }
 async changePassword(token: string,currentPassword: string,newPassword: string) {
  const {user,session}=await this.authenticate(token,true);
  await enforceRate(this.deps.store,"password",user.id,5,this.deps.now());
  const current=await this.deps.store.getCredential(user.id);
  if(!current || current.credentialVersion!==session.credentialVersion || !await verifyPassword(currentPassword,current.verifier)) throw invalidCredentials();
  this.validateNewPassword(newPassword);
  if(currentPassword===newPassword) throw new ApiRequestError("VALIDATION_ERROR","新密码不能与当前密码相同。",400);
  await this.deps.store.replaceCredential(user.id,{...current,verifier:await hashPassword(newPassword),credentialVersion:current.credentialVersion+1,mustChangePassword:false,temporaryPasswordExpiresAt:null,updatedAt:new Date(this.deps.now()*1000).toISOString()},current.credentialVersion);
 }
 async resetPassword(token: string,targetId: string,adminPassword: string,temporaryPassword: string) {
  const {user,session}=await this.authenticate(token);
  if(user.role!=="admin") throw new AuthFailure("FORBIDDEN",403,"需要管理员权限。");
  if(user.id===targetId) throw new ApiRequestError("VALIDATION_ERROR","请使用修改密码功能修改自己的密码。",400);
  await enforceRate(this.deps.store,"password",user.id,5,this.deps.now());
  const actor=await this.deps.store.getCredential(user.id);
  if(!actor || actor.credentialVersion!==session.credentialVersion || !await verifyPassword(adminPassword,actor.verifier)) throw invalidCredentials();
  if(!await this.deps.findById(targetId)) throw new ApiRequestError("NOT_FOUND","用户不存在。",404);
  const previous=await this.deps.store.getCredential(targetId);
  this.validateNewPassword(temporaryPassword);
  if(previous && await verifyPassword(temporaryPassword,previous.verifier)) throw new ApiRequestError("VALIDATION_ERROR","临时密码不能与当前密码相同。",400);
  const now=this.deps.now();
  const replacement: StoredCredential={verifier:await hashPassword(temporaryPassword),credentialVersion:(previous?.credentialVersion??0)+1,mustChangePassword:true,temporaryPasswordExpiresAt:now+86400,lastSignInAt:previous?.lastSignInAt??null,updatedAt:new Date(now*1000).toISOString()};
  // Recheck SQL permissions immediately before the credential transaction.
  if(await this.deps.role(user.id)!=="admin") throw new AuthFailure("FORBIDDEN",403,"需要管理员权限。");
  await this.deps.store.replaceCredential(targetId,replacement,previous?.credentialVersion??null,{userId:user.id,credentialVersion:session.credentialVersion});
 }
 private validateNewPassword(value:string) { try { validatePassword(value); } catch { logCaughtError("auth.validation", {name:"ApiAuthError",message:"Authentication input rejected.",statusCode:400}); throw new ApiRequestError("VALIDATION_ERROR","密码需要 8 至 128 个字符。",400); } }
}
export function getAuthService(): AuthService {
 try { return new AuthService({store:getAuthStateRepository(),findByEmail:findAppUserByEmail,findById:getAppUserById,role:getUserRole,now:()=>Math.floor(Date.now()/1000)}); }
 catch { logCaughtError("auth.validation", {name:"ApiAuthError",message:"Authentication input rejected.",statusCode:400}); throw unavailable(); }
}
export function normalizeAuthError(error:unknown): never {
 if(error instanceof ApiRequestError) throw error;
 if(error instanceof Error && ["TransactionCanceledException","ConditionalCheckFailedException"].includes(error.name)) throw new AuthFailure("CONFLICT",409,"认证状态已变化，请重新登录后重试。");
 throw unavailable();
}
