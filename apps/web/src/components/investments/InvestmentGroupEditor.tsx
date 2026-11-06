import { useEffect, useRef, useState, type FormEvent } from "react";
import { parseSaveInvestmentGroupInput, type Instrument, type InvestmentGroup, type InvestmentGroupConfiguration } from "@family-ledger/shared";
import { Drawer } from "../Drawer";
import { useEditDismissal } from "../../lib/useEditDismissal";
import { useWorkflowDeparture } from "../../lib/useWorkflowDeparture";
import { saveInvestmentGroup, deleteInvestmentGroup } from "../../lib/investmentGroupsClient";
import { observeAsync } from "../../lib/observeAsync";

export function InvestmentGroupEditor({open,group,configuration,instruments,onClose,onSaved,onReload}: {open:boolean;group:InvestmentGroup|null;configuration:InvestmentGroupConfiguration;instruments:Instrument[];onClose:()=>void;onSaved:()=>void;onReload?:()=>void}) {
  const [name,setName] = useState(group?.name??"");
  const [instrumentIds,setInstrumentIds] = useState(group?.instrumentIds??[]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [conflict,setConflict] = useState(false);
  const original = useRef({name:group?.name??"",instrumentIds:group?.instrumentIds??[],revision:configuration.revision});
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(()=>{active.current=true;return ()=>{active.current=false;};},[]);
  const dirty = name !== original.current.name || [...instrumentIds].sort().join() !== [...original.current.instrumentIds].sort().join();
  const dismiss = useEditDismissal(open,busy,{name,instrumentIds},onClose);
  useWorkflowDeparture(dirty,busy,undefined,undefined,true);
  async function mutate(remove = false) {
    if (pending.current || conflict) return;
    setError(null);
    let input: ReturnType<typeof parseSaveInvestmentGroupInput>;
    try {
      input=parseSaveInvestmentGroupInput({name:remove?original.current.name:name,instrumentIds:remove?[]:instrumentIds,expectedRevision:original.current.revision});
      // Database normalization is authoritative; this is an immediate form hint.
      if (!remove && configuration.groups.some(item=>item.id!==group?.id && item.name.toLowerCase()===input.name.toLowerCase())) throw new Error("分组名称已存在。");
    } catch(reason) {setError(reason instanceof Error?reason.message:"分组输入无效。");return;}
    if (remove && (!group || !window.confirm("删除此分组后，所有成员将变为未分组。不会删除证券或交易。确定删除吗？"))) return;
    pending.current=true;setBusy(true);
    try {
      if(remove && group) await deleteInvestmentGroup(group.id,{expectedRevision:original.current.revision});
      else await saveInvestmentGroup(group?.id??null,input);
      if(active.current) onSaved();
    } catch(reason) {
      if(active.current) {
        setError(reason instanceof Error?reason.message:"保存结果未知，请刷新检查后再操作，不会自动重试。");
        if(reason && typeof reason==="object" && "status" in reason && reason.status===409) setConflict(true);
      }
    } finally {pending.current=false;if(active.current)setBusy(false);}
  }
  function submit(event:FormEvent) {event.preventDefault();observeAsync(mutate());}
  return <Drawer open={open} title={group?"编辑分组":"新建分组"} onClose={dismiss} busy={busy} footer={<>
    {group?<button type="button" className="danger-button" disabled={busy||conflict} onClick={()=>observeAsync(mutate(true))}>删除分组</button>:null}
    <button type="button" className="secondary-button" disabled={busy} onClick={dismiss}>取消</button>
    <button type="submit" form="investment-group-form" className="primary-button" disabled={busy||conflict}>{busy?"正在保存…":"保存分组"}</button>
  </>}>
    <form id="investment-group-form" className="instrument-form investment-group-form" onSubmit={submit}>
      <label>分组名称<input value={name} onChange={event=>setName(event.target.value)} disabled={busy} required aria-describedby="group-name-help" /></label>
      <p id="group-name-help" className="panel-description">1至32个字符。可创建空分组；每只非现金证券最多属于一个分组。</p>
      <fieldset disabled={busy}><legend>成员证券</legend><div className="group-member-list">{instruments.filter(item=>item.assetType!=="cash").map(item=>{
        const current=configuration.groups.find(candidate=>candidate.instrumentIds.includes(item.id));
        const moving=current && current.id!==group?.id && instrumentIds.includes(item.id);
        return <label className="group-member-option" key={item.id}><input type="checkbox" checked={instrumentIds.includes(item.id)} onChange={event=>setInstrumentIds(event.target.checked?[...instrumentIds,item.id]:instrumentIds.filter(id=>id!==item.id))}/><span>{item.shortName}{item.active===false?"（已停用）":""}<small>{current?`当前分组：${current.name}`:"未分组"}{moving?" · 保存后将移入本分组":""}</small></span></label>;
      })}</div></fieldset>
      {error?<p role="alert" className="form-error">{error}</p>:null}
      {conflict?<button type="button" className="secondary-button" onClick={()=>{if(window.confirm("重新加载会放弃当前草稿。请检查最新分组后重新编辑。"))onReload?.();}}>重新加载并检查</button>:null}
    </form>
  </Drawer>;
}
