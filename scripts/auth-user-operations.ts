import { randomBytes } from "node:crypto";
export function randomTemporaryPassword():string { return randomBytes(24).toString("base64url"); }
export interface FirstAdminDependencies {
 getIdentity(id:string):Promise<{email:string}|null>;
 getAccess(id:string):Promise<{role:string;access_revision:number}|null>;
 getCredential(id:string):Promise<{mustChangePassword:boolean;temporaryPasswordExpiresAt:number|null}|null>;
 invalidate(id:string):Promise<void>;
 activate(id:string,revision:number):Promise<void>;
 now():number;
}
/** SQL activation is a revision-checked RPC; no credential or role is created here. */
export async function activateFirstAdmin(id:string,email:string,deps:FirstAdminDependencies):Promise<void> {
 const identity=await deps.getIdentity(id);
 const access=await deps.getAccess(id);
 const credential=await deps.getCredential(id);
 if(!identity || identity.email!==email.trim().toLowerCase() || access?.role!=="admin" || !credential ||
   credential.mustChangePassword && (credential.temporaryPasswordExpiresAt===null || credential.temporaryPasswordExpiresAt<=deps.now())) throw new Error("First administrator identity, role or credentials are not ready.");
 await deps.invalidate(id);
 await deps.activate(id,access.access_revision);
}
