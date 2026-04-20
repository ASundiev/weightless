// Parses a Health Auto Export JSON envelope into typed rows.
//
// Envelope shape:
//   { data: { metrics: [ { name, units, data: [ ... ] } ] } }
//
// Metric names we handle:
//   - sleep_analysis        → SleepSegment[]
//   - weight_body_mass      → WeightEntry[]
//   - step_count            → ActivityDay[] (partial)
//   - active_energy         → ActivityDay[] (partial)
//   - apple_exercise_time   → ActivityDay[] (partial)
//   - dietary_energy        → ActivityDay[] (partial)
//   - resting_heart_rate    → RecoveryDay[] (partial)
//   - heart_rate_variability → RecoveryDay[] (partial, picks SDNN when qty is present)
//   - body_fat_percentage   → BodyComposition[] (partial)
//   - lean_body_mass        → BodyComposition[] (partial)
//
// Daily metrics are aggregated by local date. Activity/recovery/body-comp
// rows are returned with only the fields the metric provides; the ingest
// layer merges partials keyed by date.

import type {
    ActivityDay,
    BodyComposition,
    RecoveryDay,
    SleepSegment,
    SleepStage,
    WeightEntry,
} from "../types.ts";
import { parseHaeTimestamp, toIsoDate } from "../dates.ts";

export interface HaeDataPoint {
    date?: string;
    start?: string;
    startDate?: string;
    end?: string;
    endDate?: string;
    qty?: number;
    value?: string;
    source?: string;
}

export interface HaeMetric {
    name: string;
    units?: string;
    data: HaeDataPoint[];
}

export interface HaeEnvelope {
    data?: { metrics?: HaeMetric[] };
}

export interface ParsedHae {
    weights: WeightEntry[];
    sleepSegments: SleepSegment[];
    activity: Partial<ActivityDay>[];
    recovery: Partial<RecoveryDay>[];
    bodyComposition: Partial<BodyComposition>[];
    unknown: string[]; // metric names we didn't recognise
}

export function parseHae(envelope: HaeEnvelope): ParsedHae {
    const out: ParsedHae = {
        weights: [],
        sleepSegments: [],
        activity: [],
        recovery: [],
        bodyComposition: [],
        unknown: [],
    };
    const metrics = envelope?.data?.metrics ?? [];
    for (const metric of metrics) {
        switch (metric.name) {
            case "sleep_analysis":
                out.sleepSegments.push(...sleepSegmentsFrom(metric));
                break;
            case "weight_body_mass":
                out.weights.push(...weightsFrom(metric));
                break;
            case "step_count":
                out.activity.push(...dailyFrom(metric, "steps", Math.round));
                break;
            case "active_energy":
                out.activity.push(...dailyFrom(metric, "active_kcal"));
                break;
            case "apple_exercise_time":
                out.activity.push(...dailyFrom(metric, "exercise_min", Math.round));
                break;
            case "dietary_energy":
                out.activity.push(...dailyFrom(metric, "dietary_kcal"));
                break;
            case "resting_heart_rate":
                out.recovery.push(...dailyFrom(metric, "resting_hr"));
                break;
            case "heart_rate_variability":
                out.recovery.push(...dailyFrom(metric, "hrv_ms"));
                break;
            case "body_fat_percentage":
                out.bodyComposition.push(...dailyFrom(metric, "body_fat_pct"));
                break;
            case "lean_body_mass":
                out.bodyComposition.push(...dailyFrom(metric, "lean_mass_kg"));
                break;
            default:
                out.unknown.push(metric.name);
        }
    }
    return out;
}

function sleepSegmentsFrom(metric: HaeMetric): SleepSegment[] {
    const rows: SleepSegment[] = [];
    for (const p of metric.data) {
        const startRaw = p.start ?? p.startDate;
        const endRaw = p.end ?? p.endDate;
        const stage = p.value as SleepStage | undefined;
        if (!startRaw || !endRaw || !stage) continue;
        if (!["Core", "REM", "Deep", "Awake", "InBed"].includes(stage)) continue;
        const start = parseHaeTimestamp(startRaw);
        const end = parseHaeTimestamp(endRaw);
        const hours = typeof p.qty === "number"
            ? p.qty
            : (end.getTime() - start.getTime()) / 3_600_000;
        rows.push({
            start_ts: start.toISOString(),
            end_ts: end.toISOString(),
            stage,
            hours: roundTo(hours, 4),
            source: p.source ?? null,
        });
    }
    return rows;
}

function weightsFrom(metric: HaeMetric): WeightEntry[] {
    const rows: WeightEntry[] = [];
    const isLb = (metric.units ?? "").toLowerCase() === "lb";
    for (const p of metric.data) {
        if (typeof p.qty !== "number") continue;
        const tsRaw = p.date ?? p.start ?? p.startDate;
        if (!tsRaw) continue;
        const kg = isLb ? p.qty * 0.453_592_37 : p.qty;
        rows.push({
            date: toIsoDate(parseHaeTimestamp(tsRaw)),
            kg: roundTo(kg, 2),
            source: p.source ?? "apple_health",
        });
    }
    return rows;
}

// Aggregate HAE data points to one-value-per-day.
function dailyFrom<K extends string>(
    metric: HaeMetric,
    field: K,
    transform?: (v: number) => number,
): Array<{ date: string } & Partial<Record<K, number>>> {
    const byDate = new Map<string, { sum: number; count: number }>();
    for (const p of metric.data) {
        if (typeof p.qty !== "number") continue;
        const tsRaw = p.date ?? p.start ?? p.startDate;
        if (!tsRaw) continue;
        const date = toIsoDate(parseHaeTimestamp(tsRaw));
        const bucket = byDate.get(date) ?? { sum: 0, count: 0 };
        bucket.sum += p.qty;
        bucket.count += 1;
        byDate.set(date, bucket);
    }
    // HAE already aggregates most daily metrics, but if multiple points land
    // on the same day we sum counts (steps, kcal, minutes) and average rates
    // (RHR, HRV, body fat, lean mass).
    const isAverage = /resting_hr|hrv_ms|body_fat_pct|lean_mass_kg/.test(field);
    const out: Array<{ date: string } & Partial<Record<K, number>>> = [];
    for (const [date, { sum, count }] of byDate) {
        let v = isAverage ? sum / count : sum;
        if (transform) v = transform(v);
        else v = roundTo(v, 2);
        out.push({ date, [field]: v } as { date: string } & Partial<Record<K, number>>);
    }
    return out;
}

function roundTo(n: number, places: number): number {
    const k = 10 ** places;
    return Math.round(n * k) / k;
}
