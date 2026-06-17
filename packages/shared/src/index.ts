import Decimal from "decimal.js";

export const APP_BUSINESS_TIME_ZONE = "Asia/Shanghai";
export const APP_BUSINESS_DAY_CUTOFF_HOUR = 6;

type DateInput = Date | string;

export function getAppBusinessDate(input: DateInput = new Date()): string {
  const date = toValidDate(input);
  const parts = getTimeZoneParts(date, APP_BUSINESS_TIME_ZONE);

  if (parts.hour >= APP_BUSINESS_DAY_CUTOFF_HOUR) {
    return toIsoDate(parts.year, parts.month, parts.day);
  }

  const previousDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1));
  return toIsoDate(previousDate.getUTCFullYear(), previousDate.getUTCMonth() + 1, previousDate.getUTCDate());
}

export function getAppBusinessDayEndInstant(input: DateInput = new Date()): string {
  const date = toValidDate(input);
  const parts = getTimeZoneParts(date, APP_BUSINESS_TIME_ZONE);
  const endDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, APP_BUSINESS_DAY_CUTOFF_HOUR));

  if (parts.hour >= APP_BUSINESS_DAY_CUTOFF_HOUR) {
    endDate.setUTCDate(endDate.getUTCDate() + 1);
  }

  return fromTimeZoneWallClock(endDate, APP_BUSINESS_TIME_ZONE).toISOString();
}

export function getLocalDateString(input: DateInput = new Date()): string {
  const date = toValidDate(input);
  return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function getTimeZoneDateString(input: DateInput, timeZone: string): string {
  const parts = getTimeZoneParts(toValidDate(input), timeZone);
  return toIsoDate(parts.year, parts.month, parts.day);
}

export function formatDateTimeInTimeZone(
  input: DateInput,
  timeZone: string,
  locale = "zh-CN",
  fallback = ""
): string {
  try {
    const date = toValidDate(input);
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone
    }).format(date);
  } catch {
    return fallback || String(input);
  }
}

function toValidDate(input: DateInput): Date {
  const date = input instanceof Date ? input : new Date(input);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date input.");
  }

  return date;
}

function fromTimeZoneWallClock(date: Date, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  ));
  const parts = getTimeZoneParts(utcGuess, timeZone);
  const actualWallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour);
  const targetWallClock = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours()
  );

  return new Date(utcGuess.getTime() + targetWallClock - actualWallClock);
}

function getTimeZoneParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(values.get("year"));
  const month = Number(values.get("month"));
  const day = Number(values.get("day"));
  const hour = Number(values.get("hour"));

  if (![year, month, day, hour].every(Number.isFinite)) {
    throw new Error(`Failed to resolve date parts for ${timeZone}.`);
  }

  return { year, month, day, hour };
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export const USER_ROLES = ["viewer", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CURRENCY_CODES = ["NZD", "USD", "HKD", "CNY", "AUD", "GBP", "EUR"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const RATE_TYPES = ["valuation", "tax"] as const;
export type RateType = (typeof RATE_TYPES)[number];

export const JOB_RUN_STATUSES = ["started", "succeeded", "failed"] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

export const JOB_TRIGGER_SOURCES = ["schedule", "manual"] as const;
export type JobTriggerSource = (typeof JOB_TRIGGER_SOURCES)[number];

export const DATA_KINDS = ["exchange_rates", "instrument_prices"] as const;
export type DataKind = (typeof DATA_KINDS)[number];

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
export const INSTRUMENT_SHORT_NAME_MAX_LENGTH = 32;

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  manual: "\u624b\u52a8",
  yahoo_finance: "Yahoo Finance",
  alpha_vantage: "Alpha Vantage",
  stooq: "Stooq",
  twelvedata: "Twelve Data",
  eastmoney: "\u4e1c\u65b9\u8d22\u5bcc",
  sina: "\u65b0\u6d6a\u8d22\u7ecf",
  investnow_manual: "InvestNow",
  custom: "\u81ea\u5b9a\u4e49"
};

export const TRANSACTION_TYPES = [
  "opening_position",
  "opening_balance",
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

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  opening_position: "\u671f\u521d\u6301\u4ed3",
  opening_balance: "\u671f\u521d\u4f59\u989d",
  buy: "\u4e70\u5165",
  sell: "\u5356\u51fa",
  dividend: "\u80a1\u606f",
  fee: "\u8d39\u7528",
  tax: "\u7a0e\u52a1\u8bb0\u5f55",
  deposit: "\u5165\u91d1",
  withdrawal: "\u51fa\u91d1",
  interest: "\u5229\u606f",
  adjustment: "\u8c03\u6574"
};

export const ADJUSTMENT_DIRECTIONS = ["increase", "decrease"] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

export const ADJUSTMENT_DIRECTION_LABELS: Record<AdjustmentDirection, string> = {
  increase: "\u589e\u52a0",
  decrease: "\u51cf\u5c11"
};

export const TRANSACTION_SOURCES = ["manual", "generated_cash_leg"] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

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
  gainColorScheme: GainColorScheme;
  uiTheme: UiTheme;
  createdAt: string;
  updatedAt: string;
}

export const GAIN_COLOR_SCHEMES = ["red_positive", "green_positive"] as const;
export type GainColorScheme = (typeof GAIN_COLOR_SCHEMES)[number];

export const UI_THEMES = ["light", "dark"] as const;
export type UiTheme = (typeof UI_THEMES)[number];

export const UI_THEME_LABELS: Record<UiTheme, string> = {
  light: "日间模式",
  dark: "夜间模式"
};

