// Business logic shared between the `api` function (used by the SPA) and
// the `mcp` function (used by Claude). Each tool is a pure async function
// that takes a typed args object and returns a JSON-serialisable result.
//
// Keeping these here — instead of duplicating in each function — ensures
// Claude and the UI always see the same numbers.

import { addDays, todayUtcIso } from "../../../shared/dates.ts";
import { bmi, bmiCategory } from "../../../shared/metrics/bmi.ts";
import { correlate } from "../../../shared/metrics/correlation.ts";
import { detectPlateau } from "../../../shared/metrics/plateau.ts";
import {
    type DatedValue,
    linearFit,
    projectEta,
    trailingMovingAverage,
} from "../../../shared/metrics/trend.ts";
import type { Experiment, IsoDate } from "../../../shared/types.ts";
import {
    closeExperiment,
    getActivity,
    getBodyComposition,
    getRecovery,
    getSettings,
    getSleepNights,
    getWeights,
    insertExperiment,
    insertWeight,
    listExperiments,
} from "./queries.ts";

type MetricName =
    | "weight_kg"
    | "sleep_total_hrs"
    | "sleep_deep_hrs"
    | "sleep_rem_hrs"
    | "steps"
    | "active_kcal"
    | "exercise_min"
    | "dietary_kcal"
    | "resting_hr"
    | "hrv_ms"
    | "body_fat_pct"
    | "lean_mass_kg";

async function loadMetric(metric: MetricName, days: number): Promise<DatedValue[]> {
    switch (metric) {
        case "weight_kg":
            return (await getWeights(days)).map((w) => ({ date: w.date, value: w.kg }));
        case "sleep_total_hrs":
            return (await getSleepNights(days)).map((n) => ({ date: n.date, value: n.total_hrs }));
        case "sleep_deep_hrs":
            return (await getSleepNights(days)).map((n) => ({ date: n.date, value: n.deep_hrs }));
        case "sleep_rem_hrs":
            return (await getSleepNights(days)).map((n) => ({ date: n.date, value: n.rem_hrs }));
        case "steps":
            return (await getActivity(days))
                .filter((a) => a.steps !== null)
                .map((a) => ({ date: a.date, value: a.steps as number }));
        case "active_kcal":
            return (await getActivity(days))
                .filter((a) => a.active_kcal !== null)
                .map((a) => ({ date: a.date, value: a.active_kcal as number }));
        case "exercise_min":
            return (await getActivity(days))
                .filter((a) => a.exercise_min !== null)
                .map((a) => ({ date: a.date, value: a.exercise_min as number }));
        case "dietary_kcal":
            return (await getActivity(days))
                .filter((a) => a.dietary_kcal !== null)
                .map((a) => ({ date: a.date, value: a.dietary_kcal as number }));
        case "resting_hr":
            return (await getRecovery(days))
                .filter((r) => r.resting_hr !== null)
                .map((r) => ({ date: r.date, value: r.resting_hr as number }));
        case "hrv_ms":
            return (await getRecovery(days))
                .filter((r) => r.hrv_ms !== null)
                .map((r) => ({ date: r.date, value: r.hrv_ms as number }));
        case "body_fat_pct":
            return (await getBodyComposition(days))
                .filter((b) => b.body_fat_pct !== null)
                .map((b) => ({ date: b.date, value: b.body_fat_pct as number }));
        case "lean_mass_kg":
            return (await getBodyComposition(days))
                .filter((b) => b.lean_mass_kg !== null)
                .map((b) => ({ date: b.date, value: b.lean_mass_kg as number }));
    }
}

// ---------- read tools ----------

export async function getWeightTrend({ days = 30 }: { days?: number } = {}) {
    const settings = await getSettings();
    const entries = await getWeights(Math.max(days, 1));
    const series: DatedValue[] = entries.map((e) => ({ date: e.date, value: e.kg }));
    const ma7 = trailingMovingAverage(series, 7);
    const fit = linearFit(series);
    const latest = series.at(-1);
    const latestBmi = latest ? bmi(latest.value, Number(settings.height_cm)) : null;
    return {
        entries: series,
        moving_average_7d: ma7,
        slope_kg_per_day: fit ? fit.slopePerDay : null,
        slope_kg_per_week: fit ? fit.slopePerDay * 7 : null,
        r2: fit ? fit.r2 : null,
        latest_kg: latest?.value ?? null,
        latest_date: latest?.date ?? null,
        latest_bmi: latestBmi !== null ? Math.round(latestBmi * 10) / 10 : null,
        bmi_category: latestBmi !== null ? bmiCategory(latestBmi) : null,
        goal_kg_low: Number(settings.goal_kg_low),
        goal_kg_high: Number(settings.goal_kg_high),
    };
}

