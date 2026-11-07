import assert from "node:assert/strict";
import { resources } from "./src/i18n/resources";
import { validateResources } from "./src/i18n/resourceValidation";
import { InvestmentGroupInputError, parseSaveInvestmentGroupInput } from "@family-ledger/shared";
import { describeUiError, translateUiError } from "./src/i18n/uiErrors";
import { ApiClientError } from "./src/lib/apiClient";
import { AuthClientError } from "./src/lib/authClient";
import { navigationGroups, navigationItems } from "./src/lib/navigation";
for (const language of ["zh-CN", "en"] as const) {
  for (const namespace of ["auth", "navigation", "errors", "investmentGroups"] as const) {
    assert(namespace in resources[language]);
    const mutated=structuredClone(resources) as unknown as Record<string,Record<string,Record<string,unknown>>>;
    const key=Object.keys(mutated[language][namespace])[0];delete mutated[language][namespace][key];
    assert(validateResources(mutated).some(d=>d.language===language&&d.namespace===namespace&&d.key===key));
  }
}
assert.deepEqual(validateResources(resources), []);
const cases: Array<[string,number|undefined,string]> = [["MISSING_SESSION",401,"sessionExpired"],["FORBIDDEN",403,"forbidden"],["PASSWORD_CHANGE_REQUIRED",403,"passwordRequired"],["HTTP_ERROR",429,"rateLimit"],["DEPENDENCY_UNAVAILABLE",503,"unavailable"],["MISSING_API_BASE_URL",undefined,"missingConfig"],["STALE_SESSION",undefined,"staleSession"],["STALE_SCOPE",undefined,"staleScope"],["SCOPE_CHANGED",undefined,"scopeChanged"],["CONFLICT",409,"groupConflict"],["NOT_FOUND",404,"groupNotFound"],["VALIDATION_ERROR",400,"groupInvalid"]];
for(const [code,status,key] of cases) {
  const error=describeUiError(new ApiClientError("secret-like-marker",code,status),"groupLoad");assert.equal(error.key,key);
  assert(!JSON.stringify(error).includes("secret-like-marker"));
  const before=JSON.stringify(error);assert.notEqual(translateUiError(error,"en"),translateUiError(error,"zh-CN"));assert.equal(JSON.stringify(error),before);
}
assert.equal(describeUiError(new AuthClientError(401,"INVALID_CREDENTIALS"),"login").key,"invalidCredentials");
assert.equal(describeUiError(new AuthClientError(401,"INVALID_CREDENTIALS"),"changePassword").key,"currentPasswordRejected");
for(const reason of [new Error("secret-like-marker"),null,undefined,17,"secret-like-marker",{message:"secret-like-marker"}]) {
  const error=describeUiError(reason,"groupSave");assert.equal(error.key,"uncertainWrite");assert(!JSON.stringify(error).includes("secret-like-marker"));assert(!translateUiError(error,"en").includes("secret-like-marker"));
}
const id="AAAAAAAA-0000-4000-8000-000000000001";
assert.deepEqual(parseSaveInvestmentGroupInput({name:"  "+"😀".repeat(32)+"  ",instrumentIds:[id],expectedRevision:"4"}),{name:"😀".repeat(32),instrumentIds:[id.toLowerCase()],expectedRevision:"4"});
for(const [patch,reason,message] of [[{name:"😀".repeat(33)},"invalid_name","分组名称须为1至32个字符。"],[{instrumentIds:[id,id.toLowerCase()]},"duplicate_members","证券不能重复。"],[{instrumentIds:["wrong"]},"invalid_members","请选择有效的非现金证券。"],[{expectedRevision:"01"},"invalid_revision","请重新加载分组后重试。"],[{extra:true},"invalid_request","分组请求无效。"]] as const) {
  assert.throws(()=>parseSaveInvestmentGroupInput(Object.assign({name:"Name",instrumentIds:[],expectedRevision:"0"},patch)),e=>e instanceof InvestmentGroupInputError&&e.reason===reason&&e.message===message&&describeUiError(e,"groupSave").key!=="uncertainWrite");
}
assert.deepEqual(navigationGroups,["overview","investment","family","tools"]);
assert.deepEqual(navigationItems.filter(x=>x.group==="tools").map(x=>x.to),["/data-maintenance","/settings"]);
assert.equal(navigationItems.find(x=>x.to==="/about")?.group,"about");
assert.deepEqual(navigationItems.map(x=>x.to),["/dashboard","/reports/monthly-summary","/holdings","/transactions","/instruments","/daily-expense","/accounts","/data-maintenance","/settings","/about"]);
console.log("Phase 2 namespace mutations, safe reactive descriptors, parser compatibility and navigation identity passed");
import { routeTitleKey } from "./src/components/RouteDocumentTitle";
for(const [path,search,key] of [["/accounts/new","","accountCreate"],["/accounts/id","","accountDetail"],["/holdings/account/security","","holdingDetail"],["/daily-expense/import/id","","import"],["/instruments","?tab=groups","instruments"],["/unknown","",null]] as const)assert.equal(routeTitleKey(path,search),key);
