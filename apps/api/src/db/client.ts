export interface DatabaseClientPlaceholder {
  readonly connected: false;
}

export function getDatabaseClient(): DatabaseClientPlaceholder {
  // TODO: Stage 1 will initialize a Supabase server-side client here.
  return { connected: false };
}
