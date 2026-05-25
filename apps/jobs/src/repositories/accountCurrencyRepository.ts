import type { CurrencyCode } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface AccountCurrencyRow {
  base_currency: CurrencyCode;
}

interface InstrumentCurrencyRow {
  currency: CurrencyCode;
}

export async function listDistinctAccountBaseCurrencies(): Promise<CurrencyCode[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("investment_accounts")
    .select("base_currency")
    .returns<AccountCurrencyRow[]>();

  if (error) {
    throw new Error("Failed to list account base currencies.");
  }

  return [...new Set(data.map((row) => row.base_currency))];
}

export async function listDistinctAccountAndInstrumentCurrencies(): Promise<CurrencyCode[]> {
  const supabase = await getSupabaseAdmin();
  const [accountResult, instrumentResult] = await Promise.all([
    supabase.from("investment_accounts").select("base_currency").returns<AccountCurrencyRow[]>(),
    supabase.from("instruments").select("currency").returns<InstrumentCurrencyRow[]>()
  ]);

  if (accountResult.error || instrumentResult.error) {
    throw new Error("Failed to list settlement FX currencies.");
  }

  return [
    ...new Set([
      ...accountResult.data.map((row) => row.base_currency),
      ...instrumentResult.data.map((row) => row.currency)
    ])
  ];
}