export const GAIN_COLOR_SCHEME_LABELS: Record<GainColorScheme, string> = {
  red_positive: "\u7ea2\u8272\u8868\u793a\u76c8\u5229\uff0c\u7eff\u8272\u8868\u793a\u4e8f\u635f",
  green_positive: "\u7eff\u8272\u8868\u793a\u76c8\u5229\uff0c\u7ea2\u8272\u8868\u793a\u4e8f\u635f"
};

export interface UserPreferences {
  preferredCurrency: CurrencyCode;
  gainColorScheme: GainColorScheme;
  uiTheme: UiTheme;
}

export interface UpdateUserPreferencesInput {
  preferredCurrency?: CurrencyCode;
  gainColorScheme?: GainColorScheme;
  uiTheme?: UiTheme;
}

export interface UserRoleRecord {
  id: string;
  userId: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedUser {
  id: string;
  email: string | null;
  role: UserRole | null;
  isActive: boolean;
  createdAt: string;
  lastSignInAt: string | null;
}

export interface UpdateManagedUserInput {
  role?: UserRole;
  isActive?: boolean;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface Currency {
  code: CurrencyCode;
  name: string;
  minorUnit: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentAccount {
  id: string;
  name: string;
  broker: string | null;
  accountType: AccountType;
  baseCurrency: CurrencyCode;
  marketRegion: MarketRegion;
  notes: string | null;
  tradingInfo: string | null;
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
  tradingInfo?: string | null;
}

export interface UpdateInvestmentAccountInput {
  name?: string;
  broker?: string | null;
  accountType?: AccountType;
  baseCurrency?: CurrencyCode;
  marketRegion?: MarketRegion;
  notes?: string | null;
  tradingInfo?: string | null;
}

export interface Instrument {
  id: string;
  symbol: string | null;
  name: string;
  shortName: string;
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
  shortName?: string | null;
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
  shortName?: string | null;
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
  instrumentSymbol?: string | null;
  instrumentName?: string | null;
  instrumentShortName?: string | null;
  instrumentAssetType?: AssetType | null;
  transactionType: TransactionType;
  tradeDate: string;
  settlementDate: string | null;
  quantity: string | null;
  price: string | null;
  grossAmount: string | null;
  fee: string;
  tax: string;
  currency: CurrencyCode;
  adjustmentDirection: AdjustmentDirection | null;
  transactionSource: TransactionSource;
  linkedTransactionId: string | null;
  settlementCurrency: CurrencyCode | null;
  settlementAmount: string | null;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvestmentTransactionInput {
  accountId: string;
  instrumentId: string;
  transactionType: TransactionType;
  tradeDate: string;
  settlementDate?: string | null;
  quantity?: string | null;
  price?: string | null;
  grossAmount?: string | null;
  fee?: string;
  tax?: string;
  currency: CurrencyCode;
  adjustmentDirection?: AdjustmentDirection | null;
  transactionSource?: TransactionSource;
  linkedTransactionId?: string | null;
  settlementCurrency?: CurrencyCode | null;
  settlementAmount?: string | null;
  notes?: string | null;
}

export interface UpdateInvestmentTransactionInput {
  accountId?: string;
  instrumentId?: string;
  transactionType?: TransactionType;
  tradeDate?: string;
  settlementDate?: string | null;
  quantity?: string | null;
  price?: string | null;
  grossAmount?: string | null;
  fee?: string;
  tax?: string;
  currency?: CurrencyCode;
  adjustmentDirection?: AdjustmentDirection | null;
  transactionSource?: TransactionSource;
  linkedTransactionId?: string | null;
  settlementCurrency?: CurrencyCode | null;
  settlementAmount?: string | null;
  notes?: string | null;
}

export const HOLDING_WARNINGS = ["NEGATIVE_POSITION", "COST_BASIS_UNAVAILABLE"] as const;
export type HoldingWarning = (typeof HOLDING_WARNINGS)[number];

export interface HoldingSummary {
  accountId: string;
  accountName: string;
  instrumentId: string;
  instrumentSymbol: string | null;
  instrumentName: string;
  instrumentShortName: string;
  assetType: AssetType;
  currency: CurrencyCode;
  quantity: string;
  averageUnitCost: string | null;
  costAmount: string | null;
  costAmountUsd?: string | null;
  warnings: HoldingWarning[];
}

interface HoldingState {
  account: InvestmentAccount;
  instrument: Instrument;
  quantity: Decimal;
  costAmount: Decimal;
  costAmountUsd: Decimal;
  trackUsdCostBasis: boolean;
  costBasisUsdUnavailable: boolean;
  costBasisUnavailable: boolean;
  warnings: Set<HoldingWarning>;
}

interface CalculateHoldingsOptions {
  fxRates?: ExchangeRateRecord[];
}

export function calculateHoldings(
  transactions: InvestmentTransaction[],
  accounts: InvestmentAccount[],
  instruments: Instrument[],
  options: CalculateHoldingsOptions = {}
): HoldingSummary[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const instrumentsById = new Map(instruments.map((instrument) => [instrument.id, instrument]));
  const states = new Map<string, HoldingState>();
  const trackUsdCostBasis = options.fxRates !== undefined;

  for (const transaction of sortTransactions(transactions)) {
    const account = accountsById.get(transaction.accountId);
    const instrument = instrumentsById.get(transaction.instrumentId);

    if (!account || !instrument) {
      throw new Error("Holding reference data is incomplete.");
    }

    const key = `${account.id}:${instrument.id}`;
    const state = states.get(key) ?? createHoldingState(account, instrument, trackUsdCostBasis);
    states.set(key, state);

    if (instrument.assetType === "cash") {
      applyCashTransaction(state, transaction);
    } else {
      applySecurityTransaction(state, transaction, options.fxRates ?? []);
    }
  }

  return [...states.values()]
    .filter((state) => !state.quantity.isZero())
    .map(toHoldingSummary)
    .sort((left, right) => {
      const accountComparison = left.accountName.localeCompare(right.accountName, "zh-CN");
      const instrumentComparison = left.instrumentName.localeCompare(right.instrumentName, "zh-CN");
      return accountComparison || instrumentComparison || left.instrumentId.localeCompare(right.instrumentId);
    });
}

function applySecurityTransaction(
  state: HoldingState,
  transaction: InvestmentTransaction,
  fxRates: ExchangeRateRecord[]
): void {
  switch (transaction.transactionType) {
    case "opening_position": {
      const quantity = requiredAmount(transaction.quantity);
      const costAmount = requiredAmount(transaction.grossAmount);
      state.quantity = state.quantity.plus(quantity);

      if (!state.costBasisUnavailable) {
        state.costAmount = state.costAmount.plus(costAmount);
      }
      addSecurityCostUsd(state, transaction, costAmount, fxRates);
      return;
    }
    case "buy": {
      const quantity = requiredAmount(transaction.quantity);
      const costAmount = requiredAmount(transaction.grossAmount)
        .plus(requiredAmount(transaction.fee))
        .plus(requiredAmount(transaction.tax));
      state.quantity = state.quantity.plus(quantity);

      if (!state.costBasisUnavailable) {
        state.costAmount = state.costAmount.plus(costAmount);
      }
      addSecurityCostUsd(state, transaction, costAmount, fxRates);
      return;
    }
    case "sell": {
      const soldQuantity = requiredAmount(transaction.quantity);
      const priorQuantity = state.quantity;

      if (!state.costBasisUnavailable && priorQuantity.greaterThan(0) && soldQuantity.lessThanOrEqualTo(priorQuantity)) {
        const priorAverageCost = state.costAmount.dividedBy(priorQuantity);
        state.costAmount = state.costAmount.minus(soldQuantity.times(priorAverageCost));
      } else {
        markCostBasisUnavailable(state);
      }

      if (
        state.trackUsdCostBasis &&
        !state.costBasisUsdUnavailable &&
        priorQuantity.greaterThan(0) &&
        soldQuantity.lessThanOrEqualTo(priorQuantity)
      ) {
        const priorAverageCostUsd = state.costAmountUsd.dividedBy(priorQuantity);
        state.costAmountUsd = state.costAmountUsd.minus(soldQuantity.times(priorAverageCostUsd));
      } else if (state.trackUsdCostBasis) {
        state.costBasisUsdUnavailable = true;
      }

      state.quantity = state.quantity.minus(soldQuantity);

      if (state.quantity.isNegative()) {
        markCostBasisUnavailable(state);
      } else if (state.quantity.isZero() && !state.costBasisUnavailable) {
        state.costAmount = new Decimal(0);
        state.costAmountUsd = new Decimal(0);
      }
      return;
    }
    case "dividend":
      return;
    default:
      throw new Error("A non-cash instrument has an unsupported holdings transaction.");
  }
}

function addSecurityCostUsd(
  state: HoldingState,
  transaction: InvestmentTransaction,
  nativeCostAmount: Decimal,
  fxRates: ExchangeRateRecord[]
): void {
  if (!state.trackUsdCostBasis || state.costBasisUsdUnavailable) {
    return;
  }

  const settlementAmount =
    transaction.transactionType === "buy" && transaction.settlementCurrency && transaction.settlementAmount
      ? convertAmountToUsd(new Decimal(transaction.settlementAmount), transaction.settlementCurrency, transaction.tradeDate, fxRates)
      : null;
  const costAmountUsd =
    settlementAmount ?? convertAmountToUsd(nativeCostAmount, transaction.currency, transaction.tradeDate, fxRates);

  if (costAmountUsd === null) {
    state.costBasisUsdUnavailable = true;
    return;
  }

  state.costAmountUsd = state.costAmountUsd.plus(costAmountUsd);
}

function applyCashTransaction(state: HoldingState, transaction: InvestmentTransaction): void {
  switch (transaction.transactionType) {
    case "opening_balance":
    case "deposit":
    case "interest":
      state.quantity = state.quantity.plus(requiredAmount(transaction.grossAmount));
      return;
    case "withdrawal":
      state.quantity = state.quantity.minus(requiredAmount(transaction.grossAmount));
      return;
    case "fee":
      state.quantity = state.quantity.minus(requiredAmount(transaction.fee));
      return;
    case "tax":
      state.quantity = state.quantity.minus(requiredAmount(transaction.tax));
      return;
    case "adjustment": {
      const amount = requiredAmount(transaction.grossAmount);
      if (transaction.adjustmentDirection === "increase") {
        state.quantity = state.quantity.plus(amount);
        return;
      }
      if (transaction.adjustmentDirection === "decrease") {
        state.quantity = state.quantity.minus(amount);
        return;
      }
      throw new Error("A cash adjustment is missing its direction.");
    }
    default:
      throw new Error("A cash instrument has an unsupported holdings transaction.");
  }
}

function toHoldingSummary(state: HoldingState): HoldingSummary {
  const isCash = state.instrument.assetType === "cash";

  if (state.quantity.isNegative()) {
    state.warnings.add("NEGATIVE_POSITION");
  }

  const costAmount = isCash || state.costBasisUnavailable ? null : formatFlexibleDecimal(state.costAmount, 6);
  const averageUnitCost =
    isCash || state.costBasisUnavailable ? null : formatFlexibleDecimal(state.costAmount.dividedBy(state.quantity), 10);
  const costAmountUsd =
    isCash || !state.trackUsdCostBasis
      ? undefined
      : state.costBasisUsdUnavailable
        ? null
        : formatFlexibleDecimal(state.costAmountUsd, 6);

  return {
    accountId: state.account.id,
    accountName: state.account.name,
    instrumentId: state.instrument.id,
    instrumentSymbol: state.instrument.symbol,
    instrumentName: state.instrument.name,
    instrumentShortName: state.instrument.shortName,
    assetType: state.instrument.assetType,
    currency: state.instrument.currency,
    quantity: state.quantity.toString(),
    averageUnitCost,
    costAmount,
    ...(state.trackUsdCostBasis ? { costAmountUsd } : {}),
    warnings: [...state.warnings]
  };
}

function markCostBasisUnavailable(state: HoldingState): void {
  state.costBasisUnavailable = true;
  state.costBasisUsdUnavailable = true;
  state.warnings.add("NEGATIVE_POSITION");
  state.warnings.add("COST_BASIS_UNAVAILABLE");
}

function requiredAmount(value: string | null): Decimal {
  if (value === null) {
    throw new Error("A transaction is missing a required holdings amount.");
  }
  return new Decimal(value);
}

function convertAmountToUsd(
  amount: Decimal,
  currency: CurrencyCode,
  date: string,
  fxRates: ExchangeRateRecord[]
): Decimal | null {
  if (currency === "USD") {
    return amount;
  }

  const rate = findValuationRateToUsdOnOrBefore(currency, date, fxRates);
  return rate === null ? null : amount.times(rate.rate);
}

function findValuationRateToUsdOnOrBefore(
  currency: CurrencyCode,
  date: string,
  fxRates: ExchangeRateRecord[]
): ExchangeRateRecord | null {
  const ratesByDate = new Map<string, ExchangeRateRecord[]>();

  for (const rate of fxRates) {
    if (
      rate.fromCurrency !== currency ||
      rate.toCurrency !== "USD" ||
      rate.rateType !== "valuation" ||
      rate.rateDate > date
    ) {
      continue;
    }

    const ratesForDate = ratesByDate.get(rate.rateDate) ?? [];
    ratesForDate.push(rate);
    ratesByDate.set(rate.rateDate, ratesForDate);
  }

  const [latestDate] = [...ratesByDate.keys()].sort((left, right) => right.localeCompare(left));
  return latestDate ? selectPreferredExchangeRateRecord(ratesByDate.get(latestDate) ?? []) : null;
}

function createHoldingState(account: InvestmentAccount, instrument: Instrument, trackUsdCostBasis: boolean): HoldingState {
  return {
    account,
    instrument,
    quantity: new Decimal(0),
    costAmount: new Decimal(0),
    costAmountUsd: new Decimal(0),
    trackUsdCostBasis,
    costBasisUsdUnavailable: false,
    costBasisUnavailable: false,
    warnings: new Set<HoldingWarning>()
  };
}

function sortTransactions(transactions: InvestmentTransaction[]): InvestmentTransaction[] {
  return [...transactions].sort((left, right) => {
    const tradeDateComparison = left.tradeDate.localeCompare(right.tradeDate);
    const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
    return tradeDateComparison || createdAtComparison || left.id.localeCompare(right.id);
  });
}

export const DASHBOARD_WARNING_CODES = [
  "MISSING_LATEST_PRICE",
  "MISSING_PREVIOUS_PRICE",
  "MISSING_FX_RATE",
  "COST_BASIS_UNAVAILABLE"
] as const;
export type DashboardWarningCode = (typeof DASHBOARD_WARNING_CODES)[number];

export interface DashboardWarning {
  code: DashboardWarningCode;
  instrumentId: string;
  instrumentName: string;
  instrumentShortName: string;
  currency: CurrencyCode;
}

export interface DashboardAccountSummary {
  accountId: string;
  accountName: string;
  marketValue: string | null;
}

export interface DashboardAllocationSummary {
  id: string;
  name: string;
  marketValue: string | null;
  allocationType: "account" | "cash";
}

export interface DashboardHoldingAllocationSummary {
  id: string;
  name: string;
  assetType: AssetType;
  marketValue: string | null;
  percentageOfTotal: string | null;
  allocationType: "instrument" | "cash";
}

export interface DashboardSummary {
  reportingCurrency: SnapshotDisplayCurrency;
  totalAssets: string | null;
  todayChange: string | null;
  todayChangePct: string | null;
  unrealizedGain: string | null;
  dailyTradeCount: number;
  accountCount: number;
  accounts: DashboardAccountSummary[];
  allocations: DashboardAllocationSummary[];
  holdingAllocations: DashboardHoldingAllocationSummary[];
  quoteFetchedAt: string | null;
  quoteDate: string | null;
  warnings: DashboardWarning[];
}

export interface DashboardQuoteRecord {
  id: string;
  instrumentId: string;
  quoteDate: string;
  quotePrice: string;
  currency: CurrencyCode;
  provider: string;
  sourceSymbol: string | null;
  fetchedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ValuedHoldingSummary extends HoldingSummary {
  reportingCurrency: SnapshotDisplayCurrency;
  marketValue: string | null;
  unrealizedGain: string | null;
  latestPrice: string | null;
  latestPriceDate: string | null;
  valuationWarnings: DashboardWarning[];
}

export interface HoldingsValuationSummary {
  reportingCurrency: SnapshotDisplayCurrency;
  totalMarketValue: string | null;
  totalUnrealizedGain: string | null;
  warnings: DashboardWarning[];
  holdings: ValuedHoldingSummary[];
}

export interface HoldingDetailDividendSummary {
  currency: CurrencyCode;
  totalGrossAmount: string;
  totalTaxAmount: string;
  latestDividendDate: string | null;
}

export interface HoldingDetailPriceContext {
  latestPrice: PriceRecord | null;
  previousPrice: PriceRecord | null;
  movementAmount: string | null;
  movementPct: string | null;
  provider: string | null;
}

export interface HoldingDetailLinkedCashLeg {
  parentTransactionId: string;
  transaction: InvestmentTransaction;
}

export interface HoldingDetailSummary {
  reportingCurrency: SnapshotDisplayCurrency;
  hasCurrentPosition: boolean;
  holding: ValuedHoldingSummary;
  account: InvestmentAccount;
  instrument: Instrument;
  transactions: InvestmentTransaction[];
  linkedCashLegs: HoldingDetailLinkedCashLeg[];
  dividendTransactions: InvestmentTransaction[];
  dividendSummary: HoldingDetailDividendSummary;
  priceContext: HoldingDetailPriceContext;
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

export interface InstrumentPriceRecord {
  id: string;
  instrumentId: string;
  priceDate: string;
  closePrice: string;
  currency: CurrencyCode;
  provider: string;
  sourceSymbol: string | null;
  isAdjusted: boolean;
  fetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInstrumentPriceInput {
  instrumentId: string;
  priceDate: string;
  closePrice: string;
  currency: CurrencyCode;
  provider: string;
  sourceSymbol?: string | null;
  isAdjusted?: boolean;
  fetchedAt?: string | null;
}

export interface ExchangeRateRecord {
  id: string;
  rateDate: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: string;
  rateType: RateType;
  provider: string;
  providerRateDate: string | null;
  fetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExchangeRateInput {
  rateDate: string;
  fromCurrency: CurrencyCode;
  toCurrency?: CurrencyCode;
  rate: string;
  rateType?: RateType;
  provider: string;
  providerRateDate?: string | null;
  fetchedAt?: string | null;
}

export function selectLatestPriceRecordsByDistinctDates(records: PriceRecord[], maxDates: number): PriceRecord[] {
  const recordsByDate = new Map<string, PriceRecord[]>();

  for (const record of records) {
    const recordsForDate = recordsByDate.get(record.priceDate) ?? [];
    recordsForDate.push(record);
    recordsByDate.set(record.priceDate, recordsForDate);
  }

  return [...recordsByDate.entries()]
    .sort(([leftDate], [rightDate]) => rightDate.localeCompare(leftDate))
    .slice(0, maxDates)
    .map(([, recordsForDate]) => selectPreferredPriceRecord(recordsForDate));
}

export function selectPreferredPriceRecord(records: PriceRecord[]): PriceRecord {
  const [selected] = [...records].sort(comparePriceRecordsForValuation);

  if (!selected) {
    throw new Error("Cannot select a preferred price from an empty record set.");
  }

  return selected;
}

export function selectPreferredExchangeRateRecord(records: ExchangeRateRecord[]): ExchangeRateRecord {
  const [selected] = [...records].sort(compareExchangeRateRecordsForValuation);

  if (!selected) {
    throw new Error("Cannot select a preferred exchange rate from an empty record set.");
  }

  return selected;
}

function comparePriceRecordsForValuation(left: PriceRecord, right: PriceRecord): number {
  return (
    providerPreference(left.source).localeCompare(providerPreference(right.source)) ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    right.createdAt.localeCompare(left.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareExchangeRateRecordsForValuation(left: ExchangeRateRecord, right: ExchangeRateRecord): number {
  return (
    providerPreference(left.provider).localeCompare(providerPreference(right.provider)) ||
    (right.fetchedAt ?? "").localeCompare(left.fetchedAt ?? "") ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    right.createdAt.localeCompare(left.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function providerPreference(provider: string | null): string {
  if (provider === "manual") {
    return "00:manual";
  }

  return `10:${provider ?? ""}`;
}

export interface JobRun {
  id: string;
  jobName: string;
  status: JobRunStatus;
  triggerSource: JobTriggerSource;
  triggeredByUserId: string | null;
  triggerRequestId: string | null;
  jobStartedAt: string;
  jobFinishedAt: string | null;
  recordsInserted: number;
  recordsSkipped: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DataMaintenanceRetrievalKind = DataKind | "all";

export interface DataMaintenanceRetrievalRequest {
  kind: DataMaintenanceRetrievalKind;
  rateDate?: string;
}

export interface Pagination {
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: Pagination;
}

export interface DataProviderRun {
  id: string;
  jobRunId: string;
  provider: string;
  dataKind: DataKind;
  status: JobRunStatus;
  providerStartedAt: string;
  providerFinishedAt: string | null;
  recordsInserted: number;
  recordsSkipped: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DataMaintenanceBackupRun {
  id: string;
  status: JobRunStatus;
  triggerSource: JobTriggerSource | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  recordsInserted: number | null;
  friendlyFailureReason: string | null;
}

export interface DataMaintenanceBackupSummary {
  latestRun: DataMaintenanceBackupRun | null;
  latestSucceededRun: DataMaintenanceBackupRun | null;
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

export const SNAPSHOT_DISPLAY_CURRENCIES = ["NZD", "USD", "CNY"] as const;
export type SnapshotDisplayCurrency = (typeof SNAPSHOT_DISPLAY_CURRENCIES)[number];

export const PORTFOLIO_TREND_RANGES = ["1m", "3m", "1y", "3y", "5y", "inception"] as const;
export type PortfolioTrendRange = (typeof PORTFOLIO_TREND_RANGES)[number];

export const PORTFOLIO_TREND_WARNING_CODES = ["MISSING_PRINCIPAL_FX_RATE"] as const;
export type PortfolioTrendWarningCode = (typeof PORTFOLIO_TREND_WARNING_CODES)[number];

export interface PortfolioTrendWarning {
  code: PortfolioTrendWarningCode;
  transactionDate: string;
  currency: CurrencyCode;
}

export interface PortfolioTrendPoint {
  date: string;
  portfolioValue: string | null;
  snapshotDate: string | null;
  liveValue?: string | null;
  totalInvestment: string | null;
}

export interface PortfolioPrincipalPoint {
  date: string;
  totalInvestment: string | null;
}

export interface PortfolioTrendSummary {
  range: PortfolioTrendRange;
  rangeStart: string;
  rangeEnd: string;
  currency: SnapshotDisplayCurrency;
  inceptionDate: string | null;
  currentTotalInvestment: string | null;
  cumulativeMovement: string | null;
  warnings: PortfolioTrendWarning[];
}

export interface PortfolioTrend {
  points: PortfolioTrendPoint[];
  principalPoints: PortfolioPrincipalPoint[];
  summary: PortfolioTrendSummary;
}

export const SNAPSHOT_WARNING_CODES = [
  "MISSING_LATEST_PRICE",
  "MISSING_PREVIOUS_PRICE",
  "MISSING_FX_RATE",
  "COST_BASIS_UNAVAILABLE"
] as const;
export type SnapshotWarningCode = (typeof SNAPSHOT_WARNING_CODES)[number];

export interface SnapshotWarning {
  code: SnapshotWarningCode;
  accountId: string;
  accountName: string;
  instrumentId: string;
  instrumentName: string;
  instrumentShortName: string;
  currency: CurrencyCode;
}

export interface PortfolioAccountSnapshotSummary {
  accountId: string;
  accountName: string;
  currency: SnapshotDisplayCurrency;
  marketValue: string | null;
  cost: string | null;
  unrealizedGain: string | null;
  dailyChange: string | null;
  dailyChangePct: string | null;
  warnings: SnapshotWarning[];
}

export interface PortfolioSnapshotSummary {
  id: string;
  snapshotDate: string;
  currency: SnapshotDisplayCurrency;
  marketValue: string | null;
  cost: string | null;
  unrealizedGain: string | null;
  dailyChange: string | null;
  dailyChangePct: string | null;
  usdToNzdRate: string;
  usdToCnyRate: string;
  warnings: SnapshotWarning[];
  accounts: PortfolioAccountSnapshotSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioSnapshotValuationAccount {
  accountId: string;
  accountName: string;
  marketValueUsd: string | null;
  costUsd: string | null;
  unrealizedGainUsd: string | null;
  dailyChangeUsd: string | null;
  dailyChangePct: string | null;
  warnings: SnapshotWarning[];
}

export interface PortfolioSnapshotValuation {
  snapshotDate: string;
  marketValueUsd: string | null;
  costUsd: string | null;
  unrealizedGainUsd: string | null;
  dailyChangeUsd: string | null;
  dailyChangePct: string | null;
  usdToNzdRate: string;
  usdToCnyRate: string;
  warnings: SnapshotWarning[];
  accounts: PortfolioSnapshotValuationAccount[];
}

export function calculatePortfolioSnapshotValuation(input: {
  snapshotDate: string;
  holdings: HoldingSummary[];
  accounts: InvestmentAccount[];
  prices: PriceRecord[];
  fxRates: ExchangeRateRecord[];
}): PortfolioSnapshotValuation {
  const usdRatesByCurrency = groupLatestUsdRatesByCurrency(input.fxRates, input.snapshotDate);
  const pricesByInstrument = groupValidPricesByInstrument(input.holdings, input.prices, input.snapshotDate);
  const usdToNzdRate = getDisplayRate("NZD", usdRatesByCurrency);
  const usdToCnyRate = getDisplayRate("CNY", usdRatesByCurrency);
  const accountStates = new Map<string, PortfolioSnapshotValuationAccumulator>();

  for (const account of input.accounts) {
    accountStates.set(account.id, createSnapshotAccumulator(account.id, account.name));
  }

  for (const holding of input.holdings) {
    const state =
      accountStates.get(holding.accountId) ?? createSnapshotAccumulator(holding.accountId, holding.accountName);
    accountStates.set(holding.accountId, state);
    valueHolding(holding, pricesByInstrument.get(holding.instrumentId) ?? [], usdRatesByCurrency, state);
  }

  const accountResults = [...accountStates.values()].map(toSnapshotAccountValuation);
  const total = combineAccountValuations(input.snapshotDate, accountResults, usdToNzdRate, usdToCnyRate);
  return total;
}

export function convertSnapshotAmount(
  amountUsd: string | null,
  currency: SnapshotDisplayCurrency,
  rates: { usdToNzdRate: string; usdToCnyRate: string }
): string | null {
  if (amountUsd === null) {
    return null;
  }

  const amount = new Decimal(amountUsd);
  if (currency === "USD") {
    return formatDecimal(amount, 2);
  }
  if (currency === "NZD") {
    const rate = new Decimal(rates.usdToNzdRate);
    return rate.isZero() ? null : formatDecimal(amount.times(rate), 2);
  }
  const rate = new Decimal(rates.usdToCnyRate);
  return rate.isZero() ? null : formatDecimal(amount.times(rate), 2);
}

interface PortfolioSnapshotValuationAccumulator {
  accountId: string;
  accountName: string;
  marketValueUsd: Decimal;
  costUsd: Decimal;
  unrealizedGainUsd: Decimal;
  dailyChangeUsd: Decimal;
  priorMarketValueUsd: Decimal;
  marketValueAvailable: boolean;
  costAvailable: boolean;
  unrealizedGainAvailable: boolean;
  dailyChangeAvailable: boolean;
  warnings: SnapshotWarning[];
  warningKeys: Set<string>;
}

function valueHolding(
  holding: HoldingSummary,
  prices: PriceRecord[],
  usdRatesByCurrency: Map<CurrencyCode, Decimal>,
  state: PortfolioSnapshotValuationAccumulator
): void {
  const fxRate = getCurrencyToUsdRate(holding.currency, usdRatesByCurrency);

  if (fxRate === null) {
    addSnapshotWarning(state, "MISSING_FX_RATE", holding);
    markMarketCostAndDailyUnavailable(state);
    return;
  }

  const quantity = new Decimal(holding.quantity);

  if (holding.assetType === "cash") {
    const cashValue = quantity.times(fxRate);
    state.marketValueUsd = state.marketValueUsd.plus(cashValue);
    state.costUsd = state.costUsd.plus(cashValue);
    state.priorMarketValueUsd = state.priorMarketValueUsd.plus(cashValue);
    return;
  }

  const latestPrice = prices[0];

  if (!latestPrice) {
    addSnapshotWarning(state, "MISSING_LATEST_PRICE", holding);
    markMarketCostAndDailyUnavailable(state);
    return;
  }

  const marketValue = quantity.times(latestPrice.closePrice).times(fxRate);
  state.marketValueUsd = state.marketValueUsd.plus(marketValue);

  const holdingCostUsd = getHoldingCostUsd(holding, fxRate);

  if (holdingCostUsd === null) {
    addSnapshotWarning(state, "COST_BASIS_UNAVAILABLE", holding);
    state.costAvailable = false;
    state.unrealizedGainAvailable = false;
  } else {
    state.costUsd = state.costUsd.plus(holdingCostUsd);
    state.unrealizedGainUsd = state.unrealizedGainUsd.plus(marketValue.minus(holdingCostUsd));
  }

  const previousPrice = prices[1];
  const baselinePrice = previousPrice ?? latestPrice;

  const previousValue = quantity.times(baselinePrice.closePrice).times(fxRate);
  state.priorMarketValueUsd = state.priorMarketValueUsd.plus(previousValue);
  state.dailyChangeUsd = state.dailyChangeUsd.plus(marketValue.minus(previousValue));
}

function getHoldingCostUsd(holding: HoldingSummary, latestFxRate: Decimal): Decimal | null {
  if (holding.costAmountUsd !== undefined) {
    return holding.costAmountUsd === null ? null : new Decimal(holding.costAmountUsd);
  }

  return holding.costAmount === null ? null : new Decimal(holding.costAmount).times(latestFxRate);
}

function groupValidPricesByInstrument(
  holdings: HoldingSummary[],
  prices: PriceRecord[],
  snapshotDate: string
): Map<string, PriceRecord[]> {
  const instrumentCurrencies = new Map(holdings.map((holding) => [holding.instrumentId, holding.currency]));
  const groupedPrices = new Map<string, PriceRecord[]>();

  for (const price of prices) {
    if (price.priceDate > snapshotDate || instrumentCurrencies.get(price.instrumentId) !== price.currency) {
      continue;
    }

    const records = groupedPrices.get(price.instrumentId) ?? [];
    records.push(price);
    groupedPrices.set(price.instrumentId, records);
  }

  for (const records of groupedPrices.values()) {
    records.splice(0, records.length, ...selectLatestPriceRecordsByDistinctDates(records, 2));
  }

  return groupedPrices;
}

function groupLatestUsdRatesByCurrency(
  rates: ExchangeRateRecord[],
  snapshotDate: string
): Map<CurrencyCode, Decimal> {
  const ratesByCurrency = new Map<CurrencyCode, Decimal>([["USD", new Decimal(1)]]);
  const groupedRates = new Map<CurrencyCode, Map<string, ExchangeRateRecord[]>>();

  for (const rate of rates) {
    if (rate.rateType !== "valuation" || rate.toCurrency !== "USD" || rate.rateDate > snapshotDate) {
      continue;
    }

    const ratesByDate = groupedRates.get(rate.fromCurrency) ?? new Map<string, ExchangeRateRecord[]>();
    const ratesForDate = ratesByDate.get(rate.rateDate) ?? [];
    ratesForDate.push(rate);
    ratesByDate.set(rate.rateDate, ratesForDate);
    groupedRates.set(rate.fromCurrency, ratesByDate);
  }

  for (const [currency, ratesByDate] of groupedRates) {
    const [latestDate] = [...ratesByDate.keys()].sort((left, right) => right.localeCompare(left));
    const selected = latestDate ? selectPreferredExchangeRateRecord(ratesByDate.get(latestDate) ?? []) : null;

    if (selected) {
      ratesByCurrency.set(currency, new Decimal(selected.rate));
    }
  }

  return ratesByCurrency;
}

function getCurrencyToUsdRate(
  currency: CurrencyCode,
  usdRatesByCurrency: Map<CurrencyCode, Decimal>
): Decimal | null {
  if (currency === "USD") {
    return new Decimal(1);
  }
  return usdRatesByCurrency.get(currency) ?? null;
}

function getDisplayRate(currency: Exclude<SnapshotDisplayCurrency, "USD">, usdRatesByCurrency: Map<CurrencyCode, Decimal>): string {
  const currencyToUsd = usdRatesByCurrency.get(currency);

  if (!currencyToUsd) {
    return "0";
  }

  return formatDecimal(new Decimal(1).dividedBy(currencyToUsd), 10);
}

function createSnapshotAccumulator(accountId: string, accountName: string): PortfolioSnapshotValuationAccumulator {
  return {
    accountId,
    accountName,
    marketValueUsd: new Decimal(0),
    costUsd: new Decimal(0),
    unrealizedGainUsd: new Decimal(0),
    dailyChangeUsd: new Decimal(0),
    priorMarketValueUsd: new Decimal(0),
    marketValueAvailable: true,
    costAvailable: true,
    unrealizedGainAvailable: true,
    dailyChangeAvailable: true,
    warnings: [],
    warningKeys: new Set<string>()
  };
}

function toSnapshotAccountValuation(
  state: PortfolioSnapshotValuationAccumulator
): PortfolioSnapshotValuationAccount {
  const marketValueAvailable = state.marketValueAvailable;
  const dailyChangeAvailable = marketValueAvailable && state.dailyChangeAvailable;

  return {
    accountId: state.accountId,
    accountName: state.accountName,
    marketValueUsd: marketValueAvailable ? formatDecimal(state.marketValueUsd, 6) : null,
    costUsd: marketValueAvailable && state.costAvailable ? formatDecimal(state.costUsd, 6) : null,
    unrealizedGainUsd:
      marketValueAvailable && state.unrealizedGainAvailable ? formatDecimal(state.unrealizedGainUsd, 6) : null,
    dailyChangeUsd: dailyChangeAvailable ? formatDecimal(state.dailyChangeUsd, 6) : null,
    dailyChangePct:
      dailyChangeAvailable && !state.priorMarketValueUsd.isZero()
        ? formatDecimal(state.dailyChangeUsd.dividedBy(state.priorMarketValueUsd).times(100), 8)
        : null,
    warnings: state.warnings
  };
}

function combineAccountValuations(
  snapshotDate: string,
  accounts: PortfolioSnapshotValuationAccount[],
  usdToNzdRate: string,
  usdToCnyRate: string
): PortfolioSnapshotValuation {
  let marketValue = new Decimal(0);
  let cost = new Decimal(0);
  let unrealizedGain = new Decimal(0);
  let dailyChange = new Decimal(0);
  let priorMarketValue = new Decimal(0);
  let marketValueAvailable = true;
  let costAvailable = true;
  let unrealizedGainAvailable = true;
  let dailyChangeAvailable = true;

  for (const account of accounts) {
    if (account.marketValueUsd === null) {
      marketValueAvailable = false;
    } else {
      marketValue = marketValue.plus(account.marketValueUsd);
    }

    if (account.costUsd === null) {
      costAvailable = false;
    } else {
      cost = cost.plus(account.costUsd);
    }

    if (account.unrealizedGainUsd === null) {
      unrealizedGainAvailable = false;
    } else {
      unrealizedGain = unrealizedGain.plus(account.unrealizedGainUsd);
    }

    if (account.dailyChangeUsd === null) {
      dailyChangeAvailable = false;
    } else {
      dailyChange = dailyChange.plus(account.dailyChangeUsd);
      if (account.marketValueUsd !== null) {
        priorMarketValue = priorMarketValue.plus(new Decimal(account.marketValueUsd).minus(account.dailyChangeUsd));
      }
    }
  }

  const totalWarnings = accounts.flatMap((account) => account.warnings);
  return {
    snapshotDate,
    marketValueUsd: marketValueAvailable ? formatDecimal(marketValue, 6) : null,
    costUsd: marketValueAvailable && costAvailable ? formatDecimal(cost, 6) : null,
    unrealizedGainUsd: marketValueAvailable && unrealizedGainAvailable ? formatDecimal(unrealizedGain, 6) : null,
    dailyChangeUsd: marketValueAvailable && dailyChangeAvailable ? formatDecimal(dailyChange, 6) : null,
    dailyChangePct:
      marketValueAvailable && dailyChangeAvailable && !priorMarketValue.isZero()
        ? formatDecimal(dailyChange.dividedBy(priorMarketValue).times(100), 8)
        : null,
    usdToNzdRate,
    usdToCnyRate,
    warnings: totalWarnings,
    accounts
  };
}

function markMarketCostAndDailyUnavailable(state: PortfolioSnapshotValuationAccumulator): void {
  state.marketValueAvailable = false;
  state.costAvailable = false;
  state.unrealizedGainAvailable = false;
  state.dailyChangeAvailable = false;
}

function addSnapshotWarning(
  state: PortfolioSnapshotValuationAccumulator,
  code: SnapshotWarningCode,
  holding: HoldingSummary
): void {
  const key = `${code}:${holding.instrumentId}:${holding.currency}`;

  if (state.warningKeys.has(key)) {
    return;
  }

  state.warningKeys.add(key);
  state.warnings.push({
    code,
    accountId: holding.accountId,
    accountName: holding.accountName,
    instrumentId: holding.instrumentId,
    instrumentName: holding.instrumentName,
    instrumentShortName: holding.instrumentShortName,
    currency: holding.currency
  });
}

function formatDecimal(amount: Decimal, decimalPlaces: number): string {
  return amount.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP).toFixed(decimalPlaces);
}

function formatFlexibleDecimal(amount: Decimal, decimalPlaces: number): string {
  return amount.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP).toString();
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
