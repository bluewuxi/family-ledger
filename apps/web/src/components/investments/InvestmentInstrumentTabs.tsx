import type { KeyboardEvent } from "react";

export function InvestmentInstrumentTabs({id,groups,isAdmin,onSelect}: {id:string;groups:boolean;isAdmin:boolean;onSelect:(groups:boolean)=>void}) {
  function keydown(event:KeyboardEvent<HTMLButtonElement>,index:number) {
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
    event.preventDefault();
    const next=!isAdmin||event.key==="Home"?0:event.key==="End"?1:1-index;
    onSelect(next===1);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }
  return <div className="trend-tabs" role="tablist" aria-label="投资标的视图">{(isAdmin?["证券列表","分组管理"]:["证券列表"]).map((label,index)=>{
    const selected=groups===(index===1);
    return <button key={label} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={selected} tabIndex={selected?0:-1} className={selected?"active":""} onClick={()=>onSelect(index===1)} onKeyDown={event=>keydown(event,index)}>{label}</button>;
  })}</div>;
}
