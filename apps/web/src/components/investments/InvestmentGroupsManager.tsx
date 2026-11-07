import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../../i18n/LanguageProvider";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../../i18n/uiErrors";
import { useEffect, useRef, useState } from "react";
import type { Instrument, InvestmentGroup, InvestmentGroupConfiguration } from "@family-ledger/shared";
import { loadInvestmentGroups } from "../../lib/investmentGroupsClient";
import { observeAsync } from "../../lib/observeAsync";
import { InvestmentGroupEditor } from "./InvestmentGroupEditor";

export function InvestmentGroupsManager({instruments,onConfiguration}: {instruments:Instrument[];onConfiguration?:(value:InvestmentGroupConfiguration)=>void}) {
  const {t} = useTranslation(["investmentGroups", "common"]); const {language} = useUiLanguage();
  const [configuration,setConfiguration]=useState<InvestmentGroupConfiguration|null>(null);
  const [error,setError]=useState<UiErrorDescriptor|null>(null);
  const [loading,setLoading]=useState(true);
  const [editor,setEditor]=useState<{group:InvestmentGroup|null;key:number}|null>(null);
  const sequence=useRef(0);
  async function load() {
    const request=++sequence.current;setLoading(true);setError(null);
    try {const value=await loadInvestmentGroups();if(request===sequence.current){setConfiguration(value);onConfiguration?.(value);}}
    catch(reason){if(request===sequence.current)setError(describeUiError(reason,"groupLoad"));}
    finally{if(request===sequence.current)setLoading(false);}
  }
  useEffect(()=>{observeAsync(load());const guard=sequence;return ()=>{guard.current++;};},[]); // eslint-disable-line react-hooks/exhaustive-deps
  function saved() {setEditor(null);observeAsync(load());}
  return <div className="group-management">
    <div className="group-management-actions"><p className="panel-description">{t("help")}</p><button type="button" className="primary-button" disabled={loading||!configuration} onClick={()=>setEditor({group:null,key:Date.now()})}>{t("create")}</button></div>
    {error?<div role="alert"><p className="form-error">{translateUiError(error,language)}</p><button className="secondary-button" type="button" onClick={()=>observeAsync(load())}>{t("common:retry")}</button></div>:null}
    {loading?<p role="status">{t("loading")}</p>:configuration?<div className="table-wrap"><table><thead><tr><th>{t("name")}</th><th>{t("count")}</th><th>{t("actions")}</th></tr></thead><tbody>{configuration.groups.map(group=><tr key={group.id}><td>{group.name}</td><td>{group.instrumentIds.length}</td><td><button type="button" className="secondary-button" onClick={()=>setEditor({group,key:Date.now()})}>{t("editAction")}</button></td></tr>)}{!configuration.groups.length?<tr><td colSpan={3}>{t("empty")}</td></tr>:null}</tbody></table></div>:null}
    {editor&&configuration?<InvestmentGroupEditor key={editor.key} open group={editor.group} configuration={configuration} instruments={instruments} onClose={()=>setEditor(null)} onSaved={saved} onReload={saved}/>:null}
  </div>;
}
