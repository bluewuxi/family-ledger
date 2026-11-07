import { Fragment, useState } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Link, RouterProvider, useLocation } from "react-router-dom";
import { LanguageProvider } from "../i18n/LanguageProvider";
import { App } from "../App";
import { initializeI18n, setUiLanguage } from "../i18n/instance";
import { isLocalLanguagePreview } from "../i18n/language";
import { AuthProvider } from "../lib/authContext";
import { initializeRuntimeConfig } from "../lib/runtimeConfig";
import { login } from "../lib/authClient";
import { InstrumentsPage } from "../pages/InstrumentsPage";
import { LoginPage } from "../pages/LoginPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { ChangePasswordPage } from "../pages/ChangePasswordPage";
import { Layout } from "../components/Layout";
import { RouteDocumentTitle } from "../components/RouteDocumentTitle";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { StartupFailure } from "../components/StartupFailure";
import { CurrencySelect } from "../components/CurrencySelect";
import { PaginationControls } from "../components/PaginationControls";
import type { CurrencyCode, InvestmentGroupConfiguration, SaveInvestmentGroupInput } from "@family-ledger/shared";
import "../styles.css";
import "./i18n-phase2.css";

// This separate DEV document replaces all transports and session storage before startup.
// It never delegates to the original fetch or persists a synthetic session on the origin.
if (isLocalLanguagePreview(import.meta.env.DEV, window.location.hostname)) start().catch(() => console.error("Isolated Phase 2 fixture startup failed"));
async function start() {
  const storage=new Map<string,string>();
  Object.defineProperty(window,"sessionStorage",{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value);},removeItem:(key:string)=>{storage.delete(key);}}});
  const parameters=new URLSearchParams(window.location.search);
  const role=parameters.get("role")==="viewer"?"viewer":"admin";
  const restricted=parameters.has("forced");
  const user={id:"00000000-0000-4000-8000-000000000010",email:"fixture@example.invalid",role};
  const expiresAt=new Date(Date.now()+3600000).toISOString();
  const id="00000000-0000-4000-8000-000000000001";
  const instruments=[{id,symbol:"FIX",name:"Fixture source security",shortName:"Synthetic security with a long original name",assetType:"stock",currency:"USD",marketRegion:"US",active:false},{id:"00000000-0000-4000-8000-000000000002",shortName:"Fixture cash",assetType:"cash",currency:"USD"}];
  let configuration:InvestmentGroupConfiguration={revision:"4",groups:parameters.has("empty")?[]:[{id:"00000000-0000-4000-8000-000000000003",name:"Original source group",instrumentIds:[id]}]};
  let mode=parameters.get("mode")??"success";
  let bootstrapping=true;
  const log:Array<{method:string;path:string;body?:unknown}>=[];
  const publish=()=>window.dispatchEvent(new Event("fixture-request"));
  window.fetch=async(input,init)=>{
    const url=new URL(String(input),window.location.href),method=init?.method??"GET";
    if(url.pathname==="/config.json")return Response.json({apiBaseUrl:"https://fixture.invalid"});
    if(url.origin!=="https://fixture.invalid")throw Error("Unexpected fixture transport");
    const path=url.pathname;
    log.push({method,path,...(path.startsWith("/investment-groups")&&init?.body?{body:JSON.parse(String(init.body)) as unknown}:{})});publish();
    if (!bootstrapping && path === "/auth/session" && parameters.has("sessionLoading")) await new Promise<void>(()=>{});
    await new Promise(resolve=>setTimeout(resolve,mode==="delay"&&!bootstrapping&&path!=="/auth/session"?Number(parameters.get("delay")??2500):40));
    const failure=(status:number,code:string)=>Response.json({success:false,error:{code,message:"Ignored synthetic private payload"}},{status});
    if (!bootstrapping && path === "/auth/session" && parameters.has("sessionFailure")) return failure(Number(parameters.get("sessionFailure")), parameters.get("sessionFailure")==="403"?"FORBIDDEN":"DEPENDENCY_UNAVAILABLE");
    if((path==="/instruments"&&parameters.has("instrumentFailure"))||(path==="/investment-groups"&&method==="GET"&&mode==="readFailure"))return failure(503,"DEPENDENCY_UNAVAILABLE");
    if(!bootstrapping&&method!=="GET"&&mode!=="success"&&mode!=="delay") {
      if(mode==="lost")throw Error("Synthetic response lost");
      const status=Number(mode);if([400,401,403,404,409,429,503].includes(status))return failure(status,({400:"VALIDATION_ERROR",401:"UNAUTHORIZED",403:"FORBIDDEN",404:"NOT_FOUND",409:"CONFLICT",429:"RATE_LIMITED",503:"DEPENDENCY_UNAVAILABLE"} as Record<number,string>)[status]);
    }
    let data:unknown;
    if(path==="/auth/login"&&method==="POST")data={token:"synthetic-document-only-token",expiresAt,mustChangePassword:restricted};
    else if(path==="/auth/session"&&method==="GET")data={user,expiresAt,mustChangePassword:restricted};
    else if(["/auth/change-password","/auth/logout"].includes(path)&&method==="POST")data={};
    else if(path==="/instruments"&&method==="GET")data={user,instruments};
    else if(path==="/investment-groups"&&method==="GET")data=configuration;
    else if(path.startsWith("/investment-groups")&&["POST","PUT","DELETE"].includes(method)) {
      const body=JSON.parse(String(init?.body)) as SaveInvestmentGroupInput;
      if(body.expectedRevision!==configuration.revision)return failure(409,"CONFLICT");
      const groupId=method==="POST"?"00000000-0000-4000-8000-000000000004":path.split("/").at(-1)!;
      const group=method==="DELETE"?null:{id:groupId,name:body.name,instrumentIds:body.instrumentIds};
      configuration={revision:String(Number(configuration.revision)+1),groups:configuration.groups.filter(g=>g.id!==groupId).map(g=>({...g,instrumentIds:g.instrumentIds.filter(member=>!group?.instrumentIds.includes(member))})).concat(group?[group]:[])};
      data={revision:configuration.revision,group};
    } else throw Error("Unexpected fixture request");
    return Response.json({success:true,data});
  };
  await initializeI18n();
  const initialLanguage=parameters.get("language");
  if(initialLanguage==="en"||initialLanguage==="zh-CN")await setUiLanguage(initialLanguage);
  document.documentElement.dataset.theme=parameters.get("theme")==="dark"?"dark":"light";
  await initializeRuntimeConfig();
  await login("fixture@example.invalid","synthetic-only-password");
  bootstrapping=false;
  const initial=parameters.get("page")??"/instruments?tab=groups&from=distribution";
  function Fixture() {
    const [version,setVersion]=useState(0),[currency,setCurrency]=useState<CurrencyCode>("USD"),[offset,setOffset]=useState(20);
    const {pathname,search}=useLocation();
    const surface=pathname+search;
    const sessionScenario=parameters.get("page")==="/session";
    const Provider=sessionScenario?Fragment:AuthProvider;
    window.onfixturechange=()=>setVersion(v=>v+1);
    return <Provider><RouteDocumentTitle /><div className={parameters.has("compact")?"fixture-controls fixture-controls-compact":"fixture-controls"}><strong>Isolated Phase 2 fixture — no live transport</strong><LanguageSwitch /><label>Response mode<select value={mode} onChange={event=>{mode=event.target.value;setVersion(v=>v+1);}}>{["success","delay","readFailure","400","401","403","404","409","429","503","lost"].map(value=><option key={value}>{value}</option>)}</select></label><button type="button" onClick={()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==="dark"?"light":"dark";}}>Toggle local theme</button>{["/instruments?tab=groups&from=distribution","/login?logoutUnconfirmed=1","/forgot-password","/reset-password","/change-password","/startup"].map(path=><Link key={path} to={path}>{path}</Link>)}<output data-testid="request-count">Requests: {log.length} · render {version}</output><details><summary>Synthetic request log</summary><pre>{JSON.stringify(log,null,2)}</pre></details></div>{sessionScenario?<App />:surface.startsWith("/login")?<LoginPage />:surface.startsWith("/forgot")||surface.startsWith("/reset")?<ForgotPasswordPage />:surface.startsWith("/change")?<ChangePasswordPage />:surface.startsWith("/startup")?<StartupFailure />:<Layout><InstrumentsPage /><CurrencySelect label="Fixture currency" options={["USD","NZD","HKD","CNY","GBP","EUR"]} value={currency} onChange={setCurrency}/><PaginationControls pagination={{total:45,offset,limit:20,hasMore:offset<40}} loading={false} onPageChange={setOffset}/></Layout>}</Provider>;
  }
  window.addEventListener("fixture-request",()=>window.onfixturechange?.());
  const router=createMemoryRouter([{path:"*",element:<Fixture />}],{initialEntries:[initial==="/session"?"/dashboard":initial]});
  createRoot(document.getElementById("root")!).render(<LanguageProvider><RouterProvider router={router}/></LanguageProvider>);
}
declare global { interface Window { onfixturechange?:()=>void } }
