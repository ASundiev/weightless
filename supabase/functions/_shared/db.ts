// Shared Postgres client for all Edge Functions.
// SUPABASE_DB_URL is injected automatically by the Supabase Edge runtime and
// points at the connection pooler (IPv4-safe, short-lived connections).

import postgres from "npm:postgres@3.4.4";

const url = Deno.env.get("SUPABASE_DB_URL");
if (!url) {
    throw new Error("SUPABASE_DB_URL is not set in this environment");
}

export const sql = postgres(url, {
    prepare: false, // pooler doesn't support prepared statements reliably
    max: 2,
    idle_timeout: 20,
});
