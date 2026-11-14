import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import type { UiLanguage } from "./src/i18n/language";

const require = createRequire(new URL("./package.json", import.meta.url));
interface Instance {
  initializeI18n: () => Promise<void>;
  getUiLanguage: () => UiLanguage;
  setUiLanguage: (language: UiLanguage) => Promise<void>;
  subscribeLanguage: (listener: () => void) => () => void;
  i18n: { getFixedT: (language: UiLanguage, namespace: string) => (key: string, params?: object) => string };
}
async function fixture(dev: boolean, hostname: string) {
  const bundle = await build({entryPoints:["apps/web/src/i18n/instance.ts"],bundle:true,write:false,platform:"node",format:"cjs",define:{"import.meta.env":JSON.stringify({DEV:dev})}});
  let stored = "en", reads = 0, writes = 0;
  let requests = 0;
  const metadata = new Map<string,string>();
  const document = {documentElement:{lang:""},title:"",querySelector:(selector:string)=>({setAttribute:(_key:string,value:string)=>metadata.set(selector,value)})};
  const window = {location:{hostname},localStorage:{getItem:()=>{reads++;return stored;},setItem:(_key:string,value:string)=>{writes++;stored=value;}}};
  const module = {exports:{} as Instance};
  new Function("module","exports","require","window","document","fetch",bundle.outputFiles[0].text)(module,module.exports,require,window,document,()=>{requests++;throw new Error("Unexpected network");});
  return {instance:module.exports,document,metadata,reads:()=>reads,writes:()=>writes,requests:()=>requests,stored:()=>stored};
}
for (const dev of [true, false]) for (const hostname of ["localhost","127.0.0.1","[::1]","example.com","localhost.example.com"]) {
  const f = await fixture(dev, hostname);
  const first = f.instance.initializeI18n(); assert.equal(f.instance.initializeI18n(), first); await first;
  assert.equal(f.instance.getUiLanguage(), "en");
  assert.equal(f.document.documentElement.lang, "en");
  assert.equal(f.document.title, "Family Ledger");
  assert.equal(f.metadata.get('meta[name="application-name"]'), "Family Ledger");
  assert.equal(f.reads(), 1);
  let changes = 0; const unsubscribe = f.instance.subscribeLanguage(()=>{changes++;});
  await Promise.all([f.instance.setUiLanguage("en"),f.instance.setUiLanguage("zh-CN"),f.instance.setUiLanguage("en")]);
  assert.equal(f.instance.getUiLanguage(), "en");
  assert.equal(f.document.documentElement.lang, "en");
  assert.equal(f.instance.i18n.getFixedT("en","format")("hoursMinutes",{hours:"03",minutes:"21"}),"03h 21m");
  unsubscribe(); const before = changes; await f.instance.setUiLanguage("zh-CN"); assert.equal(changes,before);
  assert.equal(f.requests(), 0); assert.equal(f.stored(),"zh-CN"); assert(f.writes() > 0);
}
const provider = await build({entryPoints:["apps/web/src/i18n/LanguageProvider.tsx"],bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",external:["react","react/jsx-runtime","react-i18next","./instance"]});
let subscriptions = 0, cleanups = 0;
const child = {type:"router",key:null,props:{draft:"retained"}};
const providerModule = {exports:{} as {LanguageProvider:(props:unknown)=>{props:{children:unknown};key:unknown};useUiLanguage:()=>{language:UiLanguage;displayLocale:string;setLanguage:(language:UiLanguage)=>Promise<void>}}};
const f = await fixture(true,"localhost"); await f.instance.initializeI18n();
new Function("module","exports","require",provider.outputFiles[0].text)(providerModule,providerModule.exports,(name:string)=> {
  if (name === "react") return {...require("react"),useSyncExternalStore:(subscribe:(listener:()=>void)=>()=>void,getSnapshot:()=>UiLanguage)=>{const cleanup=subscribe(()=>{subscriptions++;});cleanup();cleanups++;return getSnapshot();}};
  if (name === "./instance") return f.instance;
  if (name === "react-i18next") return {I18nextProvider:"provider"};
  return require(name);
});
const tree = providerModule.exports.LanguageProvider({children:child});
assert.equal(tree.props?.children,child,"Provider must preserve router child identity");
assert.equal(tree.key,null);
let state = providerModule.exports.useUiLanguage(); assert.equal(state.language,"en"); assert.equal(state.displayLocale,"en-NZ");
await state.setLanguage("zh-CN"); state = providerModule.exports.useUiLanguage();
assert.equal(state.language,"zh-CN");assert.equal(cleanups,2);assert.equal(subscriptions,0);
for (const dev of [true,false]) for (const hostname of ["localhost","127.0.0.1","[::1]","example.com"]) {
  const preview = await build({entryPoints:["apps/web/src/i18n/DevelopmentLanguagePreview.tsx"],bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",loader:{".css":"empty"},define:{"import.meta.env":JSON.stringify({DEV:dev})},external:["react","react/jsx-runtime","react-i18next","./LanguageProvider"]});
  const module = {exports:{} as {DevelopmentLanguagePreview:()=>unknown}};
  new Function("module","exports","require","window",preview.outputFiles[0].text)(module,module.exports,(name:string)=> {
    if(name === "./LanguageProvider")return {useUiLanguage:()=>({language:"zh-CN",displayLocale:"zh-CN"})};
    if(name === "react")return {...require("react"),useId:()=>"fixture",useState:(value:unknown)=>[value,()=>undefined],useRef:()=>({current:null}),useEffect:()=>undefined};
    if(name === "react-i18next")return {useTranslation:()=>({t:(key:string)=>key})};
    return require(name);
  },{location:{hostname}});
  const result = module.exports.DevelopmentLanguagePreview();
  assert.equal(result !== null,dev && ["localhost","127.0.0.1","[::1]"].includes(hostname));
  if(result) {
    const sample = result as {type:()=>{props:Record<string,unknown>}};
    assert.equal(sample.type().props["data-preview-theme"],"light","Isolated theme probe defaults to light without changing preferences");
  }
}
for (const failConfig of [false,true]) {
  const bundle = await build({entryPoints:["apps/web/src/main.tsx"],minifySyntax:true,bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",loader:{".css":"empty"},define:{"import.meta.env.DEV":"false"},external:["react","react/jsx-runtime","react-dom/client","react-router-dom","./App","./lib/runtimeConfig","./lib/authClient","./i18n/instance","./i18n/LanguageProvider"]});
  assert(!bundle.outputFiles[0].text.includes("DevelopmentLanguagePreview"),"Production startup must eliminate preview code");
  let ready!:()=>void;const initialized=new Promise<void>(resolve=>{ready=resolve;});
  const events:string[]=[];const renders:unknown[]=[];
  new Function("require","document","console",bundle.outputFiles[0].text)((name:string)=>{
    if(name === "react-dom/client")return {createRoot:()=>({render:(node:unknown)=>{events.push("render");renders.push(node);}})};
    if(name === "./i18n/instance")return {initializeI18n:()=>{events.push("initialize");return initialized;}};
    if(name === "./i18n/LanguageProvider")return {LanguageProvider:"provider"};
    if(name === "./lib/runtimeConfig")return {initializeRuntimeConfig:async()=>{events.push("config");if(failConfig)throw new Error("Synthetic config failure");}};
    if(name === "./lib/authClient")return {clearLegacyAuthStorage:()=>{events.push("legacy-cleanup");}};
    if(name === "./App")return {App:"app"};
    if(name === "react-router-dom")return {RouterProvider:"router",createBrowserRouter:()=>{events.push("create-router");return {};}};
    return require(name);
  },{getElementById:()=>({})},{error:()=>{events.push("config-error");}});
  assert.deepEqual(events,["initialize"]);ready();await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(events,failConfig ? ["initialize","config","config-error","render"] : ["initialize","config","legacy-cleanup","create-router","render"]);
  assert.equal(renders.length,1);
}
console.log("Bundled startup success/failure, singleton/preview gate matrix, metadata, rapid switches, zero network and provider subscription/identity fixtures passed (not real React focus acceptance)");