export async function getSleepSummary({ days = 30 }: { days?: number } = {}) {
    const nights = await getSleepNights(days);
    const totals: DatedValue[] = nights.map((n) => ({ date: n.date, value: n.total_hrs }));
    const ma = trailingMovingAverage(totals, 7);
    const avgTotal = totals.length
        ? totals.reduce((s, p) => s + p.value, 0) / totals.length
        : null;
    const targetHrs = 7.5;
    const debt = totals.reduce((s, p) => s + Math.max(0, targetHrs - p.value), 0);
    return {
        nights,
        moving_average_7d: ma,
        average_hours: avgTotal === null ? null : Math.round(avgTotal * 100) / 100,
        sleep_debt_hrs_vs_7_5: Math.round(debt * 10) / 10,
        n: nights.length,
    };
}

export async function getActivitySummary({ days = 30 }: { days?: number } = {}) {
    const rows = await getActivity(days);
    const avg = (k: keyof (typeof rows)[number]) => {
        const vals = rows.map((r) => r[k]).filter((v): v is number => typeof v === "number");
        return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
    };
    return {
        days: rows,
        average_steps: avg("steps"),
        average_active_kcal: avg("active_kcal"),
        average_exercise_min: avg("exercise_min"),
        average_dietary_kcal: avg("dietary_kcal"),
        n: rows.length,
    };
}

export async function getRecoverySummary({ days = 30 }: { days?: number } = {}) {
    const rows = await getRecovery(days);
    return {
        days: rows,
        average_resting_hr: rows.length
            ? Math.round(
                (rows.filter((r) => r.resting_hr !== null)
                    .reduce((s, r) => s + (r.resting_hr as number), 0) /
                    Math.max(1, rows.filter((r) => r.resting_hr !== null).length)) * 10,
            ) / 10
            : null,
        average_hrv_ms: rows.length
            ? Math.round(
                (rows.filter((r) => r.hrv_ms !== null)
                    .reduce((s, r) => s + (r.hrv_ms as number), 0) /
                    Math.max(1, rows.filter((r) => r.hrv_ms !== null).length)) * 10,
            ) / 10
            : null,
        n: rows.length,
    };
}

export async function getBodyCompositionTrend({ days = 90 }: { days?: number } = {}) {
    const rows = await getBodyComposition(days);
    return { days: rows, n: rows.length };
}

export async function computeGoalEta(
    { target_kg, window_days = 14 }: { target_kg?: number; window_days?: number } = {},
) {
    const settings = await getSettings();
    const target = target_kg ?? (Number(settings.goal_kg_low) + Number(settings.goal_kg_high)) / 2;
    const entries = await getWeights(Math.max(window_days * 3, 30));
    const series: DatedValue[] = entries.map((e) => ({ date: e.date, value: e.kg }));
    const projection = projectEta(series, target, window_days);
    return { target_kg: target, ...projection };
}

export async function getCorrelation(
    { metric_a, metric_b, days = 60, lag_days = 0 }: {
        metric_a: MetricName;
        metric_b: MetricName;
        days?: number;
        lag_days?: number;
    },
) {
    const a = await loadMetric(metric_a, days);
    const b = await loadMetric(metric_b, days);
    return correlate(a, b, { lagDays: lag_days, metricA: metric_a, metricB: metric_b });
}

export async function detectWeightPlateau(
    { days = 14, min_slope_kg_per_week = 0.1 }: { days?: number; min_slope_kg_per_week?: number } = {},
) {
    const weights = (await getWeights(Math.max(days * 2, 21))).map((e) => ({
        date: e.date,
        value: e.kg,
    }));
    return detectPlateau(weights, days, min_slope_kg_per_week);
}

