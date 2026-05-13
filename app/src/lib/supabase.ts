import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const service = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

// Lazy anon client. The Supabase JS v2 createClient throws synchronously
// when url is empty/invalid, so we defer construction until first use.
// Pages wrap calls in try/catch and fall back to seed data when this throws.
let _anonClient: SupabaseClient | null = null;
function getAnon(): SupabaseClient {
  if (_anonClient) return _anonClient;
  if (!url || !anon) {
    throw new Error(
      "Supabase env not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY in .env.",
    );
  }
  _anonClient = createClient(url, anon, { auth: { persistSession: false } });
  return _anonClient;
}

// Proxy gives callsites the property-access ergonomics of a real client
// (e.g. supabaseAnon.from(...).select(...)) while construction stays lazy.
export const supabaseAnon = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getAnon();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function supabaseAdmin() {
  if (!url || !service) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (or PUBLIC_SUPABASE_URL) missing — required for server-side writes (bookings, payments).",
    );
  }
  return createClient(url, service, { auth: { persistSession: false } });
}
