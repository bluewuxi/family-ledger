import type { ManagedUser, UserRole, UpdateManagedUserInput } from "@family-ledger/shared";
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
export async function updateManagedUserRole(userId:string,input:UpdateManagedUserInput,expected?:UserAccess|null,actorId?:string):Promise<ManagedUser> {
 const identity=await getAppUserById(userId);
 if(!identity) throw new ManagedUserNotFoundError();
 const current=expected===undefined ? await getUserAccess(userId):expected;
 if(!current && input.accountScope) throw new ApiRequestError("VALIDATION_ERROR","请先分配用户角色，再设置账户范围。",400);
 const db=await getSupabaseAdmin();
 if(actorId && current) {
  const {error}=await db.rpc("update_managed_access",{actor:actorId,target:userId,expected_access_revision:current.access_revision,new_role:input.role??null,new_active:input.isActive??null,expected_scope_revision:input.expectedScopeRevision??null,new_scope:input.accountScope??null});
  if(error?.code==="40001") throw new ApiRequestError("CONFLICT","用户权限已变化，请刷新重试。",409);
  if(error?.code==="42501") throw new ApiRequestError("FORBIDDEN","不能修改此用户的权限。",403);
  if(error && ["23503","23514","22P02"].includes(error.code)) throw new ApiRequestError("VALIDATION_ERROR","账户权限配置无效，请刷新后重试。",400);
  if(error) throw new ApiRequestError("DEPENDENCY_UNAVAILABLE","用户服务暂时不可用。",503);
  const updated=await getUserAccess(userId);
  if(!updated) throw new ManagedUserNotFoundError();
  return {id:identity.id,email:identity.email,createdAt:identity.createdAt,lastSignInAt:null,role:updated.role,isActive:updated.is_active};
 }
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