export async function weeklyDigest({ week_start }: { week_start?: IsoDate } = {}) {
    const today = todayUtcIso();
    const start = week_start ?? addDays(today, -6);
    const end = addDays(start, 6);
    const weights = (await getWeights(30))
        .map((e) => ({ date: e.date, value: e.kg }))
        .filter((p) => p.date >= start && p.date <= end);
    const nights = (await getSleepNights(30))
        .filter((n) => n.date >= start && n.date <= end);
    const activity = (await getActivity(30))
        .filter((a) => a.date >= start && a.date <= end);
    const recovery = (await getRecovery(30))
        .filter((r) => r.date >= start && r.date <= end);

    const weightDelta = weights.length >= 2
        ? Math.round((weights.at(-1)!.value - weights[0].value) * 100) / 100
        : null;
    const avgSleep = nights.length
        ? Math.round((nights.reduce((s, n) => s + n.total_hrs, 0) / nights.length) * 100) / 100
        : null;
    const totalSteps = activity.reduce((s, a) => s + (a.steps ?? 0), 0);
    const totalActive = activity.reduce((s, a) => s + (a.active_kcal ?? 0), 0);

    return {
        week_start: start,
        week_end: end,
        weight_start_kg: weights[0]?.value ?? null,
        weight_end_kg: weights.at(-1)?.value ?? null,
        weight_delta_kg: weightDelta,
        average_sleep_hrs: avgSleep,
        sleep_nights_tracked: nights.length,
        total_steps: totalSteps,
        total_active_kcal: Math.round(totalActive),
        days_with_activity: activity.length,
        average_resting_hr: recovery.length
            ? Math.round(
                (recovery.filter((r) => r.resting_hr !== null)
                    .reduce((s, r) => s + (r.resting_hr as number), 0) /
                    Math.max(1, recovery.filter((r) => r.resting_hr !== null).length)) * 10,
            ) / 10
            : null,
        plateau: await detectWeightPlateau({ days: 14 }),
        goal_eta: await computeGoalEta({}),
    };
}

export async function compareBeforeAfter(
    { experiment_id, metric, window_days = 14 }: {
        experiment_id: number;
        metric: MetricName;
        window_days?: number;
    },
) {
    const experiments = await listExperiments();
    const exp = experiments.find((e) => e.id === experiment_id);
    if (!exp) return { error: `experiment ${experiment_id} not found` };
    const series = await loadMetric(metric, 365);
    const boundary = exp.start_date;
    const beforeStart = addDays(boundary, -window_days);
    const afterEnd = exp.end_date ?? addDays(boundary, window_days);
    const before = series.filter((p) => p.date >= beforeStart && p.date < boundary);
    const after = series.filter((p) => p.date >= boundary && p.date <= afterEnd);
    const mean = (xs: DatedValue[]) =>
        xs.length ? xs.reduce((s, p) => s + p.value, 0) / xs.length : null;
    const bMean = mean(before);
    const aMean = mean(after);
    return {
        experiment: exp,
        metric,
        window_days,
        before_mean: bMean === null ? null : Math.round(bMean * 1000) / 1000,
        after_mean: aMean === null ? null : Math.round(aMean * 1000) / 1000,
        delta: bMean !== null && aMean !== null
            ? Math.round((aMean - bMean) * 1000) / 1000
            : null,
        before_n: before.length,
        after_n: after.length,
    };
}

// ---------- write tools ----------

export async function logWeight(
    { date, kg, note }: { date: IsoDate; kg: number; note?: string },
) {
    await insertWeight({ date, kg, source: "manual", note: note ?? null });
    return { ok: true, date, kg };
}

export async function tagExperiment(
    { label, start, end, note }: { label: string; start: IsoDate; end?: IsoDate; note?: string },
): Promise<Experiment> {
    return await insertExperiment(label, start, end ?? null, note ?? null);
}

export async function closeExperimentById(
    { experiment_id, end }: { experiment_id: number; end: IsoDate },
): Promise<Experiment | { error: string }> {
    const updated = await closeExperiment(experiment_id, end);
    if (!updated) return { error: `experiment ${experiment_id} not found` };
    return updated;
}

export async function getExperiments() {
    return await listExperiments();
}
