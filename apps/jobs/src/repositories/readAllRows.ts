/** Fetch every page with a stable ordering supplied by the caller. */
export async function readAllRows<T>(
  query: { range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }> },
  limit?: number
): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  const rows: T[] = [];
  while (limit === undefined || rows.length < limit) {
    const size = Math.min(500, limit === undefined ? 500 : limit - rows.length);
    const result = await query.range(rows.length, rows.length + size - 1);
    if (result.error) return { data: rows, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < size) break;
  }
  return { data: rows, error: null };
}
