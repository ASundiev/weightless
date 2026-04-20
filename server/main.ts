// Deno Deploy entrypoint. One project serves three routes:
//
//   POST /ingest  → parse Health Auto Export JSON and upsert into Postgres
//   POST /api     → JSON-RPC-ish endpoint used by the SPA
//   POST /mcp     → Streamable HTTP MCP server for Claude.ai custom connector
//   GET  /        → 200 ok (health)
//
// Required env: WEIGHTLESS_TOKEN, DATABASE_URL.
// Deploy: `deployctl deploy --project=<name> --entrypoint=server/main.ts`
// (see .github/workflows/deploy-deno.yml).

import { handler as ingest } from "./ingest.ts";
import { handler as api } from "./api.ts";
import { handler as mcp } from "./mcp.ts";
import { corsHeaders, preflight } from "./_shared/cors.ts";

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const url = new URL(req.url);
    switch (url.pathname) {
        case "/ingest":
            return await ingest(req);
        case "/api":
            return await api(req);
        case "/mcp":
            return await mcp(req);
        case "/":
        case "/health":
            return new Response(
                JSON.stringify({ ok: true, service: "weightless", routes: ["/ingest", "/api", "/mcp"] }),
                { status: 200, headers: { "content-type": "application/json", ...corsHeaders } },
            );
        default:
            return new Response(JSON.stringify({ error: "not found" }), {
                status: 404,
                headers: { "content-type": "application/json", ...corsHeaders },
            });
    }
});
