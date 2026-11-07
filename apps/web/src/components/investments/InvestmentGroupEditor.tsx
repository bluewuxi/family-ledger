import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../../i18n/LanguageProvider";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../../i18n/uiErrors";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { LanguageSwitch } from "../LanguageSwitch";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { parseSaveInvestmentGroupInput, type Instrument, type InvestmentGroup, type InvestmentGroupConfiguration } from "@family-ledger/shared";
import { Drawer } from "../Drawer";
import { useEditDismissal } from "../../lib/useEditDismissal";
import { useWorkflowDeparture } from "../../lib/useWorkflowDeparture";
import { saveInvestmentGroup, deleteInvestmentGroup } from "../../lib/investmentGroupsClient";
import { observeAsync } from "../../lib/observeAsync";

export function InvestmentGroupEditor({open,group,configuration,instruments,onClose,onSaved,onReload}: {open:boolean;group:InvestmentGroup|null;configuration:InvestmentGroupConfiguration;instruments:Instrument[];onClose:()=>void;onSaved:()=>void;onReload?:()=>void}) {
  const {t} = useTranslation(["investmentGroups", "common"]); const {language} = useUiLanguage();
  const [confirmation,setConfirmation] = useState<"delete" | "reload" | null>(null);
  const [name,setName] = useState(group?.name??"");
  const [instrumentIds,setInstrumentIds] = useState(group?.instrumentIds??[]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<UiErrorDescriptor|null>(null);
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
      if (!remove && configuration.groups.some(item=>item.id!==group?.id && item.name.toLowerCase()===input.name.toLowerCase())) {setError({key:"duplicateName"});return;};
    } catch(reason) {setError(describeUiError(reason,"groupSave"));return;}
    if (remove && !group) return;
    pending.current=true;setBusy(true);
    try {
      if(remove && group) await deleteInvestmentGroup(group.id,{expectedRevision:original.current.revision});
      else await saveInvestmentGroup(group?.id??null,input);
      if(active.current) onSaved();
    } catch(reason) {
      if(active.current) {
        setError(describeUiError(reason,remove?"groupDelete":"groupSave"));
        if(reason && typeof reason==="object" && "status" in reason && reason.status===409) setConflict(true);
      }
    } finally {pending.current=false;if(active.current)setBusy(false);}
  }
  function submit(event:FormEvent) {event.preventDefault();observeAsync(mutate());}
  return <><Drawer open={open} suspended={confirmation !== null} title={group?t("edit"):t("create")} onClose={dismiss} busy={busy} footer={<>
    {group?<button type="button" className="danger-button" disabled={busy||conflict} onClick={()=>setConfirmation("delete")}>{t("delete")}</button>:null}
    <button type="button" className="secondary-button" disabled={busy} onClick={dismiss}>{t("common:cancel")}</button>
    <button type="submit" form="investment-group-form" className="primary-button" disabled={busy||conflict}>{busy?t("saving"):t("save")}</button>
  </>}>
    <LanguageSwitch /><form noValidate id="investment-group-form" className="instrument-form investment-group-form" onSubmit={submit}>
      <label>{t("name")}<input value={name} onChange={event=>setName(event.target.value)} disabled={busy} required aria-describedby="group-name-help" /></label>
      <p id="group-name-help" className="panel-description">{t("nameHelp")}</p>
      <fieldset disabled={busy}><legend>{t("members")}</legend><div className="group-member-list">{instruments.filter(item=>item.assetType!=="cash").map(item=>{
        const current=configuration.groups.find(candidate=>candidate.instrumentIds.includes(item.id));
        const moving=current && current.id!==group?.id && instrumentIds.includes(item.id);
        return <label className="group-member-option" key={item.id}><input type="checkbox" checked={instrumentIds.includes(item.id)} onChange={event=>setInstrumentIds(event.target.checked?[...instrumentIds,item.id]:instrumentIds.filter(id=>id!==item.id))}/><span>{item.shortName}{item.active===false?t("inactive"):""}<small>{current?t("current",{name:current.name}):t("ungrouped")}{moving?<span className="group-move-warning">{t("moving")}</span>:null}</small></span></label>;
      })}</div></fieldset>
      {error?<p role="alert" className="form-error">{translateUiError(error,language)}</p>:null}
      {conflict?<button type="button" className="secondary-button" onClick={()=>setConfirmation("reload")}>{t("reload")}</button>:null}
    </form>
  </Drawer><ConfirmationDialog open={confirmation !== null} title={confirmation==="delete"?t("delete"):t("reload")} message={confirmation==="delete"?t("deleteConfirm"):t("reloadConfirm")} confirmLabel={confirmation==="delete"?t("delete"):t("reload")} onCancel={()=>setConfirmation(null)} onConfirm={()=>{const action=confirmation;setConfirmation(null);if(action==="delete")observeAsync(mutate(true));else if(action==="reload")onReload?.();}} /></>;
}
