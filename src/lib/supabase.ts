export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export class SupabaseError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(message);
  }
}

export async function supabaseRequest<T>(
  env: SupabaseEnv,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const headers = new Headers(init.headers);
  headers.set("apikey", env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set("authorization", `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  headers.set("content-type", "application/json");
  headers.set("accept", "application/json");

  const response = await fetch(url, { ...init, headers });
  const text = await response.text();

  if (!response.ok) {
    throw new SupabaseError(`Supabase request failed: ${response.status}`, response.status, text);
  }

  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
