export const USER_ROLES = ["viewer", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CURRENCY_CODES = ["NZD", "USD", "HKD", "CNY", "AUD", "GBP", "EUR"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const MARKET_REGIONS = ["US", "HK", "CN", "NZ", "AU", "MULTI", "OTHER"] as const;
export type MarketRegion = (typeof MARKET_REGIONS)[number];

export const MARKET_REGION_LABELS: Record<MarketRegion, string> = {
  US: "\u7f8e\u80a1",
  HK: "\u6e2f\u80a1",
  CN: "\u4e2d\u56fd\u5927\u9646",
  NZ: "\u65b0\u897f\u5170",
  AU: "\u6fb3\u5927\u5229\u4e9a",
  MULTI: "\u591a\u5e02\u573a",
  OTHER: "\u5176\u4ed6"
};

export const ASSET_TYPES = [
  "stock",
  "etf",
  "pie_fund",
  "mutual_fund",
  "cash",
  "bond",
  "other"
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: "\u80a1\u7968",
  etf: "ETF",
  pie_fund: "PIE \u57fa\u91d1",
  mutual_fund: "\u5171\u540c\u57fa\u91d1",
  cash: "\u73b0\u91d1",
  bond: "\u503a\u5238",
  other: "\u5176\u4ed6"
};

export const PRICE_SOURCES = [
  "manual",
  "yahoo_finance",
  "alpha_vantage",
  "stooq",
  "twelvedata",
  "eastmoney",
  "sina",
  "investnow_manual",
  "custom"
] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  manual: "\u624b\u52a8",
  yahoo_finance: "Yahoo Finance",
  alpha_vantage: "Alpha Vantage",
  stooq: "Stooq",
  twelvedata: "Twelve Data",
  eastmoney: "\u4e1c\u65b9\u8d22\u5bcc",
  sina: "\u65b0\u6d6a\u8d22\u7ecf",
  investnow_manual: "InvestNow \u624b\u52a8",
  custom: "\u81ea\u5b9a\u4e49"
};

export const TRANSACTION_TYPES = [
  "buy",
  "sell",
  "dividend",
  "fee",
  "tax",
  "deposit",
  "withdrawal",
  "interest",
  "adjustment"
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const ACCOUNT_TYPES = ["brokerage", "fund_platform", "bank", "retirement", "other"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  brokerage: "\u5238\u5546\u8d26\u6237",
  fund_platform: "\u57fa\u91d1\u5e73\u53f0",
  bank: "\u94f6\u884c\u8d26\u6237",
  retirement: "\u9000\u4f11\u8d26\u6237",
  other: "\u5176\u4ed6"
};

export interface Profile {
  id: string;
  email: string | null;
  displayName: string | null;
  preferredCurrency: CurrencyCode;
  createdAt: string;
  updatedAt: string;
}

export interface UserRoleRecord {
  id: string;
  userId: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface InvestmentAccount {
  id: string;
  name: string;
  broker: string | null;
  accountType: AccountType;
  baseCurrency: CurrencyCode;
  marketRegion: MarketRegion;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvestmentAccountInput {
  name: string;
  broker?: string | null;
  accountType: AccountType;
  baseCurrency: CurrencyCode;
  marketRegion: MarketRegion;
  notes?: string | null;
}

export interface UpdateInvestmentAccountInput {
  name?: string;
  broker?: string | null;
  accountType?: AccountType;
  baseCurrency?: CurrencyCode;
  marketRegion?: MarketRegion;
  notes?: string | null;
}

export interface Instrument {
  id: string;
  symbol: string | null;
  name: string;
  description: string | null;
  marketRegion: MarketRegion;
  exchange: string | null;
  currency: CurrencyCode;
  assetType: AssetType;
  isin: string | null;
  provider: string | null;
  priceSource: PriceSource;
  priceSourceSymbol: string | null;
  priceSourceExchange: string | null;
  priceUpdateEnabled: boolean;
  priceUpdatePriority: number;
  sourceUrl: string | null;
  sourceCheckedAt: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInstrumentInput {
  symbol?: string | null;
  name: string;
  description?: string | null;
  marketRegion: MarketRegion;
  exchange?: string | null;
  currency: CurrencyCode;
  assetType: AssetType;
  isin?: string | null;
  provider?: string | null;
  priceSource: PriceSource;
  priceSourceSymbol?: string | null;
  priceSourceExchange?: string | null;
  priceUpdateEnabled: boolean;
  priceUpdatePriority: number;
  sourceUrl?: string | null;
  sourceCheckedAt?: string | null;
  notes?: string | null;
}

export interface UpdateInstrumentInput {
  symbol?: string | null;
  name?: string;
  description?: string | null;
  marketRegion?: MarketRegion;
  exchange?: string | null;
  currency?: CurrencyCode;
  assetType?: AssetType;
  isin?: string | null;
  provider?: string | null;
  priceSource?: PriceSource;
  priceSourceSymbol?: string | null;
  priceSourceExchange?: string | null;
  priceUpdateEnabled?: boolean;
  priceUpdatePriority?: number;
  sourceUrl?: string | null;
  sourceCheckedAt?: string | null;
  notes?: string | null;
}

export interface InvestmentTransaction {
  id: string;
  accountId: string;
  instrumentId: string;
  transactionType: TransactionType;
  tradeDate: string;
  settlementDate: string | null;
  quantity: string | null;
  price: string | null;
  grossAmount: string | null;
  fee: string;
  tax: string;
  currency: CurrencyCode;
  fxRateToNzd: string | null;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PriceRecord {
  id: string;
  instrumentId: string;
  priceDate: string;
  closePrice: string;
  currency: CurrencyCode;
  source: string | null;
  sourceSymbol: string | null;
  isAdjusted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FxRateRecord {
  id: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rateDate: string;
  rate: string;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioSnapshot {
  id: string;
  snapshotDate: string;
  totalMarketValueNzd: string | null;
  totalCostNzd: string | null;
  unrealizedGainNzd: string | null;
  dailyChangeNzd: string | null;
  dailyChangePct: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  code: "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION_ERROR" | "NOT_FOUND" | "INTERNAL_ERROR";
  message: string;
}

export type ApiResponse<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: ApiError;
    };
