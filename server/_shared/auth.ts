// Bearer-token gate. The same WEIGHTLESS_TOKEN secret is used by:
//   - the local Mac sync script (POST /ingest),
//   - the SPA (every /api call),
//   - Claude.ai when you add the custom MCP connector.

import { corsHeaders } from "./cors.ts";

export function requireBearer(req: Request): Response | null {
    const expected = Deno.env.get("WEIGHTLESS_TOKEN");
    if (!expected) {
        return json({ error: "server misconfigured: WEIGHTLESS_TOKEN not set" }, 500);
    }
    const header = req.headers.get("authorization") ?? "";
    const prefix = "Bearer ";
    if (!header.startsWith(prefix) || header.slice(prefix.length).trim() !== expected) {
        return json({ error: "unauthorized" }, 401);
    }
    return null;
}

export function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...corsHeaders },
    });
}
