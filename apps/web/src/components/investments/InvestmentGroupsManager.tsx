import { useEffect, useRef, useState } from "react";
import type { Instrument, InvestmentGroup, InvestmentGroupConfiguration } from "@family-ledger/shared";
import { loadInvestmentGroups } from "../../lib/investmentGroupsClient";
import { observeAsync } from "../../lib/observeAsync";
import { InvestmentGroupEditor } from "./InvestmentGroupEditor";

export function InvestmentGroupsManager({instruments,onConfiguration}: {instruments:Instrument[];onConfiguration?:(value:InvestmentGroupConfiguration)=>void}) {
  const [configuration,setConfiguration]=useState<InvestmentGroupConfiguration|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [editor,setEditor]=useState<{group:InvestmentGroup|null;key:number}|null>(null);
  const sequence=useRef(0);
  async function load() {
    const request=++sequence.current;setLoading(true);setError(null);
    try {const value=await loadInvestmentGroups();if(request===sequence.current){setConfiguration(value);onConfiguration?.(value);}}
    catch(reason){if(request===sequence.current)setError(reason instanceof Error?reason.message:"加载分组失败。");}
    finally{if(request===sequence.current)setLoading(false);}
  }
  useEffect(()=>{observeAsync(load());const guard=sequence;return ()=>{guard.current++;};},[]); // eslint-disable-line react-hooks/exhaustive-deps
  function saved() {setEditor(null);observeAsync(load());}
  return <div className="group-management">
    <div className="group-management-actions"><p className="panel-description">自定义分组仅汇总当前持仓，不改变证券、估值或交易记录。</p><button type="button" className="primary-button" disabled={loading||!configuration} onClick={()=>setEditor({group:null,key:Date.now()})}>新建分组</button></div>
    {error?<div role="alert"><p className="form-error">{error}</p><button className="secondary-button" type="button" onClick={()=>observeAsync(load())}>重试</button></div>:null}
    {loading?<p role="status">正在加载分组…</p>:configuration?<div className="table-wrap"><table><thead><tr><th>分组名称</th><th>配置成员数</th><th>操作</th></tr></thead><tbody>{configuration.groups.map(group=><tr key={group.id}><td>{group.name}</td><td>{group.instrumentIds.length}</td><td><button type="button" className="secondary-button" onClick={()=>setEditor({group,key:Date.now()})}>编辑</button></td></tr>)}{!configuration.groups.length?<tr><td colSpan={3}>暂无分组，可新建空分组或选择成员证券。</td></tr>:null}</tbody></table></div>:null}
    {editor&&configuration?<InvestmentGroupEditor key={editor.key} open group={editor.group} configuration={configuration} instruments={instruments} onClose={()=>setEditor(null)} onSaved={saved} onReload={saved}/>:null}
  </div>;
}
