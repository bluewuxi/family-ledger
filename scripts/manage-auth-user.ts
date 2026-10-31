import { activateFirstAdmin, randomTemporaryPassword } from "./auth-user-operations";
import { config as loadDotenv } from "dotenv";
import { getSupabaseAdmin } from "../apps/api/src/db/supabaseServer";
import { AuthStateRepository } from "../apps/api/src/repositories/authStateRepository";
import { hashPassword } from "../apps/api/src/auth/password";

function argument(name: string): string | undefined { const i=process.argv.indexOf(name); return i>=0 ? process.argv[i+1] : undefined; }
function required(name: string): string { const value=argument(name); if(!value) throw new Error(`Missing ${name}.`); return value; }
async function masked(prompt: string): Promise<string> {
 if(!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Interactive terminal required; password arguments/files are unsupported.");
 process.stdout.write(prompt); process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
 return new Promise((resolve,reject)=>{
  let value="";
  const cleanup=()=>{process.stdin.removeListener("data",read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write("\n");};
  const read=(chunk:string)=>{
   for(const ch of chunk) {
    if(ch==='\u0003'){cleanup();reject(new Error("Cancelled."));return;}
    if(ch==='\r'||ch==='\n'){cleanup();resolve(value);return;}
    if(ch==='\u007f'||ch==='\b'){value=[...value].slice(0,-1).join("");continue;}
    if(ch>=' ')value+=ch;
   }
  };
  process.stdin.on("data",read);
 });
}
async function main():Promise<void> {
 const operation=process.argv[2]; const environment=required("--env"); const userId=required("--user-id");
 if(!['provision','reset','activate-first-admin'].includes(operation)||!['test','prod'].includes(environment)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error("Usage: manage-auth-user.ts provision|reset|activate-first-admin --env test|prod --user-id UUID [--email EMAIL --role viewer|admin] --apply");
 if(!process.argv.includes('--apply')) throw new Error("This operator command writes SQL and DynamoDB. Explicit --apply is required.");
 // Reject unexpected arguments so a password can never be supplied by accident.
 const known=new Set(['--env','--user-id','--email','--role']);
 for(let i=3;i<process.argv.length;i++){if(['--apply','--random-password'].includes(process.argv[i]))continue;if(!known.has(process.argv[i]))throw new Error("Unknown argument.");i++;}
 loadDotenv({path:`.env.${environment}`,quiet:true,override:true});
 const table=process.env.AUTH_TABLE_NAME;if(!table)throw new Error("AUTH_TABLE_NAME must identify the independently verified environment table.");
 const db=await getSupabaseAdmin();const auth=new AuthStateRepository(table);
 const {data:user,error}=await db.from('app_users').select('id,email').eq('id',userId).maybeSingle<{id:string;email:string}>();
 if(error)throw new Error("Unable to read application identity.");
 if(operation==='activate-first-admin') {
  if(process.argv.includes('--random-password')) throw new Error("Activation does not accept password options.");
  const email=required('--email');
  await activateFirstAdmin(userId,email,{
   getIdentity:async()=>user??null,
   getAccess:async id=>{const {data,error}=await db.from('user_roles').select('role,access_revision').eq('user_id',id).maybeSingle();if(error)throw new Error("Unable to read access.");return data;},
   getCredential:id=>auth.getCredential(id),invalidate:id=>auth.invalidateSessions(id),now:()=>Math.floor(Date.now()/1000),
   activate:async(id,revision)=>{const {error}=await db.rpc('activate_first_app_admin',{p_user_id:id,p_expected_revision:revision});if(error)throw new Error("First-admin activation failed; inspect current access before retrying.");}
  });
  console.log(`First administrator activation completed for ${environment}.`);return;
 }
 const current=await auth.getCredential(userId);
 if(operation==='provision' && current)throw new Error("Credential already exists; use explicit reset instead.");
 if(operation==='reset' && !user)throw new Error("Application identity must exist before reset.");
 let email=user?.email;const role=argument('--role')??'viewer';
 if(operation==='provision'){
  email=required('--email').trim().toLowerCase();if(!email||!['viewer','admin'].includes(role)||user&&user.email!==email)throw new Error("Invalid or mismatched application identity.");
 }
 const random=process.argv.includes('--random-password');
 let password=random ? randomTemporaryPassword() : await masked('Temporary password: ');let confirmation=random ? password : await masked('Confirm temporary password: ');
 if(password!==confirmation)throw new Error("Passwords do not match.");
 const verifier=await hashPassword(password); password=""; confirmation="";
 if(operation==='provision'){
  const {error:userError}=await db.from('app_users').upsert({id:userId,email},{onConflict:'id'});if(userError)throw new Error("Unable to provision application identity.");
  const {error:profileError}=await db.from('profiles').upsert({id:userId,email},{onConflict:'id',ignoreDuplicates:true});if(profileError)throw new Error("Unable to initialize profile; access remains denied.");
  const {data:existingAccess,error:accessError}=await db.from('user_roles').select('access_revision').eq('user_id',userId).maybeSingle();if(accessError)throw new Error('Unable to inspect access.');
  const accessPayload={user_id:userId,role,is_active:false,access_revision:(existingAccess?.access_revision??0)+1};
  const accessQuery=existingAccess ? db.from('user_roles').update(accessPayload).eq('user_id',userId).eq('access_revision',existingAccess.access_revision) : db.from('user_roles').insert(accessPayload);
  const {data:updatedAccess,error:roleError}=await accessQuery.select('user_id').maybeSingle();if(roleError||!updatedAccess)throw new Error("Unable to initialize inactive access.");
 }
 const now=new Date();await auth.replaceCredential(userId,{verifier,credentialVersion:(current?.credentialVersion??0)+1,mustChangePassword:true,temporaryPasswordExpiresAt:Math.floor(now.valueOf()/1000)+86400,updatedAt:now.toISOString(),lastSignInAt:current?.lastSignInAt??null},current?.credentialVersion??null);
 // Provisioning leaves access inactive deliberately: activation is a separate reviewed
 // operator step (or the existing administrator's Resume action).
 console.log(`${operation} completed for ${environment}. Temporary password requires change within 24 hours. Access state was not activated.`);
}
void main().catch(()=>{console.error("Authentication user operation failed. Check environment, identity, permissions and partial state before retrying; no password was logged.");process.exitCode=1;});
