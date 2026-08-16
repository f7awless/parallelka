import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Creates a Supabase client that authenticates every request with the
// current Clerk session token, per Clerk's native third-party auth
// integration (Supabase verifies the token directly, no JWT template needed).
export function createClerkSupabaseClient(session) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    accessToken: async () => (session ? session.getToken() : null),
  });
}
