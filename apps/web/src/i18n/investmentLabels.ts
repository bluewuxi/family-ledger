import type { AccountType, AccountPurpose, AssetType, MarketRegion, TransactionType, TransactionSource, AdjustmentDirection, PriceSource, MonthlyReviewStatus } from "@family-ledger/shared";
import { i18n } from "./instance";
import type { UiLanguage } from "./language";
import investment from "./resources/en/investment";
type ResourceKey = { [K in keyof typeof investment]: typeof investment[K] extends string ? K : `${K}.${keyof typeof investment[K] & string}` }[keyof typeof investment];
export const accountTypeKeys = {"brokerage":"accountType.brokerage","fund_platform":"accountType.fundPlatform","bank":"accountType.bank","retirement":"accountType.retirement","other":"accountType.other"} as const satisfies Record<AccountType, ResourceKey>;
export const accountPurposeKeys = {"investment":"accountPurpose.investment","daily_expense":"accountPurpose.dailyExpense","education":"accountPurpose.education"} as const satisfies Record<AccountPurpose, ResourceKey>;
export const assetTypeKeys = {"stock":"assetType.stock","etf":"assetType.etf","pie_fund":"assetType.pieFund","mutual_fund":"assetType.mutualFund","cash":"assetType.cash","bond":"assetType.bond","other":"assetType.other"} as const satisfies Record<AssetType, ResourceKey>;
export const marketRegionKeys = {"US":"marketRegion.us","HK":"marketRegion.hk","CN":"marketRegion.cn","NZ":"marketRegion.nz","UK":"marketRegion.uk","MULTI":"marketRegion.multi","OTHER":"marketRegion.other"} as const satisfies Record<MarketRegion, ResourceKey>;
export const transactionTypeKeys = {"opening_position":"transactionType.openingPosition","opening_balance":"transactionType.openingBalance","buy":"transactionType.buy","sell":"transactionType.sell","dividend":"transactionType.dividend","fee":"transactionType.fee","tax":"transactionType.tax","deposit":"transactionType.deposit","withdrawal":"transactionType.withdrawal","interest":"transactionType.interest","adjustment":"transactionType.adjustment"} as const satisfies Record<TransactionType, ResourceKey>;
export const transactionSourceKeys = {"manual":"transactionSource.manual","generated_cash_leg":"transactionSource.generatedCashLeg"} as const satisfies Record<TransactionSource, ResourceKey>;
export const adjustmentDirectionKeys = {"increase":"adjustmentDirection.increase","decrease":"adjustmentDirection.decrease"} as const satisfies Record<AdjustmentDirection, ResourceKey>;
export const priceSourceKeys = {"manual":"priceSource.manual","yahoo_finance":"priceSource.yahooFinance","alpha_vantage":"priceSource.alphaVantage","stooq":"priceSource.stooq","twelvedata":"priceSource.twelvedata","eastmoney":"priceSource.eastmoney","sina":"priceSource.sina","investnow_manual":"priceSource.investnowManual","custom":"priceSource.custom","kernel_estimate":"priceSource.kernelEstimate"} as const satisfies Record<PriceSource, ResourceKey>;
export const reviewStatusKeys = {"in_progress":"reviewStatus.inProgress","complete":"reviewStatus.complete"} as const satisfies Record<MonthlyReviewStatus, ResourceKey>;
type Values = { accountType: AccountType; accountPurpose: AccountPurpose; assetType: AssetType; marketRegion: MarketRegion; transactionType: TransactionType; transactionSource: TransactionSource; adjustmentDirection: AdjustmentDirection; priceSource: PriceSource; reviewStatus: MonthlyReviewStatus };
const maps = { accountType: accountTypeKeys, accountPurpose: accountPurposeKeys, assetType: assetTypeKeys, marketRegion: marketRegionKeys, transactionType: transactionTypeKeys, transactionSource: transactionSourceKeys, adjustmentDirection: adjustmentDirectionKeys, priceSource: priceSourceKeys, reviewStatus: reviewStatusKeys };
export function getInvestmentLabel<K extends keyof Values>(kind: K, value: Values[K], language: UiLanguage = "zh-CN"): string {
 const map: Readonly<Record<string, ResourceKey>> = maps[kind];
 const key = Object.hasOwn(map, value) ? map[value] : "unavailable";
 return i18n.getFixedT(language,"investment")(key);
}
