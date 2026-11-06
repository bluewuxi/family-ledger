import { useId, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { InvestmentDashboardSummary } from "@family-ledger/shared";
import { DistributionPanel } from "./DistributionPanel";
import { LoadingBlock } from "./LoadingState";

export function InvestmentDistributionPanel({dashboard,loading,isAdmin,onRetry}: {dashboard:InvestmentDashboardSummary|null;loading:boolean;isAdmin:boolean;onRetry:()=>void}) {
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
    <div className="trend-tabs" role="tablist" aria-label="投资分布">{["证券分布","分组分布"].map((name,index)=><button key={name} type="button" role="tab" id={`${id}-tab-${index}`} aria-selected={groups === (index===1)} aria-controls={`${id}-panel`} tabIndex={groups === (index===1)?0:-1} className={groups === (index===1)?"active":""} onClick={()=>select(index===1)} onKeyDown={event=>keydown(event,index)}>{name}</button>)}</div>
    <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${groups?1:0}`}>
      {loading ? <LoadingBlock label="正在加载投资分布" /> : unavailable ? <div role="alert"><p>分组配置暂时不可用，证券分布仍可查看。</p><button className="secondary-button" type="button" onClick={onRetry}>重试</button></div> : <DistributionPanel title={groups?"分组分布":"证券分布"} embedded rows={groups?distribution?.rows??[]:dashboard?.holdingAllocations??[]} total={dashboard?.totalAssets} loading={false} validity={groups?distribution?.canShowPercentages:undefined} reason={groups?distribution?.reason:undefined} />}
    </section>
    <footer className="investment-distribution-footer"><p>占比以全部投资净资产为分母，含现金。</p>{groups && isAdmin ? <Link className="secondary-button" to="/instruments?tab=groups&from=distribution">管理分组</Link>:null}</footer>
  </article>;
}
