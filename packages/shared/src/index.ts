export const USER_ROLES = ["viewer", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CURRENCY_CODES = ["NZD", "USD", "HKD", "CNY", "AUD", "GBP", "EUR"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const MARKET_REGIONS = ["US", "HK", "CN", "NZ", "MULTI", "OTHER"] as const;
export type MarketRegion = (typeof MARKET_REGIONS)[number];

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

export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
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
  platform: string;
  accountType: AccountType;
  baseCurrency: CurrencyCode;
  primaryMarket: MarketRegion;
  createdAt: string;
  updatedAt: string;
}

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  market: MarketRegion;
  currency: CurrencyCode;
  assetType: AssetType;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentTransaction {
  id: string;
  accountId: string;
  instrumentId: string | null;
  transactionType: TransactionType;
  tradeDate: string;
  quantity: string | null;
  amount: string;
  currency: CurrencyCode;
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
  createdAt: string;
}

export interface FxRateRecord {
  id: string;
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  rateDate: string;
  rate: string;
  source: string | null;
  createdAt: string;
}

export interface PortfolioSnapshot {
  id: string;
  snapshotDate: string;
  totalValueNzd: string;
  costBasisNzd: string;
  unrealizedGainNzd: string;
  createdAt: string;
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
