// POST /mcp
//
// Remote MCP server over the Streamable HTTP transport (stateless per
// request). Claude.ai adds this URL as a custom connector; the bearer token
// is supplied in the connector config. Uses your Claude Pro subscription
// instead of the Anthropic API — no API billing.

import { corsHeaders, preflight } from "./_shared/cors.ts";
import { requireBearer } from "./_shared/auth.ts";
import * as tools from "./_shared/tools.ts";

const PROTOCOL_VERSION = "2024-11-05";

interface JsonRpcRequest {
    jsonrpc: "2.0";
    id?: string | number;
    method: string;
    params?: unknown;
}

interface ToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const metricEnum = [
    "weight_kg", "sleep_total_hrs", "sleep_deep_hrs", "sleep_rem_hrs",
    "steps", "active_kcal", "exercise_min", "dietary_kcal",
    "resting_hr", "hrv_ms", "body_fat_pct", "lean_mass_kg",
];

const toolList: ToolDef[] = [
    {
        name: "get_weight_trend",
        description:
            "Returns recent weight entries with a 7-day trailing moving average, OLS slope (kg/day, kg/week, r²), current BMI, and the user's goal range.",
        inputSchema: {
            type: "object",
            properties: { days: { type: "integer", minimum: 1, default: 30 } },
        },
        handler: (a) => tools.getWeightTrend(a),
    },
    {
        name: "get_sleep_summary",
        description:
            "Nightly sleep totals with Deep/REM/Core/Awake breakdown, 7-day moving average, average hours, and sleep debt vs. a 7.5h target.",
        inputSchema: {
            type: "object",
            properties: { days: { type: "integer", minimum: 1, default: 30 } },
        },
        handler: (a) => tools.getSleepSummary(a),
    },
    {
        name: "get_activity_summary",
        description: "Daily steps, active kcal, Apple Exercise minutes, and dietary kcal with averages.",
        inputSchema: {
            type: "object",
            properties: { days: { type: "integer", minimum: 1, default: 30 } },
        },
        handler: (a) => tools.getActivitySummary(a),
    },
    {
        name: "get_recovery_summary",
        description: "Daily resting heart rate and HRV (SDNN) with averages.",
        inputSchema: {
            type: "object",
            properties: { days: { type: "integer", minimum: 1, default: 30 } },
        },
        handler: (a) => tools.getRecoverySummary(a),
    },
    {
        name: "get_body_composition_trend",
        description: "Body fat % and lean body mass from a smart scale (if exported).",
        inputSchema: {
            type: "object",
            properties: { days: { type: "integer", minimum: 1, default: 90 } },
        },
        handler: (a) => tools.getBodyCompositionTrend(a),
    },
    {
        name: "compute_goal_eta",
        description:
            "Projects the date the user reaches their target weight, using a linear regression over the last N days. Returns ETA date, days remaining, weekly rate, and implied daily kcal deficit (7700 kcal ≈ 1 kg).",
        inputSchema: {
            type: "object",
            properties: {
                target_kg: { type: "number", description: "Target weight in kg. Defaults to midpoint of user's goal range." },
                window_days: { type: "integer", minimum: 3, default: 14 },
            },
        },
        handler: (a) => tools.computeGoalEta(a),
    },
    {
        name: "get_correlation",
        description:
            "Computes Pearson r and an OLS linear fit between two metrics, optionally with a lag (e.g. lag_days=1 compares yesterday's sleep to today's weight).",
        inputSchema: {
            type: "object",
            required: ["metric_a", "metric_b"],
            properties: {
                metric_a: { type: "string", enum: metricEnum },
                metric_b: { type: "string", enum: metricEnum },
                days: { type: "integer", minimum: 7, default: 60 },
                lag_days: { type: "integer", default: 0 },
            },
        },
        handler: (a) =>
            tools.getCorrelation(
                a as { metric_a: typeof metricEnum[number]; metric_b: typeof metricEnum[number]; days?: number; lag_days?: number },
            ),
    },
    {
        name: "detect_plateau",
        description:
            "Returns true if the weight trend over the last N days is flatter than min_slope_kg_per_week (i.e. not losing fast enough).",
        inputSchema: {
            type: "object",
            properties: {
                days: { type: "integer", minimum: 7, default: 14 },
                min_slope_kg_per_week: { type: "number", default: 0.1 },
            },
        },
        handler: (a) => tools.detectWeightPlateau(a),
    },
    {
        name: "weekly_digest",
        description:
            "Structured numbers for the last 7 days (weight delta, avg sleep, total steps, active kcal, RHR, plateau check, goal ETA). Claude is expected to write the narrative from these.",
        inputSchema: {
            type: "object",
            properties: { week_start: { type: "string", format: "date" } },
        },
        handler: (a) => tools.weeklyDigest(a),
    },
    {
        name: "compare_before_after",
        description:
            "For a tagged experiment, compares the mean of a metric in the window before the start date vs. the window after it. Useful for 'did 16:8 help?' questions.",
        inputSchema: {
            type: "object",
            required: ["experiment_id", "metric"],
            properties: {
                experiment_id: { type: "integer" },
                metric: { type: "string", enum: metricEnum },
                window_days: { type: "integer", minimum: 3, default: 14 },
            },
        },
        handler: (a) =>
            tools.compareBeforeAfter(
                a as { experiment_id: number; metric: typeof metricEnum[number]; window_days?: number },
            ),
    },
    {
        name: "log_weight",
        description: "Record a manual weigh-in.",
        inputSchema: {
            type: "object",
            required: ["date", "kg"],
            properties: {
                date: { type: "string", format: "date" },
                kg: { type: "number", minimum: 20, maximum: 300 },
                note: { type: "string" },
            },
        },
        handler: (a) => tools.logWeight(a as { date: string; kg: number; note?: string }),
    },
    {
        name: "tag_experiment",
        description:
            "Start (or open-ended-close) a tagged period such as '16:8 fasting' or 'no-alcohol week'. Used later by compare_before_after.",
        inputSchema: {
            type: "object",
            required: ["label", "start"],
            properties: {
                label: { type: "string" },
                start: { type: "string", format: "date" },
                end: { type: "string", format: "date" },
                note: { type: "string" },
            },
        },
        handler: (a) =>
            tools.tagExperiment(a as { label: string; start: string; end?: string; note?: string }),
    },
    {
        name: "close_experiment",
        description: "Set an end date on a previously-tagged experiment.",
        inputSchema: {
            type: "object",
            required: ["experiment_id", "end"],
            properties: {
                experiment_id: { type: "integer" },
                end: { type: "string", format: "date" },
            },
        },
        handler: (a) =>
            tools.closeExperimentById(a as { experiment_id: number; end: string }),
    },
    {
        name: "list_experiments",
        description: "List all tagged experiments (current + historical).",
        inputSchema: { type: "object", properties: {} },
        handler: () => tools.getExperiments(),
    },
];

