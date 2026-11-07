import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
const require = createRequire(new URL("./package.json", import.meta.url));
const source = `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {MemoryRouter} from 'react-router-dom'; import {LanguageProvider} from './apps/web/src/i18n/LanguageProvider'; import {initializeI18n,setUiLanguage} from './apps/web/src/i18n/instance'; import {LoginPage} from './apps/web/src/pages/LoginPage'; import {ForgotPasswordPage} from './apps/web/src/pages/ForgotPasswordPage'; import {LoadingState} from './apps/web/src/components/LoadingState'; import {PaginationControls} from './apps/web/src/components/PaginationControls'; export {initializeI18n,setUiLanguage}; export function render(){return renderToStaticMarkup(<LanguageProvider><MemoryRouter><LoginPage/><ForgotPasswordPage/><LoadingState/><PaginationControls pagination={{total:45,limit:20,offset:20,hasMore:true}} loading={false} onPageChange={()=>{throw Error('Unexpected page change')}}/></MemoryRouter></LanguageProvider>);}`;
const bundle = await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',define:{'import.meta.env':JSON.stringify({DEV:true})},external:['react','react/jsx-runtime','react-dom/server','react-router-dom']});
const module = {exports:{} as {initializeI18n:()=>Promise<void>;setUiLanguage:(value:'en'|'zh-CN')=>Promise<void>;render:()=>string}};
let requests=0;
new Function('module','exports','require','window','fetch',bundle.outputFiles[0].text)(module,module.exports,require,{location:{hostname:'localhost'},localStorage:{getItem:()=> 'en',setItem:()=>{}}},()=>{requests++;throw Error('Unexpected request');});
await module.exports.initializeI18n();
let html=module.exports.render();assert(html.includes('Log in'),'Stored English must render complete login');assert(html.includes('Contact an administrator'));assert(html.includes('Page 2 of 3'));assert(!html.includes('请输入密码'));
await module.exports.setUiLanguage('zh-CN');html=module.exports.render();assert(html.includes('登录'));assert(html.includes('第 2 / 3 页'));assert.equal(requests,0);
console.log('Real React server-rendered bilingual auth/shared surfaces, stored-English first render and zero transport passed; browser state/focus acceptance remains separate');

