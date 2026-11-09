import { i18n } from "./src/i18n/instance";
import { ApiClientError } from "./src/lib/apiClient";
const translationFixture = (namespaces: import("i18next").Namespace) => ({t:i18n.getFixedT("zh-CN",namespaces)});
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";

async function main() {
  const bundle = await build({entryPoints:["apps/web/src/components/InvestmentDistributionPanel.tsx"],bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",define:{"import.meta.env":JSON.stringify({DEV:false})},external:["react","react/jsx-runtime","react-router-dom","./DistributionPanel","../i18n/LanguageProvider"]});
  let params = new URLSearchParams("keep=yes");
  let calls = 0;
  const require = createRequire(import.meta.url);
  const module = {exports:{} as {InvestmentDistributionPanel: (props: Record<string,unknown>) => Element}};
  interface Element { type: unknown; props: Record<string,unknown> }
  new Function("module","exports","require",bundle.outputFiles[0].text)(module,module.exports,(name:string)=>{
    if(name==="../i18n/LanguageProvider")return {useUiLanguage:()=>({language:"zh-CN",displayLocale:"zh-CN"})};
    if(name==="react")return {...require("react"),useId:()=>"fixture-id"};
    if(name==="react-router-dom")return {Link:"a",useSearchParams:()=>[params,(next:URLSearchParams)=>{params=next;}]};
    if(name==="./DistributionPanel")return {DistributionPanel:"distribution"};
    return require(name);
  });
  const dashboard={totalAssets:"110000.00",holdingAllocations:[{id:"security",name:"Security",marketValue:"70000.00"}],groupDistribution:{status:"ready",rows:[{id:"group:g",name:"科技",marketValue:"70000.00",percentageOfTotal:"63.64",members:[{instrumentId:"security",shortName:"Security"}]}],canShowPercentages:true,reason:null}};
  const props={dashboard,loading:false,isAdmin:true,onRetry:()=>{calls++;}};
  const render=(extra={})=>module.exports.InvestmentDistributionPanel({...props,...extra});
  const all=(node:unknown):Element[]=>Array.isArray(node)?node.flatMap(all):node&&typeof node==="object"&&"props" in node?[node as Element,...all((node as Element).props.children)]:[];
  let tree=render();
  assert.equal(all(tree).filter(e=>e.props.role==="tab").length,2);
  assert(!all(tree).some(e=>e.props.to));
  const buttons=all(tree).filter(e=>e.props.role==="tab");
  (buttons[1].props.onClick as ()=>void)();tree=render();
  assert.equal(params.get("keep"),"yes");assert.equal(params.get("distribution"),"groups");
  assert.equal(calls,0,"Switching tabs must not reload valuations");
  const panel=all(tree).find(e=>e.type==="distribution")!;
  assert.equal(panel.props.total,"110000.00");assert.equal(panel.props.validity,true);
  assert.equal(all(tree).find(e=>e.props.to)?.props.to,"/instruments?tab=groups&from=distribution");
  assert(!all(render({isAdmin:false})).some(e=>e.props.to));
  const unavailable=render({dashboard:{...dashboard,groupDistribution:{status:"unavailable",rows:[],canShowPercentages:false,reason:"classification_unavailable"}}});
  assert(!all(unavailable).some(e=>e.type==="distribution"));
  assert(all(unavailable).some(e=>e.props.role==="alert"));
  assert.equal(calls,0);
  await verifyEditor();
  await verifyDeparture();
  await verifyMaintenanceTabs();
  await verifyManagerCancellation();
  console.log("Group distribution client: tabs preserve query/totals, zero refresh, admin shortcut and unavailable state passed.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});

async function verifyEditor() {
  const require=createRequire(import.meta.url);
  const bundle=await build({entryPoints:['apps/web/src/components/investments/InvestmentGroupEditor.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',define:{'import.meta.env':JSON.stringify({DEV:false})},external:['react-i18next','../../i18n/LanguageProvider','*/lib/apiClient','../ConfirmationDialog','react','react/jsx-runtime','../../lib/investmentGroupsClient','../../lib/useWorkflowDeparture','../Drawer']});
  type El={type:unknown;props:Record<string,unknown>};
  const all=(v:unknown):El[]=>Array.isArray(v)?v.flatMap(all):v&&typeof v==='object'&&'props' in v?[v as El,...all((v as El).props.children),...all((v as El).props.footer)]:[];
  const states:unknown[]=[],refs:Array<{current:unknown}>=[],effects:Array<()=>unknown>=[];let si=0,ri=0;
  let saved:Record<string,unknown>|null=null,writes=0,closed=0,deletes=0;let reject!:(e:Error)=>void;
  const react={...require('react'),useState:(initial:unknown)=>{const i=si++;if(!(i in states))states[i]=typeof initial==='function'?(initial as ()=>unknown)():initial;return [states[i],(v:unknown)=>{states[i]=typeof v==='function'?(v as (p:unknown)=>unknown)(states[i]):v;}];},useRef:(v:unknown)=>refs[ri++]??={current:v},useEffect:(effect:()=>unknown)=>{effects.push(effect);}};
  const module={exports:{} as {InvestmentGroupEditor:(p:Record<string,unknown>)=>El}};
  new Function('module','exports','require',bundle.outputFiles[0].text)(module,module.exports,(n:string)=>n==='react-i18next'?{useTranslation:translationFixture}:n==='../../i18n/LanguageProvider'?{useUiLanguage:()=>({language:'zh-CN'})}:n.endsWith('/lib/apiClient')?{ApiClientError}:n==='../ConfirmationDialog'?{ConfirmationDialog:'confirmation'}:n==='react'?react:n==='../../lib/useWorkflowDeparture'?{useWorkflowDeparture:()=>{}}:n==='../Drawer'?{Drawer:'drawer'}:n==='../../lib/investmentGroupsClient'?{saveInvestmentGroup:(_id:unknown,input:Record<string,unknown>)=>{saved=input;writes++;return new Promise((_r,j)=>{reject=j;});},deleteInvestmentGroup:async()=>{deletes++;return {revision:'5',group:null};}}:require(n));
  const id='00000000-0000-4000-8000-000000000001';
  const props={open:true,group:null,configuration:{revision:'4',groups:[{id:'other',name:'Other',instrumentIds:[id]}]},instruments:[{id,shortName:'Inactive',assetType:'stock',active:false},{id:'cash',shortName:'Cash',assetType:'cash'}],onClose:()=>{closed++;},onSaved:()=>{closed++;}};
  const render=(extra={})=>{si=ri=0;effects.length=0;return module.exports.InvestmentGroupEditor({...props,...extra});};
  let tree=render();for(const effect of effects)effect();
  assert.equal(all(tree).filter(e=>e.props.type==='checkbox').length,1,'Cash excluded; inactive security included');
  const blankForm=all(tree).find(e=>e.type==='form')!;(blankForm.props.onSubmit as (e:unknown)=>void)({preventDefault:()=>{}});assert.equal(writes,0,'Blank names must not write');
  const name=all(tree).find(e=>e.type==='input'&&e.props.type!=='checkbox')!;
  (name.props.onChange as (e:unknown)=>void)({target:{value:'Other'}});tree=render();
  (all(tree).find(e=>e.type==='form')!.props.onSubmit as (e:unknown)=>void)({preventDefault:()=>{}});assert.equal(writes,0,'Duplicate names must not write');
  (all(tree).find(e=>e.type==='input'&&e.props.type!=='checkbox')!.props.onChange as (e:unknown)=>void)({target:{value:'New'}});
  tree=render();(all(tree).find(e=>e.props.type==='checkbox')!.props.onChange as (e:unknown)=>void)({target:{checked:true}});tree=render();assert(JSON.stringify(tree).includes('保存后将移入本分组'));
  (all(tree).find(e=>e.props.type==='checkbox')!.props.onChange as (e:unknown)=>void)({target:{checked:false}});
  tree=render({configuration:{...props.configuration,revision:'99'}});
  assert(JSON.stringify(tree).includes('Other'),'Show current membership before a move');
  const form=all(tree).find(e=>e.type==='form')!;
  (form.props.onSubmit as (e:unknown)=>void)({preventDefault:()=>{}});
  (form.props.onSubmit as (e:unknown)=>void)({preventDefault:()=>{}});
  assert.equal(writes,1,'Pending saves cannot submit twice');
  assert.equal((saved as unknown as {expectedRevision:string}).expectedRevision,'4','Draft keeps original revision');
  assert.deepEqual((saved as unknown as {instrumentIds:string[]}).instrumentIds,[],'Empty groups are allowed');
  reject(new ApiClientError('Ignored raw message','CONFLICT',409));
  await new Promise(r=>setTimeout(r,0));tree=render();
  assert.equal(all(tree).find(e=>e.type==='input'&&e.props.type!=='checkbox')!.props.value,'New');assert.equal(closed,0);
  assert(JSON.stringify(tree).includes('分组已被其他操作修改'));
  assert.equal(all(tree).find(e=>e.props.type==='submit')!.props.disabled,true,'Conflict blocks replay until review');
  const globals=globalThis as unknown as {window?:{confirm:(message:string)=>boolean}};const previousWindow=globals.window;
  try {
    globals.window={confirm:()=>false};(all(tree).find(e=>e.type==='drawer')!.props.onClose as ()=>void)();assert.equal(closed,0,'Dirty dismissal cancellation preserves draft');
    globals.window.confirm=()=>true;(all(tree).find(e=>e.type==='drawer')!.props.onClose as ()=>void)();assert.equal(closed,1);
    states.length=0;refs.length=0;tree=render({group:{id:'group',name:'Delete',instrumentIds:[]}});for(const effect of effects)effect();
    const remove=all(tree).find(e=>e.props.className==='danger-button')!;
    globals.window.confirm=()=>false;(remove.props.onClick as ()=>void)();await new Promise(r=>setTimeout(r,0));assert.equal(deletes,0);
    tree=render({group:{id:'group',name:'Delete',instrumentIds:[]}});const confirmation=all(tree).find(e=>e.type==='confirmation')!;assert.equal(confirmation.props.open,true);(confirmation.props.onCancel as ()=>void)();assert.equal(deletes,0);tree=render({group:{id:'group',name:'Delete',instrumentIds:[]}});(all(tree).find(e=>e.props.className==='danger-button')!.props.onClick as ()=>void)();tree=render({group:{id:'group',name:'Delete',instrumentIds:[]}});(all(tree).find(e=>e.type==='confirmation')!.props.onConfirm as ()=>void)();await new Promise(r=>setTimeout(r,0));assert.equal(deletes,1,'Delete requires explicit confirmation');
  } finally {globals.window=previousWindow;}
}

async function verifyDeparture() {
  const require=createRequire(import.meta.url);
  const bundle=await build({entryPoints:['apps/web/src/lib/useWorkflowDeparture.ts'],bundle:true,write:false,platform:'node',format:'cjs',define:{'import.meta.env':JSON.stringify({DEV:false})},external:['react','react-router-dom']});
  let guard!:(input:unknown)=>boolean;let unload!:(event:{preventDefault:()=>void;returnValue?:string})=>void;
  const module={exports:{} as {useWorkflowDeparture:(dirty:boolean,busy:boolean,exit?:unknown,root?:unknown,search?:boolean)=>void}};
  new Function('module','exports','require',bundle.outputFiles[0].text)(module,module.exports,(name:string)=>name.endsWith('/lib/apiClient')?{ApiClientError}:name==='react-i18next'?{useTranslation:translationFixture}:name==='../../i18n/LanguageProvider'?{useUiLanguage:()=>({language:'zh-CN'})}:name==='react'?{...require('react'),useCallback:(cb:unknown)=>cb,useEffect:(effect:()=>void)=>effect()}:name==='react-router-dom'?{useBlocker:(cb:typeof guard)=>{guard=cb;return {state:'unblocked'};},useBeforeUnload:(cb:typeof unload)=>{unload=cb;}}:require(name));
  module.exports.useWorkflowDeparture(true,false,undefined,undefined,true);
  assert(guard({currentLocation:{pathname:'/instruments',search:'?tab=groups'},nextLocation:{pathname:'/instruments',search:''}}),'Dirty editor must protect tab changes');
  assert(guard({currentLocation:{pathname:'/instruments',search:''},nextLocation:{pathname:'/dashboard',search:''}}));
  let prevented=false;unload({preventDefault:()=>{prevented=true;}});assert(prevented);
  module.exports.useWorkflowDeparture(false,false,undefined,undefined,true);
  assert.equal(guard({currentLocation:{pathname:'/instruments',search:'?tab=groups'},nextLocation:{pathname:'/dashboard',search:''}}),false);
}
async function verifyManagerCancellation() {
  const require=createRequire(import.meta.url);
  const bundle=await build({entryPoints:['apps/web/src/components/investments/InvestmentGroupsManager.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',define:{'import.meta.env':JSON.stringify({DEV:false})},external:['react-i18next','../../i18n/LanguageProvider','*/lib/apiClient','../ConfirmationDialog','react','react/jsx-runtime','react-router-dom','../../lib/investmentGroupsClient','./InvestmentGroupEditor']});
  const effects:Array<()=>()=>void>=[];let published=0,finish!:(value:unknown)=>void;
  const module={exports:{} as {InvestmentGroupsManager:(props:unknown)=>unknown}};
  new Function('module','exports','require',bundle.outputFiles[0].text)(module,module.exports,(name:string)=>name.endsWith('/lib/apiClient')?{ApiClientError}:name==='react-i18next'?{useTranslation:translationFixture}:name==='../../i18n/LanguageProvider'?{useUiLanguage:()=>({language:'zh-CN'})}:name==='react'?{...require('react'),useState:(value:unknown)=>[value,()=>{published++;}],useRef:(value:unknown)=>({current:value}),useEffect:(effect:()=>()=>void)=>{effects.push(effect);}}:name==='react-router-dom'?{Link:'a',useSearchParams:()=>[new URLSearchParams()]}:name==='../../lib/investmentGroupsClient'?{loadInvestmentGroups:()=>new Promise(resolve=>{finish=resolve;})}:name==='./InvestmentGroupEditor'?{InvestmentGroupEditor:'editor'}:require(name));
  module.exports.InvestmentGroupsManager({instruments:[]});const cleanup=effects[0]();cleanup();const before=published;finish({revision:'old',groups:[]});await new Promise(r=>setTimeout(r,0));assert.equal(published,before,'Obsolete configuration cannot publish after identity/unmount cleanup');
}

async function verifyMaintenanceTabs() {
  const require=createRequire(import.meta.url);
  const bundle=await build({entryPoints:['apps/web/src/components/investments/InvestmentInstrumentTabs.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',define:{'import.meta.env':JSON.stringify({DEV:false})},external:['react-i18next','react/jsx-runtime']});
  type El={props:Record<string,unknown>};
  const module={exports:{} as {InvestmentInstrumentTabs:(props:unknown)=>El}};
  new Function('module','exports','require',bundle.outputFiles[0].text)(module,module.exports,(name:string)=>name.endsWith('/lib/apiClient')?{ApiClientError}:name==='react-i18next'?{useTranslation:translationFixture}:require(name));
  let selected=false;const tree=module.exports.InvestmentInstrumentTabs({id:'tabs',groups:false,isAdmin:true,onSelect:(value:boolean)=>{selected=value;}});
  const buttons=tree.props.children as El[];
  assert.equal(buttons[0].props.tabIndex,0);assert.equal(buttons[1].props.tabIndex,-1);assert.equal(buttons[1].props['aria-controls'],'tabs-panel');assert.equal(buttons[0].props.id,'tabs-tab-0');
  const globals=globalThis as unknown as {document?:{getElementById:(id:string)=>{focus:()=>void}}};const previous=globals.document;let focused='';
  try {globals.document={getElementById:(id:string)=>({focus:()=>{focused=id;}})};(buttons[0].props.onKeyDown as (event:unknown)=>void)({key:'ArrowRight',preventDefault:()=>{}});assert.equal(selected,true);assert.equal(focused,'tabs-tab-1');(buttons[1].props.onKeyDown as (event:unknown)=>void)({key:'Home',preventDefault:()=>{}});assert.equal(selected,false);assert.equal(focused,'tabs-tab-0');} finally{globals.document=previous;}
  const viewer=module.exports.InvestmentInstrumentTabs({id:'v',groups:false,isAdmin:false,onSelect:()=>{}});assert.equal((viewer.props.children as El[]).filter(Boolean).length,1);
}
