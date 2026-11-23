export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getAppMode(): "cloud" | "local" {
  return isSupabaseConfigured() ? "cloud" : "local";
}

export function getAuthSecret(): string {
  return (
    process.env.APP_AUTH_SECRET || "obs-board-local-dev-secret-change-in-prod"
  );
}
