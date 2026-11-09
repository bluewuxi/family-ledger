import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resources } from "./src/i18n/resources";
import { validateResources } from "./src/i18n/resourceValidation";
import { DASHBOARD_WARNING_CODES, HOLDING_WARNINGS, MONTHLY_SUMMARY_WARNING_CODES, PORTFOLIO_TREND_WARNING_CODES, SNAPSHOT_WARNING_CODES, type ValuedHoldingSummary, type MonthlySummaryWarning } from "@family-ledger/shared";
import { translateDashboardWarning, translateHoldingWarning, translateSnapshotWarning, translatePortfolioTrendWarning, translateMonthlySummaryWarning, translateAccountDetailWarning } from "./src/i18n/investmentWarnings";
import type { UiLanguage } from "./src/i18n/language";
const require = createRequire(new URL("./package.json", import.meta.url));
const source = `export {formatHoldingWarnings,formatHoldingLatestPrice,formatHoldingQuantity} from './apps/web/src/lib/holdingDisplay'; export {formatChartMoney,formatCompactMoney} from './apps/web/src/components/InvestmentTrendChart'; import {renderToStaticMarkup} from 'react-dom/server'; export {renderToStaticMarkup};`;
const bundle = await build({stdin:{contents:source,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"node",format:"cjs",jsx:"automatic",define:{"import.meta.env":JSON.stringify({DEV:false})},external:["react","react/jsx-runtime","react-dom/server","recharts"]});
interface Fixture {
  formatHoldingWarnings: (holding:ValuedHoldingSummary,language:UiLanguage)=>import("react").ReactNode;
  formatHoldingLatestPrice: (holding:ValuedHoldingSummary,presentation:"compact"|"detailed",language:UiLanguage)=>import("react").ReactNode;
  formatHoldingQuantity: (holding:ValuedHoldingSummary,language:UiLanguage)=>string;
  formatChartMoney: (value:number,language:UiLanguage)=>string;
  formatCompactMoney: (value:number)=>string;
  renderToStaticMarkup: typeof import("react-dom/server").renderToStaticMarkup;
}
const module = {exports:{} as Fixture};
new Function("module","exports","require",bundle.outputFiles[0].text)(module,module.exports,require);
const h = module.exports;
const holding = Object.freeze({warnings:["NEGATIVE_POSITION"],valuationWarnings:[],assetType:"stock",quantity:"1234.12345678",latestPrice:"12.345678",latestPriceIsEstimated:true,latestPriceDate:"2025-12-31",latestPriceKind:"quote",latestPriceSource:"Original source",quoteFetchedAt:null}) as unknown as ValuedHoldingSummary;
const before = JSON.stringify(holding);
assert.match(h.renderToStaticMarkup(h.formatHoldingWarnings(holding,"en")),/Negative balance or position/);
assert.match(h.renderToStaticMarkup(h.formatHoldingWarnings(holding,"zh-CN")),/负数余额/);
assert.equal(h.formatHoldingQuantity(holding,"en"),"1,234.123457");
const price=h.renderToStaticMarkup(h.formatHoldingLatestPrice(holding,"detailed","en"));
assert.match(price,/12.3457/);assert.match(price,/31 Dec 2025/);assert.match(price,/Estimated/);assert.match(price,/Original source/);
assert.equal(JSON.stringify(holding),before);
for(const language of ["zh-CN","en"] as const){
 for(const value of [-1000.5,-1.5,-0.5,0,0.5,1000.5])assert.equal(h.formatChartMoney(value,language),Math.round(value).toLocaleString(language==="en"?"en-NZ":"zh-CN",{maximumFractionDigits:0}));
 for(const [value,expected] of [[999,"999"],[1000,"1K"],[999999,"1000K"],[1000000,"1.00M"],[-1000,"-1K"],[-1000000,"-1.00M"]] as const)assert.equal(h.formatCompactMoney(value),expected);
 for(const code of HOLDING_WARNINGS)assert(translateHoldingWarning(code,language));
 for(const code of DASHBOARD_WARNING_CODES){const warning={code,instrumentId:"instrument",instrumentName:"Source",instrumentShortName:"源名称",currency:"USD" as const};const text=translateDashboardWarning(warning,language);assert(text.includes("源名称"));assert(!text.includes("undefined"));}
 for(const code of SNAPSHOT_WARNING_CODES)assert(translateSnapshotWarning({code,accountId:"account",accountName:"Source account",instrumentId:"instrument",instrumentName:"Source name",instrumentShortName:"Source short",currency:"NZD"},language).includes("Source account"));
 for(const code of PORTFOLIO_TREND_WARNING_CODES)assert(translatePortfolioTrendWarning({code,transactionDate:"2026-01-01",currency:"USD"},language).includes("USD"));
 for(const code of MONTHLY_SUMMARY_WARNING_CODES){const warning:MonthlySummaryWarning={code,date:"2026-01-01",actualDate:"2025-12-31",instrumentShortName:"Original security",currency:"USD",message:"SECRET-MARKER"};const text=translateMonthlySummaryWarning(warning,language);assert(!text.includes("SECRET-MARKER"));assert(!text.includes("undefined"));if(code==="MISSING_OPENING_PRICE")assert(text.includes("Original security"));if(code==="SNAPSHOT_DATE_MISMATCH")assert(text.includes(language==="en"?"31 Dec 2025":"2025-12-31"));}
 assert(!translateAccountDetailWarning({code:"UNKNOWN",message:"SECRET-MARKER"},language).includes("SECRET-MARKER"));
 for(const namespace of ["dashboard","holdings"] as const){const bad=structuredClone(resources) as unknown as Record<string,Record<string,Record<string,unknown>>>;bad[language][namespace].title=" ";assert(validateResources(bad).some(d=>d.namespace===namespace&&d.rule==="empty"));}
}
assert.deepEqual(validateResources(resources),[]);
assert.match(translateMonthlySummaryWarning({code:"SNAPSHOT_DATE_MISMATCH",date:"2026-01-01",currency:null,message:"legacy secret"},"en"),/unavailable/);
console.log("Phase 3 resources, explicit holding presentation, chart rounding/compact boundaries and all warning codes passed");

for (const language of ["en", "zh-CN"] as const) {
 for (const origin of ["holding", "snapshot"] as const) {
  const notice=translateAccountDetailWarning({code:"NEGATIVE_POSITION", instrumentShortName:"Affected source",currency:"USD",date:"2026-01-02",origin,message:"SECRET-MARKER"}, language);
  assert(notice.includes("Affected source"), "Account warning must retain instrument");
  assert(notice.includes("USD"), "Account warning must retain currency");
  assert(notice.includes(language === "en" ? "02 Jan 2026" : "2026-01-02"), "Account warning must retain actual date");
  assert(!notice.includes("SECRET-MARKER"));
 }
}
