import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import type { AccountStatement, SpendingImportDecision } from "@family-ledger/shared";
import { SpendingImportWorkspace } from "../components/spending/SpendingImportWorkspace";
import { spendingClient } from "../lib/spendingClient";
import { ApiClientError } from "../lib/apiClient";
import "../styles.css";

document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") === "light" ? "light" : "dark";
const scenario = new URLSearchParams(location.search).get("scenario") ?? "normal";
let confirmCalls = 0, commitCalls = 0, networkCalls = 0, createCalls = 0, allowDiscard = false;
let exactRetry = true, firstAttempt = "";
const changed = () => window.dispatchEvent(new Event("fixture-change"));
// The fixture replaces all methods used by the workspace before mounting it.
// Any unexpected fetch fails locally; no real session or API is used.
window.fetch = async () => { networkCalls++; changed(); throw new Error("Fixture blocked unexpected network request"); };
window.confirm = () => { confirmCalls++; changed(); return allowDiscard; };
const account = { id: "fixture-account", name: "隔离验收账户（长名称：只用于本地内存，不能写入共享环境）", source_format: "bnz" as const, default_currency: "NZD", identity_suffix: "0000", is_active: true };
let batch: AccountStatement = {
 id: "fixture-preview", account_id: account.id, account_name: account.name, status: "preview", created_at: "2026-11-05T00:00:00Z", expires_at: scenario === "expired" ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z", encoding: "utf-8", parser_version: "fixture", csv_file_key: "fixture.csv", csv_file_version: "1", csv_file_name: "synthetic.csv", csv_sha256: null, source_file_key: null, source_file_version: null, source_file_name: null, source_file_size: null, file_sha256: null, cancelled_at: null, total_count: 2, row_count: 0, edited_count: 0, imported_count: 0, skipped_count: 0, rejected_count: 0, date_from: null, date_to: null, preview_token: "fixture-token",
 preview: { encoding: "utf-8", parser_version: "fixture", warnings: [], errors: scenario === "malformed" ? [{ row_number: 9, message: "Synthetic malformed row" }] : [], rows: [1,2].map(n => ({ row_number:n, transaction_date:n===1?"2026-10-01":"2026-10-15", description:n===1?"重复候选（隔离数据）":"长中文描述：超长姓名及大额负数仅用于布局和重试验收", amount:n===1?"-12.34":"-1234567890.123456", classification:"spending", tag:null, notes:null, account_number_last4:"0000", counterparty_account_last4:null, counterparty_name:"隔离验收收款方", source_metadata:{}, fingerprint:"fixture-"+n, duplicate_count:n===1?1:0 })) }
};
const archive: AccountStatement = { ...structuredClone(batch), id:"fixture-archive", status:"committed", csv_file_name:"archived.csv", preview:null, imported_count:1, row_count:1, date_from:"2026-10-15", date_to:"2026-10-15" };
spendingClient.statements = async () => ({ statements:[structuredClone(batch),structuredClone(archive)], pagination:{limit:20,offset:0,total:2,hasMore:false} });
spendingClient.statement = async id => { if(scenario==="missing" || scenario==="revoked") throw new ApiClientError("导入记录不可用。","NOT_FOUND",404); return structuredClone(id===archive.id?archive:batch); };
spendingClient.createBatch = async () => {createCalls++; changed(); batch={...batch,id:"fixture-new",status:"draft"}; return structuredClone(batch);};
spendingClient.uploadCsv = async () => "fixture.csv";
spendingClient.preview = async () => {batch={...batch,status:"preview",expires_at:"2099-01-01T00:00:00Z",preview_token:"fixture-refreshed-token"};return structuredClone(batch);};
spendingClient.commit = async (id,token,decisions:SpendingImportDecision[]) => {
 commitCalls++;
 const identity=JSON.stringify({id,token,decisions}); if(!firstAttempt)firstAttempt=identity; else exactRetry &&= firstAttempt===identity;
 changed();
 if(scenario==="rejection")throw new ApiClientError("Synthetic preview rejected; reload or preview again.","VALIDATION_ERROR",400);
 if(scenario==="loss" && commitCalls===1)throw new Error("Synthetic response lost before commit");
 batch={...batch,status:"committed",imported_count:decisions.filter(d=>!d.skip).length,skipped_count:decisions.filter(d=>d.skip).length,row_count:decisions.filter(d=>!d.skip).length,date_from:"2026-10-15",date_to:"2026-10-15"};
 if(scenario==="lost-after-save")throw new Error("Synthetic response lost after commit");
 return structuredClone(batch);
};
spendingClient.cancel=async()=>{batch={...batch,status:"cancelled"};return structuredClone(batch);};
spendingClient.undo=async()=>{batch={...batch,status:"undone"};return {};};
spendingClient.removePdf=async()=>({});
spendingClient.uploadPdf=async()=>({});
spendingClient.csvUrl=async()=>{throw new Error("Fixture does not export files");};
spendingClient.pdfUrl=async()=>{throw new Error("Fixture does not export files");};
function FixtureFrame(){
 const [,render]=useState(0);
 useEffect(()=>{const listener=()=>render(v=>v+1);window.addEventListener("fixture-change",listener);return()=>window.removeEventListener("fixture-change",listener);},[]);
 return <main className="main-content app-shell" style={{margin:0}}><h1>Isolated import acceptance</h1><p><a href="?scenario=normal&theme=light">Light fixture theme</a> · <a href="?scenario=normal&theme=dark">Dark fixture theme</a></p><p data-testid="fixture-counts">Confirm calls: {confirmCalls} · Commit calls: {commitCalls} · Create calls: {createCalls} · Network calls: {networkCalls} · Exact retry: {String(exactRetry)}</p><label><input type="checkbox" onChange={event=>{allowDiscard=event.target.checked;}}/>Allow discard confirmation</label><p style={{display:"flex",flexWrap:"wrap",gap:8}}>{["normal","loss","lost-after-save","rejection","expired","malformed","viewer","missing","revoked","new"].map(name=><a style={{marginRight:12}} key={name} href={"?scenario="+name}>{name}</a>)}</p><Link to="/daily-expense?tab=spending&currency=NZD">返回家庭收支</Link><SpendingImportWorkspace accounts={scenario==="revoked"?[]:[account]} admin={scenario!=="viewer"} onSaved={changed} onViewRows={()=>{}}/></main>;
}
const router=createMemoryRouter([{path:"/daily-expense/import/:statementId",element:<FixtureFrame/>},{path:"/daily-expense/import",element:<FixtureFrame/>},{path:"/daily-expense",element:<p>Returned to applied query</p>}],{initialEntries:[scenario==="new"?"/daily-expense/import":"/daily-expense/import/fixture-preview"]});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router}/>);
