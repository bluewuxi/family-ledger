import assert from "node:assert/strict";
import { randomTemporaryPassword, activateFirstAdmin } from "./auth-user-operations";
async function main() {
 const passwords=new Set(Array.from({length:100},()=>randomTemporaryPassword()));
 assert.equal(passwords.size,100);
 for(const value of passwords) assert.match(value,/^[A-Za-z0-9_-]{32}$/);
 const calls:string[]=[];
 const deps={getIdentity:async()=>({email:"admin@example.com"}),getAccess:async()=>({role:"admin",access_revision:4}),getCredential:async()=>({mustChangePassword:true,temporaryPasswordExpiresAt:2000}),invalidate:async()=>{calls.push("invalidate");},activate:async(_id:string,revision:number)=>{assert.equal(revision,4);calls.push("activate");},now:()=>1000};
 await activateFirstAdmin("id","ADMIN@example.com",deps);assert.deepEqual(calls,["invalidate","activate"]);
 await assert.rejects(activateFirstAdmin("id","other@example.com",deps));
 await assert.rejects(activateFirstAdmin("id","admin@example.com",{...deps,getCredential:async()=>null}));
 await assert.rejects(activateFirstAdmin("id","admin@example.com",{...deps,getAccess:async()=>({role:"viewer",access_revision:4})}));
 await assert.rejects(activateFirstAdmin("id","admin@example.com",{...deps,getCredential:async()=>({mustChangePassword:true,temporaryPasswordExpiresAt:999})}));
 calls.length=0;
 await assert.rejects(activateFirstAdmin("id","admin@example.com",{...deps,invalidate:async()=>{throw new Error("outage");}}));assert.deepEqual(calls,[]);
 await assert.rejects(activateFirstAdmin("id","admin@example.com",{...deps,activate:async()=>{throw new Error("conflict");}}));
 console.log("Random temporary passwords and first-admin preconditions/order/failures passed; no live writes.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
