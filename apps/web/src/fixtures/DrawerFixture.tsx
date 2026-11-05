import { useEditDismissal } from "../lib/useEditDismissal";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Drawer } from "../components/Drawer";
import "../styles.css";
function DrawerFixture(){
 const [open,setOpen]=useState(false),[text,setText]=useState(""),[busy,setBusy]=useState(false),[allow,setAllow]=useState(false),[prompts,setPrompts]=useState(0),[error,setError]=useState("");
 useEffect(()=>{window.confirm=()=>{setPrompts(v=>v+1);return allow;};},[allow]);
 const requestDismiss=useEditDismissal(open,busy,text,()=>setOpen(false));
 const hookMode=new URLSearchParams(location.search).get("mode")==="hook";
 return <main className="main-content app-shell" style={{margin:0}}><h1>Isolated drawer acceptance</h1><p>No API/auth clients or network writes.</p><a href="?mode=hook">Use edit dismissal hook</a><p data-testid="drawer-state">Open: {String(open)} · Busy: {String(busy)} · Confirm calls: {prompts}</p><button type="button" onClick={()=>{setText("");setError("");setOpen(true);}}>Open fixture drawer</button><Drawer open={open} title="隔离抽屉" busy={busy} dirty={!hookMode && !!text} onClose={hookMode?requestDismiss:()=>setOpen(false)} footer={<><button type="button" disabled={busy} onClick={()=>{setBusy(true);setError("");}}>开始模拟保存</button>{busy?<><button type="button" onClick={()=>{setBusy(false);setError("模拟保存失败，输入仍保留。");}}>模拟保存失败</button><button type="button" onClick={()=>{setBusy(false);setOpen(false);}}>模拟保存成功</button></>:null}<button type="button" onClick={()=>{setBusy(false);setOpen(false);setText("");}}>模拟权限撤销</button></>}><fieldset disabled={busy}><label>名称<input value={text} onChange={event=>setText(event.target.value)}/></label><label><input type="checkbox" checked={allow} onChange={event=>setAllow(event.target.checked)}/>Allow discard confirmation</label></fieldset>{error?<p role="alert">{error}</p>:null}</Drawer></main>;
}
createRoot(document.getElementById("root")!).render(<DrawerFixture/>);