const toolsByName = new Map(toolList.map((t) => [t.name, t]));

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
    return { jsonrpc: "2.0", id, result };
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
    return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRpc(msg: JsonRpcRequest): Promise<Record<string, unknown> | null> {
    switch (msg.method) {
        case "initialize":
            return rpcResult(msg.id, {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: "weightless", version: "0.1.0" },
            });
        case "notifications/initialized":
        case "notifications/cancelled":
            return null;
        case "ping":
            return rpcResult(msg.id, {});
        case "tools/list":
            return rpcResult(msg.id, {
                tools: toolList.map((t) => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema,
                })),
            });
        case "tools/call": {
            const params = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
            const tool = params.name ? toolsByName.get(params.name) : undefined;
            if (!tool) {
                return rpcError(msg.id, -32_602, `unknown tool: ${params.name}`);
            }
            try {
                const out = await tool.handler(params.arguments ?? {});
                return rpcResult(msg.id, {
                    content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
                    isError: false,
                });
            } catch (err) {
                return rpcResult(msg.id, {
                    content: [{ type: "text", text: String(err instanceof Error ? err.message : err) }],
                    isError: true,
                });
            }
        }
        default:
            return rpcError(msg.id, -32_601, `method not found: ${msg.method}`);
    }
}

export async function handler(req: Request): Promise<Response> {
    const pre = preflight(req);
    if (pre) return pre;

    if (req.method === "GET") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    const auth = requireBearer(req);
    if (auth) return auth;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify(rpcError(null, -32_700, "parse error")), {
            status: 400,
            headers: { "content-type": "application/json", ...corsHeaders },
        });
    }

    const messages: JsonRpcRequest[] = Array.isArray(body)
        ? (body as JsonRpcRequest[])
        : [body as JsonRpcRequest];

    const responses: Array<Record<string, unknown>> = [];
    for (const m of messages) {
        const r = await handleRpc(m);
        if (r) responses.push(r);
    }

    if (responses.length === 0) {
        return new Response(null, { status: 202, headers: corsHeaders });
    }
    const payload = Array.isArray(body) ? responses : responses[0];
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json", ...corsHeaders },
    });
}