// Stateful hook fixtures exercise the real event handlers with no browser or live transport.
import { i18n } from "./src/i18n/instance";
import { ApiClientError } from "./src/lib/apiClient";
import { AuthClientError } from "./src/lib/authClient";
import type { UiLanguage } from "./src/i18n/language";
type ElementNode={type:unknown;props:Record<string,unknown>};
const nodes=(node:unknown):ElementNode[]=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&'props' in node?[node as ElementNode,...nodes((node as ElementNode).props.children),...nodes((node as ElementNode).props.footer)]:[];
async function harness(entry:string, exportName:string, dependencies:Record<string,unknown>={}) {
  let language:UiLanguage='en',si=0,ri=0;
  const states:unknown[]=[],refs:Array<{current:unknown}>=[],effects:Array<()=>unknown>=[];
  const react={...require('react'),useState:(initial:unknown)=>{const i=si++;if(!(i in states))states[i]=typeof initial==='function'?(initial as ()=>unknown)():initial;return [states[i],(next:unknown)=>{states[i]=typeof next==='function'?(next as (previous:unknown)=>unknown)(states[i]):next;}];},useRef:(initial:unknown)=>refs[ri++]??={current:initial},useEffect:(effect:()=>unknown)=>{effects.push(effect);},useMemo:(factory:()=>unknown)=>factory(),useId:()=> 'fixture-id'};
  const external=['./apiClient','react','react/jsx-runtime','react-i18next','react-router-dom','*/i18n/LanguageProvider','*/lib/apiClient','*/lib/authClient','*/lib/authContext','*/lib/useWorkflowDeparture','*/components/LanguageSwitch','../LanguageSwitch','../ConfirmationDialog','../Drawer',...Object.keys(dependencies)];
  const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',define:{'import.meta.env':JSON.stringify({DEV:false})},external});
  const mod={exports:{} as Record<string,(props:Record<string,unknown>)=>ElementNode>};
  new Function('module','exports','require',result.outputFiles[0].text)(mod,mod.exports,(name:string)=> {
    if(name in dependencies)return dependencies[name];
    if(name==='react')return react;
    if(name==='react-i18next')return {useTranslation:(namespace:import('i18next').Namespace)=>({t:i18n.getFixedT(language,namespace)})};
    if(name.endsWith('/i18n/LanguageProvider'))return {useUiLanguage:()=>({language})};
    if(name.endsWith('/apiClient'))return dependencies['../lib/apiClient']??{ApiClientError};
    if(name.endsWith('/lib/authClient'))return {AuthClientError};
    if(name.endsWith('/LanguageSwitch'))return {LanguageSwitch:'language-switch'};
    if(name==='../Drawer')return {Drawer:'drawer'};
    if(name==='../ConfirmationDialog')return {ConfirmationDialog:'confirmation'};
    if(name.endsWith('/lib/useWorkflowDeparture'))return {useWorkflowDeparture:()=>{}};
    if(name==='react-router-dom')return {Link:'a',useNavigate:()=>()=>{},useSearchParams:()=>[new URLSearchParams('logoutUnconfirmed=1&passwordChanged=1')]};
    return require(name);
  });
  return {render:(props:Record<string,unknown>={})=>{si=ri=0;return mod.exports[exportName](props);},invoke:(component:(props:Record<string,unknown>)=>ElementNode,props:Record<string,unknown>={})=>{si=ri=0;return component(props);},switch:(value:UiLanguage)=>{language=value;},mount:()=>{const pending=effects.splice(0);return pending.map(effect=>effect());},states,refs};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const click=(node:ElementNode)=>{(node.props.onClick as ()=>void)();};
const submit=(tree:ElementNode)=>{(nodes(tree).find(n=>n.type==='form')!.props.onSubmit as (event:unknown)=>void)({preventDefault:()=>{},currentTarget:{elements:{namedItem:()=>({validity:{typeMismatch:false,valid:true}})}}});};
const input=(tree:ElementNode,index:number,value:string)=>{(nodes(tree).filter(n=>n.type==='input')[index].props.onChange as (event:unknown)=>void)({target:{value}});};
const groupId='00000000-0000-4000-8000-000000000003',memberId='00000000-0000-4000-8000-000000000001';
for(const [status,code,keyText] of [[400,'VALIDATION_ERROR','Check the group name'],[403,'FORBIDDEN','You do not have access'],[404,'NOT_FOUND','no longer exists'],[409,'CONFLICT','Reload and review'],[503,'DEPENDENCY_UNAVAILABLE','result is unknown'],[0,'transport','result is unknown']] as const) {
  const calls:Array<{path:string;method:string;body:unknown}>=[];
  let reject!:(error:unknown)=>void;
  const h=await harness('apps/web/src/components/investments/InvestmentGroupEditor.tsx','InvestmentGroupEditor',{
    '../lib/apiClient':{ApiClientError,apiRequest:(path:string,options:{method:string;body:unknown})=>{calls.push({path,...options});return new Promise((_resolve,rejection)=>{reject=rejection;});}}
  });
  const props={open:true,group:{id:groupId,name:'Original',instrumentIds:[]},configuration:{revision:'4',groups:[]},instruments:[{id:memberId,shortName:'Source name',assetType:'stock',active:false}],onClose:()=>{},onSaved:()=>{throw Error('Failure cannot close draft');}};
  let tree=h.render(props);h.mount();input(tree,0,'Retained 😀');tree=h.render(props);
  (nodes(tree).find(n=>n.props.type==='checkbox')!.props.onChange as (event:unknown)=>void)({target:{checked:true}});tree=h.render(props);
  submit(tree);submit(tree);assert.equal(calls.length,1);assert.deepEqual(calls[0],{path:`/investment-groups/${groupId}`,method:'PUT',body:{name:'Retained 😀',instrumentIds:[memberId],expectedRevision:'4'}});
  h.switch('zh-CN');tree=h.render({...props,configuration:{revision:'999',groups:[]}});assert.equal(nodes(tree).find(n=>n.props.type==='submit')!.props.disabled,true);assert.equal(nodes(tree).find(n=>n.type==='input')!.props.value,'Retained 😀');assert.equal(calls.length,1);
  reject(status?new ApiClientError('secret-like-marker',code,status):new Error('secret-like-marker'));await tick();h.switch('en');tree=h.render(props);assert(JSON.stringify(tree).includes(keyText));assert(!JSON.stringify(tree).includes('secret-like-marker'));assert.equal(nodes(tree).find(n=>n.type==='input')!.props.value,'Retained 😀');
  h.switch('zh-CN');const chinese=h.render(props);assert.notEqual(JSON.stringify(chinese),JSON.stringify(tree));assert.equal(calls.length,1);
  if(status===409){assert.equal(nodes(tree).find(n=>n.props.type==='submit')!.props.disabled,true);submit(tree);assert.equal(calls.length,1);}
}
{
  let requests=0,deleted=0,reloaded=0;
  const h=await harness('apps/web/src/components/investments/InvestmentGroupEditor.tsx','InvestmentGroupEditor',{'../lib/apiClient':{ApiClientError,apiRequest:async(path:string,options:{method:string;body:unknown})=>{requests++;assert.equal(path,`/investment-groups/${groupId}`);assert.equal(options.method,'DELETE');assert.deepEqual(options.body,{expectedRevision:'4'});deleted++;return {revision:'5',group:null};}}});
  const props={open:true,group:{id:groupId,name:'Delete',instrumentIds:[]},configuration:{revision:'4',groups:[]},instruments:[],onClose:()=>{},onSaved:()=>{},onReload:()=>{reloaded++;}};
  let tree=h.render(props);h.mount();click(nodes(tree).find(n=>n.props.className==='danger-button')!);tree=h.render(props);let confirmation=nodes(tree).find(n=>n.type==='confirmation')!;assert.equal(confirmation.props.open,true);assert.equal(requests,0);assert(String(confirmation.props.message).includes('Securities and transactions will be kept'));
  h.switch('zh-CN');tree=h.render(props);confirmation=nodes(tree).find(n=>n.type==='confirmation')!;assert(String(confirmation.props.message).includes('不会删除证券或交易'));assert.equal(nodes(tree).find(n=>n.type==='drawer')!.props.suspended,true);(confirmation.props.onCancel as ()=>void)();assert.equal(requests,0);
  tree=h.render(props);click(nodes(tree).find(n=>n.props.className==='danger-button')!);tree=h.render(props);(nodes(tree).find(n=>n.type==='confirmation')!.props.onConfirm as ()=>void)();await tick();assert.equal(deleted,1);assert.equal(reloaded,0);
}
{
  let attempts=0,reject!:(error:unknown)=>void;
  const h=await harness('apps/web/src/pages/LoginPage.tsx','LoginPage',{'../lib/authClient':{AuthClientError,login:()=>{attempts++;return new Promise((_resolve,rejection)=>{reject=rejection;});}}});
  let tree=h.render();h.mount();submit(tree);tree=h.render();assert(JSON.stringify(tree).includes('Enter your email'));assert.equal(attempts,0);input(tree,0,'fixture@example.invalid');input(tree,1,'synthetic-password');tree=h.render();submit(tree);assert.equal(attempts,1);h.switch('zh-CN');tree=h.render();assert.equal(nodes(tree).filter(n=>n.type==='input')[1].props.value,'synthetic-password');assert.equal(attempts,1);reject(new AuthClientError(401,'UNAUTHORIZED'));await tick();tree=h.render();assert(JSON.stringify(tree).includes('邮箱或密码不正确'));h.switch('en');tree=h.render();assert(JSON.stringify(tree).includes('email or password is incorrect'));assert.equal(nodes(tree).filter(n=>n.type==='input')[1].props.value,'');assert.equal(attempts,1);
}
{
  let writes=0;
  const h=await harness('apps/web/src/pages/ChangePasswordPage.tsx','ChangePasswordPage',{'../lib/authContext':{useAuth:()=>({session:{mustChangePassword:true},signOut:async()=>true})},'../lib/authClient':{AuthClientError,changePassword:async()=>{writes++;return false;},getCurrentSession:()=>({})}});
  let tree=h.render();assert(JSON.stringify(tree).includes('temporary password'));submit(tree);tree=h.render();assert(JSON.stringify(tree).includes('Enter your current password'));assert.equal(writes,0);input(tree,0,'synthetic-current');
  for(const value of ['a'.repeat(7),'😀'.repeat(129)]){tree=h.render();input(tree,1,value);input(tree,2,value);tree=h.render();submit(tree);tree=h.render();assert(JSON.stringify(tree).includes('8 to 128'));assert.equal(writes,0);}
  input(tree,1,'a'.repeat(8));input(tree,2,'different');tree=h.render();submit(tree);tree=h.render();assert(JSON.stringify(tree).includes('do not match'));h.switch('zh-CN');tree=h.render();assert(JSON.stringify(tree).includes('两次输入的新密码不一致'));assert.equal(writes,0);
  input(tree,2,'a'.repeat(8));tree=h.render();submit(tree);await tick();assert.equal(writes,1);
}
console.log('Stateful real-handler fixtures: exact group transports/revision, six failure classes, pending/switch/error draft retention, delete cancel/confirm, auth pending and password validation passed');

{
  let pointer:((event:unknown)=>void)|undefined;
  class Target { closest(selector:string){return selector===".language-switch"?{}:null;} }
  const globals=globalThis as unknown as {document?:unknown;Element?:unknown}; const previous={document:globals.document,Element:globals.Element};
  try {
    globals.Element=Target; globals.document={addEventListener:(_name:string,callback:(event:unknown)=>void)=>{pointer=callback;},removeEventListener:()=>{}};
    const h=await harness('apps/web/src/components/CurrencySelect.tsx','CurrencySelect');
    const props={label:'Currency',options:['USD','NZD'],value:'USD',onChange:()=>{throw Error('Language must not change currency');}};
    let tree=h.render(props);h.mount();click(nodes(tree).find(n=>n.props['aria-haspopup']==='listbox')!);tree=h.render(props);assert(nodes(tree).some(n=>n.props.role==='listbox'));
    pointer!({target:new Target()});h.switch('zh-CN');tree=h.render(props);assert(nodes(tree).some(n=>n.props.role==='listbox'),'Clicking language controls must preserve the open currency menu');
  } finally {globals.document=previous.document;globals.Element=previous.Element;}
}


for(const role of ['admin','viewer']) {
  let reads=0,reject!:(error:unknown)=>void;
  const parameters=new URLSearchParams('tab=groups&from=distribution');
  const h=await harness('apps/web/src/pages/InstrumentsPage.tsx','InstrumentsPage',{
    '../lib/authContext':{useAuth:()=>({session:{user:{id:'fixture',role},expiresAt:'2099-01-01',mustChangePassword:false}})},
    '../lib/apiClient':{ApiClientError,apiGet:(path:string)=>{assert.equal(path,'/instruments');reads++;return new Promise((_resolve,rejection)=>{reject=rejection;});}},
    'react-router-dom':{Link:'a',useSearchParams:()=>[parameters,()=>{}]}
  });
  const workspace=h.render().type as (props:Record<string,unknown>)=>ElementNode;
  let tree=h.invoke(workspace);h.mount();
  if(role==='admin')assert(JSON.stringify(tree).includes('Loading member securities'));
  else assert(JSON.stringify(tree).includes('You do not have access'));
  assert(!nodes(tree).some(node=>node.props.className==='group-member-list'),'Pending entry cannot expose an incomplete selector');
  assert.equal(reads,1);
  reject(new ApiClientError('Ignored source error','DEPENDENCY_UNAVAILABLE',503));await tick();tree=h.invoke(workspace);
  if(role==='admin')assert(JSON.stringify(tree).includes('temporarily unavailable'));
  else assert(JSON.stringify(tree).includes('You do not have access'));
  h.switch('zh-CN');tree=h.invoke(workspace);assert(JSON.stringify(tree).includes(role==='admin'?'服务暂时不可用':'当前用户没有访问权限'));assert.equal(reads,1);assert.equal(parameters.toString(),'tab=groups&from=distribution');
}
console.log('Direct group entry loading/failure and viewer denial preserve route, omit incomplete members and issue no configuration requests');

const productionBundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',define:{'import.meta.env':JSON.stringify({DEV:false})},external:['react','react/jsx-runtime','react-dom/server','react-router-dom']});
const production={exports:{} as typeof module.exports};let storageReads=0;
new Function('module','exports','require','window','fetch',productionBundle.outputFiles[0].text)(production,production.exports,require,{location:{hostname:'localhost'},localStorage:{getItem:()=>{storageReads++;return 'en';},setItem:()=>{throw Error('Public build must not persist language switches');}}},()=>{throw Error('Unexpected public-render transport');});
await production.exports.initializeI18n();const publicHtml=production.exports.render();assert(publicHtml.includes('登录'));assert(!publicHtml.includes('class="language-switch"'));assert.equal(storageReads,0);await production.exports.setUiLanguage('en');assert.equal(production.exports.render(),publicHtml);
console.log('Production real-component render ignores stored English, rejects English switches and renders no language controls');
