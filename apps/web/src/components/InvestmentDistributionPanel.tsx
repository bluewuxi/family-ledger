import { useUiLanguage } from "../i18n/LanguageProvider";
import { dashboardCopy as copy } from "../i18n/investmentCopy";
import { useId, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { InvestmentDashboardSummary } from "@family-ledger/shared";
import { DistributionPanel } from "./DistributionPanel";
import { LoadingBlock } from "./LoadingState";

export function InvestmentDistributionPanel({dashboard,loading,isAdmin,onRetry}: {dashboard:InvestmentDashboardSummary|null;loading:boolean;isAdmin:boolean;onRetry:()=>void}) {
  const { language } = useUiLanguage();
  const [params,setParams] = useSearchParams();
  const id = useId();
  const groups = params.get("distribution") === "groups";
  function select(value: boolean) {
    const next = new URLSearchParams(params);
    if (value) next.set("distribution","groups"); else next.delete("distribution");
    setParams(next,{replace:true});
  }
  function keydown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1-index;
    select(next === 1);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }
  const distribution = dashboard?.groupDistribution;
  const unavailable = groups && (!distribution || distribution.status === "unavailable");
  return <article className="flow-card allocation-panel investment-distribution">
    <div className="trend-tabs" role="tablist" aria-label={copy("investmentDistribution", language)}>{[copy("securities", language),copy("groups", language)].map((name,index)=><button key={index} type="button" role="tab" id={`${id}-tab-${index}`} aria-selected={groups === (index===1)} aria-controls={`${id}-panel`} tabIndex={groups === (index===1)?0:-1} className={groups === (index===1)?"active":""} onClick={()=>select(index===1)} onKeyDown={event=>keydown(event,index)}>{name}</button>)}</div>
    <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${groups?1:0}`}>
      {loading ? <LoadingBlock label={copy("loadingDistribution", language)} /> : unavailable ? <div role="alert"><p>{copy("groupUnavailable", language)}</p><button className="secondary-button" type="button" onClick={onRetry}>{copy("retry", language)}</button></div> : <DistributionPanel title={groups?copy("groups", language):copy("securities", language)} embedded rows={groups?distribution?.rows??[]:dashboard?.holdingAllocations??[]} total={dashboard?.totalAssets} loading={false} validity={groups?distribution?.canShowPercentages:undefined} reason={groups?distribution?.reason:undefined} />}
    </section>
    <footer className="investment-distribution-footer"><p>{copy("distributionHelp", language)}</p>{groups && isAdmin ? <Link className="secondary-button" to="/instruments?tab=groups&from=distribution">{copy("manageGroups", language)}</Link>:null}</footer>
  </article>;
}
