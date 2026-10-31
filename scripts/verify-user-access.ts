import assert from "node:assert/strict";
import { updateUserAccessLifecycle } from "../apps/api/src/services/userAccessLifecycle";
import type { UserAccess } from "../apps/api/src/repositories/managedUserRepository";

function fixture(active=true){
 let access:UserAccess={user_id:'user',role:'viewer',is_active:active,access_revision:0};
 let version=1; let hasCredential=true;
 const calls:string[]=[];
 const dependencies={
  getAccess:async()=>{calls.push('sql-read');return {...access};},
  updateAccess:async(_id:string,input:{role?:'viewer'|'admin';isActive?:boolean},expected:UserAccess|null)=>{
   calls.push('sql-write');
   if(expected?.access_revision!==access.access_revision)throw new Error('conflict');
   access={...access,role:input.role??access.role,is_active:input.isActive??access.is_active,access_revision:access.access_revision+1};return {...access};
  },
  hasCredential:async()=>{calls.push('credential-read');return hasCredential;},
  invalidateSessions:async()=>{calls.push('ddb-invalidate');if(!hasCredential)throw new Error('missing credentials');version++;}
 };
 return {dependencies,calls,get access(){return access;},get version(){return version;},removeCredential(){hasCredential=false;}};
}
async function main(){
 const pause=fixture();await updateUserAccessLifecycle('user',{isActive:false},pause.dependencies);
 assert.deepEqual(pause.calls,['sql-read','sql-write','credential-read','ddb-invalidate']);assert.equal(pause.access.is_active,false);assert.equal(pause.version,2);
 const resume=fixture(false);await updateUserAccessLifecycle('user',{isActive:true},resume.dependencies);
 assert.deepEqual(resume.calls,['sql-read','ddb-invalidate','sql-write']);assert.equal(resume.access.is_active,true);assert.equal(resume.version,2);
 const role=fixture();await updateUserAccessLifecycle('user',{role:'admin'},role.dependencies);
 assert.deepEqual(role.calls,['sql-read','sql-write']);assert.equal(role.access.access_revision,1);assert.equal(role.version,1);
 const noCred=fixture();noCred.removeCredential();await updateUserAccessLifecycle('user',{isActive:false},noCred.dependencies);assert.equal(noCred.access.is_active,false);
 await assert.rejects(updateUserAccessLifecycle('user',{isActive:true},noCred.dependencies),/missing credentials/);assert.equal(noCred.access.is_active,false);
 // Pause SQL failure performs no auth mutation; auth failure after pause keeps SQL inactive.
 const sqlFail=fixture();sqlFail.dependencies.updateAccess=async()=>{throw new Error('sql outage');};
 await assert.rejects(updateUserAccessLifecycle('user',{isActive:false},sqlFail.dependencies),/sql outage/);assert.equal(sqlFail.version,1);
 const ddbFail=fixture();ddbFail.dependencies.invalidateSessions=async()=>{throw new Error('ddb outage');};
 await assert.rejects(updateUserAccessLifecycle('user',{isActive:false},ddbFail.dependencies),/ddb outage/);assert.equal(ddbFail.access.is_active,false);
 await assert.rejects(updateUserAccessLifecycle('user',{isActive:true},ddbFail.dependencies),/ddb outage/);assert.equal(ddbFail.access.is_active,false);
 const credentialReadFail=fixture();credentialReadFail.dependencies.hasCredential=async()=>{throw new Error('ddb read outage');};
 await assert.rejects(updateUserAccessLifecycle('user',{isActive:false},credentialReadFail.dependencies),/ddb read outage/);assert.equal(credentialReadFail.access.is_active,false);assert.equal(credentialReadFail.version,1);
 const readFail=fixture(false);readFail.dependencies.getAccess=async()=>{throw new Error('sql outage');};
 await assert.rejects(updateUserAccessLifecycle('user',{isActive:true},readFail.dependencies),/sql outage/);assert.equal(readFail.version,1);
 const finalSqlFail=fixture(false);finalSqlFail.dependencies.updateAccess=async()=>{throw new Error('sql outage');};
 await assert.rejects(updateUserAccessLifecycle('user',{isActive:true},finalSqlFail.dependencies),/sql outage/);assert.equal(finalSqlFail.access.is_active,false);assert.equal(finalSqlFail.version,2);
 // Delayed resume invalidates sessions, then a newer pause wins the SQL revision.
 const overlapping=fixture(false);let release!:()=>void;let reached!:()=>void;
 const waiting=new Promise<void>(resolve=>{reached=resolve;});const gate=new Promise<void>(resolve=>{release=resolve;});
 const originalInvalidate=overlapping.dependencies.invalidateSessions;
 const staleResume=updateUserAccessLifecycle('user',{isActive:true},{...overlapping.dependencies,invalidateSessions:async()=>{await originalInvalidate();reached();await gate;}});
 await waiting;await updateUserAccessLifecycle('user',{isActive:false},overlapping.dependencies);release();
 await assert.rejects(staleResume,/conflict/);assert.equal(overlapping.access.is_active,false);assert.equal(overlapping.access.access_revision,1);
 await updateUserAccessLifecycle('user',{isActive:true},overlapping.dependencies);assert.equal(overlapping.access.is_active,true);assert.equal(overlapping.version,4);
 console.log('User access lifecycle passed: ordering, every store failure, role revisions, missing credentials, stale resume CAS and retry.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
