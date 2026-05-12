import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const service = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  console.warn(
    "Supabase URL or anon key missing. Public reads will fail. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY in .env.",
  );
}

export const supabaseAnon = createClient(url ?? "", anon ?? "", {
  auth: { persistSession: false },
});

export function supabaseAdmin() {
  if (!service) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY missing — required for server-side writes (bookings, payments).",
    );
  }
  return createClient(url ?? "", service, { auth: { persistSession: false } });
}
