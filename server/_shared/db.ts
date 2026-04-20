// Shared Postgres client for all routes. DATABASE_URL is set in Deno Deploy
// (and locally via .env). Pooled Neon URLs use `-pooler` in the hostname;
// works with postgres.js as long as prepared statements are disabled.

import postgres from "npm:postgres@3.4.4";

const url = Deno.env.get("DATABASE_URL");
if (!url) {
    throw new Error("DATABASE_URL is not set in this environment");
}

export const sql = postgres(url, {
    prepare: false,
    max: 2,
    idle_timeout: 20,
    onnotice: () => {},
});
