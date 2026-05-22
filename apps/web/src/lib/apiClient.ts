import type { ApiResponse } from "@family-ledger/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  // TODO: Attach Supabase Bearer token to API calls after reading the current session.
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  });

  return (await response.json()) as ApiResponse<T>;
}
