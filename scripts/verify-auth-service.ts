import assert from "node:assert/strict";
import { AuthService, type AuthDependencies } from "../apps/api/src/services/authService";
import { hashPassword } from "../apps/api/src/auth/password";
import { enforceRate } from "../apps/api/src/auth/rateLimit";
import { hashSessionToken } from "../apps/api/src/auth/sessionToken";
import type { StoredCredential } from "../apps/api/src/repositories/authStateRepository";
import type { SessionIdentity } from "../apps/api/src/auth/sessionService";
import { UserRoleNotFoundError } from "../apps/api/src/repositories/userRoleRepository";
async function main() {
 const verifier=await hashPassword("password1");
 let now=1000;
 const credentials=new Map<string,StoredCredential>();
 const sessions=new Map<string,SessionIdentity>();
 const attempts=new Map<string,number>();
 const users=[{id:"admin",email:"admin@example.com",createdAt:"2026-01-01"},{id:"viewer",email:"viewer@example.com",createdAt:"2026-01-01"}];
 let active=true;
 for(const user of users) credentials.set(user.id,{verifier,credentialVersion:1,mustChangePassword:false,temporaryPasswordExpiresAt:null,lastSignInAt:null,updatedAt:"2026-01-01"});
 const store:AuthDependencies["store"]={
  getCredential:async id=>credentials.get(id)??null,
  getSession:async digest=>sessions.get(digest)??null,
  createSession:async (digest,session)=>{if(credentials.get(session.userId)?.credentialVersion!==session.credentialVersion) throw Object.assign(new Error(),{name:"TransactionCanceledException"});sessions.set(digest,session);},
  deleteSession:async digest=>{sessions.delete(digest);},
  replaceCredential:async (id,next,previous,actor)=>{if((credentials.get(id)?.credentialVersion??null)!==previous || actor && credentials.get(actor.userId)?.credentialVersion!==actor.credentialVersion) throw new Error("conflict");credentials.set(id,next);},
  consumeAttempt:async (key,limit)=>{const count=attempts.get(key)??0;if(count>=limit)return false;attempts.set(key,count+1);return true;}
 };
 const auth=new AuthService({store,findByEmail:async email=>users.find(u=>u.email===email.trim().toLowerCase())??null,findById:async id=>users.find(u=>u.id===id)??null,role:async id=>{if(!active)throw new UserRoleNotFoundError();return id==="admin"?"admin":"viewer";},now:()=>now});
 const login=await auth.login("viewer@example.com","password1","127.0.0.1");
 assert.equal((await auth.authenticate(login.token)).user.role,"viewer");
 await assert.rejects(auth.resetPassword(login.token,"admin","password1","password2"),{statusCode:403});
 await assert.rejects(auth.login("missing@example.com","password1","127.0.0.1"),{statusCode:401});
 active=false;
 await assert.rejects(auth.login("viewer@example.com","password1","127.0.0.1"),{statusCode:401});
 await assert.rejects(auth.authenticate(login.token),{statusCode:403});active=true;
 const admin=await auth.login("admin@example.com","password1","127.0.0.1");
 await assert.rejects(auth.resetPassword(admin.token,"admin","password1","password2"),{statusCode:400});
 await auth.resetPassword(admin.token,"viewer","password1","password2");
 await assert.rejects(auth.authenticate(login.token),{statusCode:401});
 const restricted=await auth.login("viewer@example.com","password2","127.0.0.1");
 await assert.rejects(auth.authenticate(restricted.token),{code:"PASSWORD_CHANGE_REQUIRED"});
 assert.equal((await auth.authenticate(restricted.token,true)).session.purpose,"password_change");
 await assert.rejects(auth.changePassword(restricted.token,"wrong-pass","password3"),{statusCode:401});
 await auth.changePassword(restricted.token,"password2","password3");
 await assert.rejects(auth.authenticate(restricted.token,true),{statusCode:401});
 const full=await auth.login("viewer@example.com","password3","127.0.0.1");
 assert.equal(sessions.has(hashSessionToken(full.token)),true);
 await auth.logout(full.token);await auth.logout(full.token);await assert.rejects(auth.authenticate(full.token),{statusCode:401});
 for(let i=0;i<10;i++) await enforceRate(store,"test","value",10,now);
 await assert.rejects(enforceRate(store,"test","value",10,now),{statusCode:429});
 await enforceRate(store,"test","value",10,1800);
 const unavailable=new AuthService({...{store,findByEmail:async()=>{throw new Error("dependency");},findById:async()=>null,role:async()=>"viewer" as const,now:()=>now}});
 await assert.rejects(unavailable.login("other@example.com","password1","127.0.0.1"));
 console.log("Auth login/reset/change/roles/restricted sessions/revocation/throttling/dependency fixtures passed.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
