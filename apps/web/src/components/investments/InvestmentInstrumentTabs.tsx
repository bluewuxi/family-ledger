import { useTranslation } from "react-i18next";
import type { KeyboardEvent } from "react";

export function InvestmentInstrumentTabs({id,groups,isAdmin,onSelect}: {id:string;groups:boolean;isAdmin:boolean;onSelect:(groups:boolean)=>void}) {
  const {t} = useTranslation("investmentGroups");
  function keydown(event:KeyboardEvent<HTMLButtonElement>,index:number) {
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
    event.preventDefault();
    const next=!isAdmin||event.key==="Home"?0:event.key==="End"?1:1-index;
    onSelect(next===1);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }
  return <div className="trend-tabs" role="tablist" aria-label={t("tabs")}>{(isAdmin?["securities","groups"] as const:["securities"] as const).map((label,index)=>{
    const selected=groups===(index===1);
    return <button key={label} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={selected} tabIndex={selected?0:-1} className={selected?"active":""} onClick={()=>onSelect(index===1)} onKeyDown={event=>keydown(event,index)}>{t(label)}</button>;
  })}</div>;
}
