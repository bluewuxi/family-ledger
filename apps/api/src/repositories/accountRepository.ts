import type { CreateInvestmentAccountInput, InvestmentAccount, UpdateInvestmentAccountInput } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface InvestmentAccountRow {
  id: string;
  name: string;
  broker: string | null;
  account_type: InvestmentAccount["accountType"];
  base_currency: InvestmentAccount["baseCurrency"];
  market_region: InvestmentAccount["marketRegion"];
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export class AccountNotFoundError extends Error {
  constructor() {
    super("Account was not found.");
  }
}

export class AccountInUseError extends Error {
  constructor() {
    super("Account cannot be deleted because it is used by transactions.");
  }
}

export async function listAccounts(): Promise<InvestmentAccount[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("investment_accounts")
    .select(accountSelect)
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Failed to list accounts.");
  }

  return (data as unknown as InvestmentAccountRow[]).map(mapAccountRow);
}

export async function findAccountById(id: string): Promise<InvestmentAccount | null> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("investment_accounts")
    .select(accountSelect)
    .eq("id", id)
    .maybeSingle<InvestmentAccountRow>();

  if (error) {
    throw new Error("Failed to find account.");
  }

  return data ? mapAccountRow(data) : null;
}

export async function createAccount(
  input: CreateInvestmentAccountInput,
  userId: string
): Promise<InvestmentAccount> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("investment_accounts")
    .insert({
      name: input.name,
      broker: input.broker ?? null,
      account_type: input.accountType,
      base_currency: input.baseCurrency,
      market_region: input.marketRegion,
      notes: input.notes ?? null,
      created_by_user_id: userId,
      updated_by_user_id: userId
    })
    .select(accountSelect)
    .single<InvestmentAccountRow>();

  if (error) {
    throw new Error("Failed to create account.");
  }

  return mapAccountRow(data);
}

export async function updateAccount(
  id: string,
  input: UpdateInvestmentAccountInput,
  userId: string
): Promise<InvestmentAccount> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("investment_accounts")
    .update({
      ...toAccountUpdateRow(input),
      updated_by_user_id: userId
    })
    .eq("id", id)
    .select(accountSelect)
    .maybeSingle<InvestmentAccountRow>();

  if (error) {
    throw new Error("Failed to update account.");
  }

  if (!data) {
    throw new AccountNotFoundError();
  }

  return mapAccountRow(data);
}

export async function deleteAccount(id: string): Promise<void> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("investment_accounts")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    if (error.code === "23503") {
      throw new AccountInUseError();
    }

    throw new Error("Failed to delete account.");
  }

  if (!data) {
    throw new AccountNotFoundError();
  }
}

const accountSelect = [
  "id",
  "name",
  "broker",
  "account_type",
  "base_currency",
  "market_region",
  "notes",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at"
].join(", ");

function mapAccountRow(row: InvestmentAccountRow): InvestmentAccount {
  return {
    id: row.id,
    name: row.name,
    broker: row.broker,
    accountType: row.account_type,
    baseCurrency: row.base_currency,
    marketRegion: row.market_region,
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toAccountUpdateRow(input: UpdateInvestmentAccountInput) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.broker !== undefined ? { broker: input.broker } : {}),
    ...(input.accountType !== undefined ? { account_type: input.accountType } : {}),
    ...(input.baseCurrency !== undefined ? { base_currency: input.baseCurrency } : {}),
    ...(input.marketRegion !== undefined ? { market_region: input.marketRegion } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {})
  };
}
