// POST /functions/v1/api
//
// Thin JSON-RPC-ish router used by the SPA. Each request body is
//   { tool: "<name>", args?: { ... } }
// and the response is the tool's return value (or { error }).
//
// The same tool implementations are used by the MCP function, so Claude
// and the UI can't disagree about the numbers.

import { json, requireBearer } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import * as tools from "../_shared/tools.ts";

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const handlers: Record<string, ToolHandler> = {
    get_weight_trend: (a) => tools.getWeightTrend(a),
    get_sleep_summary: (a) => tools.getSleepSummary(a),
    get_activity_summary: (a) => tools.getActivitySummary(a),
    get_recovery_summary: (a) => tools.getRecoverySummary(a),
    get_body_composition_trend: (a) => tools.getBodyCompositionTrend(a),
    compute_goal_eta: (a) => tools.computeGoalEta(a),
    get_correlation: (a) =>
        tools.getCorrelation(
            a as { metric_a: Parameters<typeof tools.getCorrelation>[0]["metric_a"]; metric_b: Parameters<typeof tools.getCorrelation>[0]["metric_b"]; days?: number; lag_days?: number },
        ),
    detect_plateau: (a) => tools.detectWeightPlateau(a),
    weekly_digest: (a) => tools.weeklyDigest(a),
    compare_before_after: (a) =>
        tools.compareBeforeAfter(
            a as { experiment_id: number; metric: Parameters<typeof tools.compareBeforeAfter>[0]["metric"]; window_days?: number },
        ),
    log_weight: (a) => tools.logWeight(a as { date: string; kg: number; note?: string }),
    tag_experiment: (a) =>
        tools.tagExperiment(a as { label: string; start: string; end?: string; note?: string }),
    close_experiment: (a) =>
        tools.closeExperimentById(a as { experiment_id: number; end: string }),
    list_experiments: () => tools.getExperiments(),
};

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    const auth = requireBearer(req);
    if (auth) return auth;

    let body: { tool?: string; args?: Record<string, unknown> };
    try {
        body = await req.json();
    } catch {
        return json({ error: "invalid JSON" }, 400);
    }
    const tool = body.tool;
    if (!tool || !(tool in handlers)) {
        return json({ error: `unknown tool: ${tool}`, available: Object.keys(handlers) }, 400);
    }
    try {
        const result = await handlers[tool](body.args ?? {});
        return json(result);
    } catch (err) {
        return json({ error: String(err instanceof Error ? err.message : err) }, 500);
    }
});
