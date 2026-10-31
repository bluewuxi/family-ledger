import type { ManagedUser, UserRole } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";
import { getAppUserById } from "./appUserRepository";
import { ApiRequestError } from "../utils/apiError";
export interface UserAccess { user_id:string; role:UserRole; is_active:boolean; access_revision:number; }
export class ManagedUserNotFoundError extends Error { constructor(){super("Managed user was not found.");} }
export async function getUserAccess(userId:string):Promise<UserAccess|null> {
 const db=await getSupabaseAdmin();
 const {data,error}=await db.from("user_roles").select("user_id,role,is_active,access_revision").eq("user_id",userId).maybeSingle<UserAccess>();
 if(error) throw new ApiRequestError("DEPENDENCY_UNAVAILABLE","用户服务暂时不可用。",503);
 return data;
}
export async function listManagedUsers():Promise<ManagedUser[]> {
 const db=await getSupabaseAdmin();
 const [{data:users,error:ue},{data:roles,error:re}]=await Promise.all([
  db.from("app_users").select("id,email,created_at"), db.from("user_roles").select("user_id,role,is_active")
 ]);
 if(ue||re) throw new ApiRequestError("DEPENDENCY_UNAVAILABLE","用户服务暂时不可用。",503);
 return (users??[]).map(user=>{const role=roles?.find(row=>row.user_id===user.id);return {id:user.id,email:user.email,createdAt:user.created_at,lastSignInAt:null,role:role?.role??null,isActive:role?.is_active??false};}).sort((a,b)=>(a.email??"").localeCompare(b.email??""));
}
export async function updateManagedUserRole(userId:string,input:{role?:UserRole;isActive?:boolean},expected?:UserAccess|null):Promise<ManagedUser> {
 const identity=await getAppUserById(userId);
 if(!identity) throw new ManagedUserNotFoundError();
 const current=expected===undefined ? await getUserAccess(userId):expected;
 const db=await getSupabaseAdmin();
 const payload={user_id:userId,role:input.role??current?.role??"viewer",is_active:input.isActive??current?.is_active??false,access_revision:(current?.access_revision??0)+1};
 const query=current ? db.from("user_roles").update(payload).eq("user_id",userId).eq("access_revision",current.access_revision):db.from("user_roles").insert(payload);
 const {data,error}=await query.select("user_id,role,is_active").maybeSingle();
 if(error) {
  if(error.code==="23505") throw new ApiRequestError("CONFLICT","用户权限已变化，请刷新重试。",409);
  throw new ApiRequestError("DEPENDENCY_UNAVAILABLE","用户服务暂时不可用。",503);
 }
 if(!data) throw new ApiRequestError("CONFLICT","用户权限已变化，请刷新重试。",409);
 return {id:identity.id,email:identity.email,createdAt:identity.createdAt,lastSignInAt:null,role:data.role,isActive:data.is_active};
}
