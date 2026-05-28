import type { AuthenticatedUser, CurrencyCode, GainColorScheme, Profile, UiTheme } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  preferred_currency: CurrencyCode;
  gain_color_scheme: GainColorScheme;
  ui_theme: UiTheme;
  created_at: string;
  updated_at: string;
}

export async function getOrCreateProfile(user: AuthenticatedUser): Promise<Profile> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select(profileSelect)
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw new Error("Failed to load profile.");
  }

  if (data) {
    return mapProfileRow(data);
  }

  const { data: created, error: createError } = await supabase
    .from("profiles")
    .insert({ id: user.id, email: user.email })
    .select(profileSelect)
    .single<ProfileRow>();

  if (createError) {
    throw new Error("Failed to create profile.");
  }

  return mapProfileRow(created);
}

export async function updateProfilePreferences(
  user: AuthenticatedUser,
  input: { preferredCurrency?: CurrencyCode; gainColorScheme?: GainColorScheme; uiTheme?: UiTheme }
): Promise<Profile> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email,
        ...(input.preferredCurrency !== undefined ? { preferred_currency: input.preferredCurrency } : {}),
        ...(input.gainColorScheme !== undefined ? { gain_color_scheme: input.gainColorScheme } : {}),
        ...(input.uiTheme !== undefined ? { ui_theme: input.uiTheme } : {})
      },
      { onConflict: "id" }
    )
    .select(profileSelect)
    .single<ProfileRow>();

  if (error) {
    throw new Error("Failed to update profile preferences.");
  }

  return mapProfileRow(data);
}

const profileSelect = [
  "id",
  "email",
  "display_name",
  "preferred_currency",
  "gain_color_scheme",
  "ui_theme",
  "created_at",
  "updated_at"
].join(", ");

function mapProfileRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    preferredCurrency: row.preferred_currency,
    gainColorScheme: row.gain_color_scheme,
    uiTheme: row.ui_theme,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
