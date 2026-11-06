import Decimal from "decimal.js";
import { combineAccountValuations, calculateHoldings, calculatePortfolioSnapshotValuation, withSnapshotEligibility, prepareKernelNtaPlan,
  type KernelPriceAnchor, type NzxNtaRecord, type InvestmentAccount, type InvestmentTransaction, type Instrument,
  type PriceRecord, type ExchangeRateRecord, type PortfolioSnapshotValuation } from "../packages/shared/src/index";
export type Row = Record<string, unknown>;
export type Export = Record<string, Row[]>;
export function mapAnchor(a: Row): KernelPriceAnchor {
 return {id:String(a.id),instrumentId:String(a.instrument_id),anchorDate:String(a.anchor_date),kernelUnitPrice:String(a.kernel_unit_price),
 proxySymbol:String(a.proxy_symbol),proxyCurrency:"NZD",proxyClose:nullableString(a.proxy_close),proxyPriceDate:nullableString(a.proxy_price_date),
 proxyFetchedAt:nullableString(a.proxy_fetched_at),proxyValueType:a.proxy_value_type as KernelPriceAnchor["proxyValueType"],
 proxyAnnouncementId:a.proxy_announcement_id as number|null,proxyPublishedAt:nullableString(a.proxy_published_at),
 derivedFromAnchorId:nullableString(a.derived_from_anchor_id),ntaMappingVersion:Number(a.nta_mapping_version??1),
 createdByUserId:String(a.created_by_user_id),createdAt:String(a.created_at)};
}
export function previewRepair(t: Export, records: NzxNtaRecord[], fetchedAt: string, through: string) {
 const targets=t.instruments.filter(i=>i.price_source==="kernel_estimate"&&i.price_source_symbol==="USF.NZ"&&i.exchange==="KERNEL"&&i.currency==="NZD");
 if(targets.length!==1)throw new Error("Expected exactly one configured Kernel target.");
 const target=targets[0];
 const anchors=t.kernel_price_anchors.filter(a=>a.instrument_id===target.id).map(mapAnchor);
 const plan=prepareKernelNtaPlan(anchors,records,fetchedAt);
 const owned=(p:Row)=>p.instrument_id===target.id&&p.is_estimated===true&&!p.source_transaction_id&&["Kernel Estimate (USF NTA)","Kernel Estimate (USF.NZ)"].includes(String(p.provider));
 const old=t.instrument_prices.filter(owned), protectedPrices=t.instrument_prices.filter(p=>!owned(p));
 const estimates=plan.estimates.filter(e=>!protectedPrices.some(p=>p.instrument_id===target.id&&p.price_date===e.priceDate));
 const prices=protectedPrices.concat(estimates.map(e=>({instrument_id:target.id,price_date:e.priceDate,close_price:e.closePrice,currency:"NZD",provider:"Kernel Estimate (USF NTA)",is_estimated:true})));
 const dates=[...new Set([...old.map(p=>String(p.price_date)),...estimates.map(e=>e.priceDate)])].sort();
 const priceChanges=dates.flatMap(date=>{const before=old.find(p=>p.price_date===date),after=estimates.find(e=>e.priceDate===date);
 return before&&after&&new Decimal(String(before.close_price)).eq(after.closePrice)?[]:[{date,before:before?.close_price??null,after:after?.closePrice??null}];});
 if(priceChanges.some(c=>c.date>through))throw new Error("Price changes exceed the reviewed repair bound; extend --through explicitly.");
 const referenceChanges=plan.anchors.filter(a=>a.proxyValueType==="nta"&&!anchors.some(r=>(r.id===a.id||r.derivedFromAnchorId===a.id)&&r.ntaMappingVersion===2&&r.proxyAnnouncementId===a.proxyAnnouncementId&&r.proxyPriceDate===a.proxyPriceDate));
 const from=priceChanges[0]?.date??String(t.kernel_nta_refresh_state.find(r=>r.instrument_id===target.id)?.pending_snapshot_from??through);
 const repairDates:string[]=[];for(let d=from;d<=through;){repairDates.push(d);const next=new Date(d+"T00:00:00Z");next.setUTCDate(next.getUTCDate()+1);d=next.toISOString().slice(0,10);}
 const allDates=[...new Set([...t.portfolio_snapshot_headers,...t.snapshot_pending_dates].map(r=>String(r.snapshot_date)).concat(repairDates))].sort();
 const snapshots=allDates.map(date=>{const before=calculate(t,date,t.instrument_prices),after=calculate(t,date,prices);
 const header=t.portfolio_snapshot_headers.find(h=>h.snapshot_date===date);
 const accounts=t.portfolio_account_snapshots.filter(a=>a.snapshot_date===date);
 return {date,before,after,storedMismatches:header?compareStored(header,accounts,before):[],changed:JSON.stringify(before)!==JSON.stringify(after)};});
 return {plan,referenceChanges,priceChanges,from,through,repairDates,snapshots,checkedDates:allDates.length,
 availabilityRegressions:snapshots.filter(s=>s.before.publicationStatus==="ready"&&s.after.publicationStatus!=="ready").map(s=>s.date)};
}
export function calculate(t:Export,date:string,prices:Row[]):PortfolioSnapshotValuation {
 const accounts=t.investment_accounts.map(mapAccountRow),instruments=t.instruments.map(mapInstrumentRow),
 transactions=t.transactions.map(mapTransactionRow).filter(r=>r.tradeDate<=date),fxRates=t.exchange_rates.map(mapExchangeRateRow).filter(r=>r.rateDate<=date),
 mappedPrices=prices.map(mapPriceRow).filter(r=>r.priceDate<=date),holdings=calculateHoldings(transactions,accounts,instruments,{fxRates});
 return withSnapshotEligibility(calculatePortfolioSnapshotValuation({snapshotDate:date,holdings,accounts,prices:mappedPrices,fxRates}),{holdings,instruments,prices:mappedPrices,fxRates});
}
export function compareStored(h:Row,accounts:Row[],v:PortfolioSnapshotValuation):string[]{
 const errors:string[]=[];
 const equal=(a:unknown,b:unknown)=>a==null||b==null?(a??null)===(b??null):new Decimal(String(a)).eq(String(b));
 const compare=(r:Row,expected:object,fields:Record<string,string>,label:string)=>{for(const [db,key] of Object.entries(fields))if(!equal(r[db],(expected as Row)[key]))errors.push(label+"."+db);
 const warnings=(x:unknown)=>JSON.stringify(Array.isArray(x)?x.map(w=>JSON.stringify(w)).sort():x);
 if(warnings(r.warnings)!==warnings((expected as Row).warnings))errors.push(label+".warnings");};
 const total=combineAccountValuations(v.snapshotDate,accounts.map(a=>({accountId:String(a.account_id),accountName:String(a.account_name),
 marketValueUsd:nullableString(a.market_value_usd),costUsd:nullableString(a.cost_usd),unrealizedGainUsd:nullableString(a.unrealized_gain_usd),
 dailyChangeUsd:nullableString(a.daily_change_usd),dailyChangePct:nullableString(a.daily_change_pct),warnings:a.warnings as PortfolioSnapshotValuation["warnings"]})),String(h.usd_to_nzd_rate),String(h.usd_to_cny_rate));
 const derived={...h,total_market_value_usd:total.marketValueUsd,total_cost_usd:total.costUsd,unrealized_gain_usd:total.unrealizedGainUsd,
 daily_change_usd:total.dailyChangeUsd,daily_change_pct:total.dailyChangePct,warnings:total.warnings};
 compare(derived,v,{total_market_value_usd:"marketValueUsd",total_cost_usd:"costUsd",unrealized_gain_usd:"unrealizedGainUsd",daily_change_usd:"dailyChangeUsd",daily_change_pct:"dailyChangePct",usd_to_nzd_rate:"usdToNzdRate",usd_to_cny_rate:"usdToCnyRate"},"portfolio");
 if(Boolean(h.is_available)!==(v.publicationStatus==="ready"))errors.push("portfolio.availability");
 for(const a of v.accounts){const row=accounts.find(r=>r.account_id===a.accountId);if(!row){errors.push(a.accountId+".missing");continue;}
 compare(row,a,{market_value_usd:"marketValueUsd",cost_usd:"costUsd",unrealized_gain_usd:"unrealizedGainUsd",daily_change_usd:"dailyChangeUsd",daily_change_pct:"dailyChangePct"},a.accountId);
 if(row.account_name!==a.accountName)errors.push(a.accountId+".name");}
 if(accounts.length!==v.accounts.length)errors.push("accounts.count");return errors;
}
function mapAccountRow(row: Record<string, unknown>): InvestmentAccount {
  return {
    id: String(row.id),
    name: String(row.name),
    broker: nullableString(row.broker),
    purpose: row.purpose as InvestmentAccount["purpose"],
    tradingInfo: null,
    accountType: row.account_type as InvestmentAccount["accountType"],
    baseCurrency: row.base_currency as InvestmentAccount["baseCurrency"],
    marketRegion: row.market_region as InvestmentAccount["marketRegion"],
    notes: nullableString(row.notes),
    createdByUserId: nullableString(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapInstrumentRow(row: Record<string, unknown>): Instrument {
  return {
    id: String(row.id),
    symbol: nullableString(row.symbol),
    name: String(row.name),
    shortName: String(row.short_name),
    description: nullableString(row.description),
    marketRegion: row.market_region as Instrument["marketRegion"],
    exchange: nullableString(row.exchange),
    currency: row.currency as Instrument["currency"],
    assetType: row.asset_type as Instrument["assetType"],
    isin: nullableString(row.isin),
    provider: nullableString(row.provider),
    priceSource: row.price_source as Instrument["priceSource"],
    priceSourceSymbol: nullableString(row.price_source_symbol),
    priceSourceExchange: nullableString(row.price_source_exchange),
    active: Boolean(row.active),
    priceUpdateEnabled: Boolean(row.price_update_enabled),
    priceUpdatePriority: Number(row.price_update_priority),
    sourceUrl: nullableString(row.source_url),
    sourceCheckedAt: nullableString(row.source_checked_at),
    createdByUserId: nullableString(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    notes: nullableString(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapTransactionRow(row: Record<string, unknown>): InvestmentTransaction {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    instrumentId: String(row.instrument_id),
    transactionType: row.transaction_type as InvestmentTransaction["transactionType"],
    tradeDate: String(row.trade_date),
    settlementDate: nullableString(row.settlement_date),
    quantity: nullableString(row.quantity),
    price: nullableString(row.price),
    grossAmount: nullableString(row.gross_amount),
    fee: String(row.fee),
    tax: String(row.tax),
    currency: row.currency as InvestmentTransaction["currency"],
    adjustmentDirection: row.adjustment_direction as InvestmentTransaction["adjustmentDirection"],
    transactionSource: row.transaction_source as InvestmentTransaction["transactionSource"],
    linkedTransactionId: nullableString(row.linked_transaction_id),
    settlementCurrency: row.settlement_currency as InvestmentTransaction["settlementCurrency"],
    settlementAmount: nullableString(row.settlement_amount),
    notes: nullableString(row.notes),
    createdByUserId: nullableString(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapPriceRow(row: Record<string, unknown>): PriceRecord {
  return {
    id: String(row.id),
    instrumentId: String(row.instrument_id),
    priceDate: String(row.price_date),
    closePrice: String(row.close_price),
    currency: row.currency as PriceRecord["currency"],
    source: nullableString(row.provider),
    sourceSymbol: nullableString(row.source_symbol),
    isAdjusted: Boolean(row.is_adjusted),
    isEstimated: Boolean(row.is_estimated),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapExchangeRateRow(row: Record<string, unknown>): ExchangeRateRecord {
  return {
    id: String(row.id),
    rateDate: String(row.rate_date),
    fromCurrency: row.from_currency as ExchangeRateRecord["fromCurrency"],
    toCurrency: row.to_currency as ExchangeRateRecord["toCurrency"],
    rate: String(row.rate),
    rateType: row.rate_type as ExchangeRateRecord["rateType"],
    provider: String(row.provider),
    providerRateDate: nullableString(row.provider_rate_date),
    fetchedAt: nullableString(row.fetched_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}


/** Pending/invalidated headers retain audit values and are resumable; published mismatches are not. */
export function hasPublishedBaselineMismatch(headers:Row[],snapshots:Array<{date:string;storedMismatches:string[]}>):boolean {
 return snapshots.some(s=>s.storedMismatches.length>0&&headers.some(h=>h.snapshot_date===s.date&&h.is_available===true));
}
/** Permit only the existing resolve_stored_price_gaps trigger effects for the reviewed target/dates. */
export function assertRelatedAcquisitionChanges(before:Export,after:Export,target:string,dates:string[]):void {
 const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 const states=before.price_acquisition_state??[],current=after.price_acquisition_state??[];
 const key=(r:Row)=>JSON.stringify([r.source,r.instrument_id,r.query_kind,r.target_date]);
 const allowed=(r:Row)=>r.instrument_id===target&&r.source==='kernel_estimate'&&r.query_kind==='daily_history'&&dates.includes(String(r.target_date));
 const fields=new Set(['status','last_outcome','reason','next_attempt_at','lease_token','lease_expires_at','transient_attempts','daily_attempts','updated_at']);
 if(states.length!==current.length)throw new Error('Unrelated acquisition state identity change.');
 for(const row of states){const next=current.find(r=>key(r)===key(row));if(!next)throw new Error('Unrelated acquisition state identity change.');if(equal(row,next))continue;
  if(!allowed(row))throw new Error('Unrelated acquisition state change.');
  if(next.status!=='resolved'||next.last_outcome!=='success'||next.reason!==null||next.next_attempt_at!==null||next.lease_token!==null||next.lease_expires_at!==null||next.transient_attempts!==0||next.daily_attempts!==0||!Number.isFinite(Date.parse(String(next.updated_at))))throw new Error('Unexpected acquisition resolution.');
  for(const field of new Set([...Object.keys(row),...Object.keys(next)]))if(!fields.has(field)&&!equal(row[field],next[field]))throw new Error('Unrelated acquisition field change.');
 }
 const attempts=before.price_acquisition_attempts??[],finished=after.price_acquisition_attempts??[];
 if(attempts.length!==finished.length)throw new Error('Unrelated acquisition attempt identity change.');
 for(const row of attempts){const next=finished.find(r=>r.lease_token===row.lease_token);if(!next)throw new Error('Unrelated acquisition attempt identity change.');if(equal(row,next))continue;
  if(row.finished_at!==null||!allowed(row)||!states.some(s=>key(s)===key(row))||next.outcome!=='data_arrived'||!Number.isFinite(Date.parse(String(next.finished_at))))throw new Error('Unrelated acquisition attempt change.');
  for(const field of new Set([...Object.keys(row),...Object.keys(next)]))if(!['outcome','finished_at'].includes(field)&&!equal(row[field],next[field]))throw new Error('Unrelated acquisition attempt field change.');
 }
}
