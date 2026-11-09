import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { ApiClientError } from "./src/lib/apiClient";
import { getDisplayLocale, type UiLanguage } from "./src/i18n/language";
const require = createRequire(new URL("./package.json", import.meta.url));
type Element = {type:unknown;props:Record<string,unknown>};
const nodes=(value:unknown):Element[]=>Array.isArray(value)?value.flatMap(nodes):value&&typeof value==="object"&&"props" in value?[value as Element,...nodes((value as Element).props.children),...nodes((value as Element).props.footer)]:[];
const text=(value:unknown):string=>Array.isArray(value)?value.map(text).join(""):value&&typeof value==="object"&&"props" in value?text((value as Element).props.children):typeof value==="string"||typeof value==="number"?String(value):"";
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const user={id:"synthetic-admin",role:"admin",email:"fixture@example.invalid"};
const account={id:"account",name:"Original account",accountType:"brokerage",purpose:"investment",baseCurrency:"USD",marketRegion:"US",broker:"Original broker",notes:null};
const security={id:"security",shortName:"Source security",name:"Original security",symbol:"SOURCE",assetType:"stock",currency:"USD",marketRegion:"US",active:true,priceSource:"manual"};
const cash={...security,id:"cash",shortName:"Source cash",symbol:null,assetType:"cash"};
interface Api {apiGet:(path:string)=>Promise<unknown>;apiPost?:(path:string,body:unknown,key?:string)=>Promise<unknown>;apiPatch?:(path:string,body:unknown)=>Promise<unknown>}
async function harness(page:"MonthlySummaryPage"|"TransactionsPage"|"DashboardPage",api:Api){
 let language:UiLanguage="en",si=0,ri=0,ei=0,ci=0,query=new URLSearchParams();
 const states:unknown[]=[],refs:Array<{current:unknown}>=[],effects:Array<{deps?:readonly unknown[];cleanup?:()=>void}>=[],pending:Array<()=>void>=[],events:Array<{fn:(...args:unknown[])=>unknown;stable:(...args:unknown[])=>unknown}>=[];
 const actualReact=require("react");
 const react={...actualReact,
  useState:(initial:unknown)=>{const index=si++;if(!(index in states))states[index]=typeof initial==="function"?(initial as ()=>unknown)():initial;return [states[index],(next:unknown)=>{states[index]=typeof next==="function"?(next as (previous:unknown)=>unknown)(states[index]):next;}];},
  useRef:(initial:unknown)=>refs[ri++]??={current:initial},
  useMemo:(factory:()=>unknown)=>factory(),
  useEffect:(fn:()=>unknown,deps?:readonly unknown[])=>{const index=ei++,previous=effects[index];if(!previous||!deps||!previous.deps||deps.some((v,i)=>!Object.is(v,previous.deps![i]))){pending.push(()=>{previous?.cleanup?.();const cleanup=fn();effects[index]={deps,cleanup:typeof cleanup==="function"?cleanup as ()=>void:undefined};});}},
  useId:()=>"synthetic-id"
 };
 const externals=["react","react/jsx-runtime","react-i18next","react-router-dom","lucide-react","../i18n/LanguageProvider","../lib/apiClient","./apiClient","../lib/preferencesContext","../lib/useEventCallback","../lib/useEditDismissal","../lib/useValuation","../lib/authContext","../components/*"];
 const bundle=await build({entryPoints:[`apps/web/src/pages/${page}.tsx`],bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",define:{"import.meta.env":JSON.stringify({DEV:false})},external:externals});
 const module={exports:{} as Record<string,()=>Element>};
 new Function("module","exports","require","window","document",bundle.outputFiles[0].text)(module,module.exports,(name:string)=>{
  if(name==="react")return react;
  if(name==="react-router-dom")return {Link:"a",useNavigate:()=>()=>{},useSearchParams:()=>[query,(value:string|URLSearchParams)=>{query=new URLSearchParams(value);} ]};
  if(name==="lucide-react")return new Proxy({},{get:(_target,key)=>String(key)});
  if(name.endsWith("/i18n/LanguageProvider"))return {useUiLanguage:()=>({language,displayLocale:getDisplayLocale(language)})};
  if(name.endsWith("/lib/apiClient")||name==="./apiClient")return {ApiClientError,...api,apiDelete:()=>{throw Error("Unexpected DELETE");},apiPut:()=>{throw Error("Unexpected PUT");}};
  if(name.endsWith("/lib/preferencesContext"))return {usePreferences:()=>({preferences:{preferredCurrency:"USD",gainColorScheme:"red_positive"},loading:false}),signedToneClass:()=>""};
  if(name.endsWith("/lib/authContext"))return {useAuth:()=>({session:{user}})};
  if(name.endsWith("/lib/useValuation"))return {useValuation:()=>({data:null,loading:false,refreshing:false,nextRefreshAt:null,error:null,reload:()=>Promise.resolve()})};
  if(name.endsWith("/lib/useEditDismissal"))return {useEditDismissal:()=>()=>{}};
  if(name.endsWith("/lib/useEventCallback"))return {useEventCallback:(fn:(...args:unknown[])=>unknown)=>{const index=ci++;if(!events[index]){events[index]={fn,stable:(...args:unknown[])=>events[index].fn(...args)};}events[index].fn=fn;return events[index].stable;}};
  if(name==="../components/InvestmentTrendChart")return {InvestmentTrendChart:"InvestmentTrendChart",getChartToneStyle:()=>({}),formatChartMoney:(value:number)=>String(value)};
  if(name.startsWith("../components/")){const component=name.split("/").at(-1)!;return {[component]:component};}
  return require(name);
 },{location:{hostname:"localhost"},setInterval:()=>0,clearInterval:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},confirm:()=>{throw Error("Unexpected native confirmation");},print:()=>{throw Error("Unexpected print");}},{addEventListener:()=>{},removeEventListener:()=>{}});
 const render=()=>{si=ri=ei=ci=0;return module.exports[page]();};
 async function settle(){let tree=render();for(let i=0;i<6;i++){for(const effect of pending.splice(0))effect();await tick();tree=render();}return tree;}
 return {render,settle,switch:(value:UiLanguage)=>{language=value;},states,refs,getQuery:()=>query.toString()};
}
function click(tree:Element,label:string){const target=nodes(tree).find(n=>n.type==="button"&&text(n)===label);assert(target,`Missing button ${label}`);assert(!target.props.disabled,`${label} is disabled`);(target.props.onClick as ()=>void)();}
function change(node:Element,value:string){(node.props.onChange as (event:unknown)=>void)({target:{value}});}
function transactionForm(tree:Element){const form=nodes(tree).find(n=>n.type==="form"&&n.props.id==="transaction-drawer-form");assert(form);return form;}
function submit(tree:Element){(transactionForm(tree).props.onSubmit as (event:unknown)=>void)({preventDefault(){},currentTarget:{checkValidity:()=>true}});}
const review={month:"2026-10",familyNotes:"Original family notes",reviewStatus:"in_progress",completedAt:null,completedByUserId:null,updatedByUserId:null,createdAt:null,updatedAt:null};
{
 const reads:string[]=[],writes:Array<{path:string;body:unknown}>=[];
 let resolve!:(value:unknown)=>void,reject!:(error:unknown)=>void;
 const summary={month:review.month,currency:"USD",startValue:"100.00",endValue:"110.00",assetChange:"10.00",netPrincipalFlow:"0.00",cashAdjustmentImpact:"0.00",valuationMovement:"10.00",startSnapshotDate:"2026-09-30",endSnapshotDate:"2026-10-31",bridgeLines:[],accountChanges:[],tradeActivity:[],principalTransactions:[],cashAdjustments:[],snapshotWarnings:[],warnings:[]};
 const h=await harness("MonthlySummaryPage",{apiGet:async path=>{reads.push(path);if(path.startsWith("/reports/monthly-summary?"))return {user,monthlySummary:summary};if(path.startsWith("/reports/monthly-review?"))return {user,monthlyReview:review};throw Error(`Unexpected GET ${path}`);},apiPatch:(path,body)=>{writes.push({path,body});return new Promise((yes,no)=>{resolve=yes;reject=no;});}});
 let tree=await h.settle();assert.equal(reads.length,2);
 const draft="Retained source notes 😀";
 change(nodes(tree).find(n=>n.type==="textarea")!,draft);h.render();
 const before=reads.length;h.switch("zh-CN");tree=await h.settle();assert.equal(nodes(tree).find(n=>n.type==="textarea")!.props.value,draft);assert.equal(reads.length,before);
 h.switch("en");tree=h.render();click(tree,"Save notes");h.render();assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{familyNotes:draft});
 h.switch("zh-CN");tree=await h.settle();assert.equal(writes.length,1);assert.equal(nodes(tree).find(n=>n.type==="textarea")!.props.value,draft);assert(nodes(tree).filter(n=>n.type==="button"&&n.props.disabled).length>0);
 reject(new Error("SECRET-REVIEW-MARKER"));await tick();tree=h.render();assert.equal(nodes(tree).find(n=>n.type==="textarea")!.props.value,draft);assert(!text(tree).includes("SECRET-REVIEW-MARKER"));
 h.switch("en");tree=h.render();assert(text(tree).includes("Check")||text(tree).includes("check"));click(tree,"Save notes");assert.equal(writes.length,2);assert.deepEqual(writes[1],writes[0]);
 resolve({user,monthlyReview:{...review,familyNotes:draft}});await tick();tree=h.render();assert(text(tree).includes("Family notes saved."));assert.equal(writes.length,2);
}
const balances={cashBalances:[{accountId:account.id,instrumentId:cash.id,quantity:"100000.00",warnings:[]}],holdings:[]};
for(const validationFailure of [false,true]){
 const reads:string[]=[],writes:Array<{path:string;body:unknown;key:string|undefined}>=[];
 let reject!:(error:unknown)=>void,resolve!:(value:unknown)=>void;
 const h=await harness("TransactionsPage",{apiGet:async path=>{reads.push(path);if(path==="/transactions/balances")return balances;if(path.startsWith("/transactions?"))return {user,transactions:[],linkedCashLegs:[],pagination:{total:0,limit:50,offset:0,hasMore:false}};if(path==="/accounts")return {user,accounts:[account]};if(path==="/instruments")return {instruments:[security,cash]};throw Error(`Unexpected GET ${path}`);},apiPost:(path,body,key)=>{writes.push({path,body,key});return new Promise((yes,no)=>{resolve=yes;reject=no;});}});
 let tree=await h.settle();assert.equal(reads.length,4);click(tree,"New transaction");tree=h.render();click(tree,account.name);tree=h.render();
 let form=transactionForm(tree);change(nodes(form).find(n=>n.type==="select"&&n.props.required)!,security.id);tree=h.render();form=transactionForm(tree);
 const decimalInputs=nodes(form).filter(n=>n.type==="input"&&n.props.placeholder==="0.0000000000");change(decimalInputs[0],"1.0000000001");tree=h.render();form=transactionForm(tree);change(nodes(form).filter(n=>n.type==="input"&&n.props.placeholder==="0.0000000000")[1],"10.0000000001");tree=h.render();
 const before=reads.length,query=h.getQuery(),inputValues=nodes(transactionForm(tree)).filter(n=>(n.type==="input"||n.type==="select"||n.type==="textarea")&&!n.props.disabled).map(n=>n.props.value);
 submit(tree);assert.equal(writes.length,1);assert(writes[0].key);assert.equal((writes[0].body as {quantity:string}).quantity,"1.0000000001");assert.equal((writes[0].body as {price:string}).price,"10.0000000001");h.switch("zh-CN");tree=await h.settle();assert.equal(writes.length,1);assert.equal(reads.length,before);assert.equal(h.getQuery(),query);assert.deepEqual(nodes(transactionForm(tree)).filter(n=>(n.type==="input"||n.type==="select"||n.type==="textarea")&&!n.props.disabled).map(n=>n.props.value),inputValues);
 reject(validationFailure?new ApiClientError("SECRET-REJECT-MARKER","VALIDATION_ERROR",400):new Error("SECRET-TRANSPORT-MARKER"));await tick();tree=h.render();assert(!text(tree).includes("SECRET-"));
 if(!validationFailure){
  const quantity=nodes(transactionForm(tree)).filter(n=>n.type==="input"&&n.props.placeholder==="0.0000000000")[0];change(quantity,"2");tree=h.render();submit(tree);await tick();assert.equal(writes.length,1,"Edited unresolved payload cannot create another operation");
  change(nodes(transactionForm(h.render())).filter(n=>n.type==="input"&&n.props.placeholder==="0.0000000000")[0],"1.0000000001");h.render();
 }
 h.switch("en");tree=h.render();submit(tree);assert.equal(writes.length,2);assert.deepEqual(writes[1].body,writes[0].body);assert.equal(writes[1].path,"/transactions");
 assert.equal(writes[1].key===writes[0].key,!validationFailure,"Unknown results reuse the original key; definite validation rejection starts a new intent");
 resolve({transaction:{id:"synthetic-created"}});await tick();tree=await h.settle();assert.equal(writes.length,2);assert.equal(nodes(tree).find(n=>n.type==="Drawer")!.props.open,false);
}
console.log("Real monthly-review and transaction handlers preserve dirty drafts, pending writes, uncertain retry payload/key, edited-payload blocking and definite-400 intent semantics across language switches");

{
 const reads:string[]=[];
 const h=await harness("DashboardPage",{apiGet:async path=>{reads.push(path);if(path.startsWith("/portfolio-snapshots?"))throw new ApiClientError("PRIVATE-TREND-MARKER","NOT_FOUND",404);if(path.startsWith("/transactions?"))return {transactions:[]};throw Error("Unexpected dashboard request");}});
 const tree=await h.settle();
 const selected=nodes(tree).find(n=>n.props.role==="tab"&&n.props["aria-selected"]===true);
 assert.equal(text(selected),"Period investment profit");
 assert(nodes(tree).some(n=>n.props.className==="form-error"&&text(n).length>0),"History failures must remain visible in the default profit tab");
 assert(!text(tree).includes("PRIVATE-TREND-MARKER"));
 const before=reads.length;h.switch("zh-CN");await h.settle();assert.equal(reads.length,before);
}
