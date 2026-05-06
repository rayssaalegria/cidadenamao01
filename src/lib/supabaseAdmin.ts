import { createClient } from "@supabase/supabase-js";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getSupabaseAdmin() {
  const url = getRequiredEnv("SUPABASE_URL");
  const key = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  // Supabase (2026) introduziu keys `sb_secret_*` (não-JWT). Para elas, enviar
  // `Authorization: Bearer <sb_secret_...>` pode fazer o PostgREST rejeitar por não ser JWT.
  // Mantemos `apikey` e removemos `Authorization` quando ela é a própria API key.
  const isSecretKey = key.startsWith("sb_secret_");
  const fetchWithStrippedAuth: typeof fetch = async (input, init) => {
    if (!isSecretKey) return fetch(input, init);

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const auth = headers.get("authorization") || headers.get("Authorization") || "";
    if (auth.replace(/^Bearer\s+/i, "") === key) {
      headers.delete("authorization");
      headers.delete("Authorization");
    }

    return fetch(input, { ...(init || {}), headers });
  };

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithStrippedAuth },
  });
}

