import { logCaughtError } from "../utils/errorLogging";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getAuthService, normalizeAuthError } from "../services/authService";
import { getBearerToken } from "../auth/authMiddleware";
import { invalidCredentials } from "../auth/authErrors";
import { success } from "../utils/response";
import { ApiRequestError } from "../utils/apiError";
import { registerLogSecret } from "../utils/errorLogging";

export async function authRoute(event:APIGatewayProxyEventV2) {
 try {
  const method=event.requestContext.http.method;
  const known = (event.rawPath === "/auth/session" && method === "GET") || (["/auth/login","/auth/logout","/auth/change-password"].includes(event.rawPath) && method === "POST") || (/^\/settings\/users\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/reset-password$/i.test(event.rawPath) && method === "POST");
  if(!known) throw new ApiRequestError("NOT_FOUND","接口不存在。",404);
  const service=getAuthService();
  if(event.rawPath==="/auth/login" && method==="POST") {
   const body=readBody(event);
   return success(await service.login(field(body,"email"),field(body,"password"),event.requestContext.http.sourceIp));
  }
  const token=getBearerToken(event) ?? "";
  if(event.rawPath==="/auth/logout" && method==="POST") { await service.logout(token); return success({loggedOut:true}); }
  if(!token) throw invalidCredentials();
  if(event.rawPath==="/auth/session" && method==="GET") {
   const {user,session}=await service.authenticate(token,true);
   return success({user,expiresAt:new Date(session.expiresAt*1000).toISOString(),mustChangePassword:session.purpose==="password_change"});
  }
  if(event.rawPath==="/auth/change-password" && method==="POST") {
   const body=readBody(event); await service.changePassword(token,field(body,"currentPassword"),field(body,"newPassword")); return success({changed:true});
  }
  const match=/^\/settings\/users\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/reset-password$/i.exec(event.rawPath);
  if(match && method==="POST") {
   const body=readBody(event); await service.resetPassword(token,match[1],field(body,"adminPassword"),field(body,"temporaryPassword")); return success({reset:true});
  }
  throw new ApiRequestError("NOT_FOUND","接口不存在。",404);
 } catch(error) { logCaughtError("auth.operation", {name:"ApiAuthError",message:"Authentication operation failed.",statusCode: error && typeof error === "object" && "statusCode" in error ? error.statusCode : 503}); normalizeAuthError(error); }
}
function readBody(event:APIGatewayProxyEventV2):Record<string,unknown> {
 const raw=event.isBase64Encoded ? Buffer.from(event.body??"","base64").toString("utf8") : event.body??"";
 if(Buffer.byteLength(raw)>8192) throw new ApiRequestError("VALIDATION_ERROR","请求内容过大。",413);
 try { const value:unknown=JSON.parse(raw); if(!value || typeof value!=="object" || Array.isArray(value)) throw new Error(); return value as Record<string,unknown>; }
 catch { logCaughtError("auth.validation", {name:"ApiAuthError",message:"Authentication input rejected.",statusCode:400}); throw new ApiRequestError("VALIDATION_ERROR","请求格式无效。",400); }
}
function field(body:Record<string,unknown>,key:string):string {
 const value=body[key];
 if(typeof value!=="string" || value.length===0 || Buffer.byteLength(value)>512) throw new ApiRequestError("VALIDATION_ERROR","请填写有效的邮箱和密码。",400);
 registerLogSecret(value,true); return value;
}
