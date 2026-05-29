import { createClient } from "@supabase/supabase-js";

export function getSupabaseClient() {
  const url = process.env["DB_URL"];
  const key = process.env["DB_SERVICE_KEY"];

  if (!url || !key) {
    throw new Error("Missing DB_URL or DB_SERVICE_KEY environment variables");
  }

  return createClient(url, key);
}
