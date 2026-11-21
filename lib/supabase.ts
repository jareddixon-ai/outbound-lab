// One shared connection to the Supabase database, for server code only.
//
// It uses the SECRET key, which can read and write everything, so this file
// must never be imported by a page that runs in the browser.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;

  // Accept the URL with or without the "/rest/v1/" Supabase shows next to it.
  const url = process.env.SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase isn't configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY to .env.local (and to Vercel's environment variables).",
    );
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
