// Pearson correlation and lagged correlation between two dated series.

import { addDays } from "../dates.ts";
import type { DatedValue } from "./trend.ts";

export interface CorrelationResult {
    r: number;                 // Pearson correlation
    slope: number;             // OLS slope (metricB per unit metricA)
    intercept: number;
    n: number;                 // number of paired points
    lagDays: number;
    metricA: string;
    metricB: string;
}

// Align two series on date (optionally with a lag on B) and compute Pearson r
// plus an OLS linear fit of B on A.
//
// lagDays > 0 means "yesterday's A vs today's B", i.e. A.date + lagDays = B.date.
export function correlate(
    a: DatedValue[],
    b: DatedValue[],
    opts: { lagDays?: number; metricA?: string; metricB?: string } = {},
): CorrelationResult | null {
    const lag = opts.lagDays ?? 0;
    const bByDate = new Map(b.map((p) => [p.date, p.value] as const));
    const pairs: Array<{ a: number; b: number }> = [];
    for (const pa of a) {
        const bDate = lag === 0 ? pa.date : addDays(pa.date, lag);
        const bv = bByDate.get(bDate);
        if (bv === undefined) continue;
        if (!isFinite(pa.value) || !isFinite(bv)) continue;
        pairs.push({ a: pa.value, b: bv });
    }
    if (pairs.length < 3) return null;
    const n = pairs.length;
    const meanA = pairs.reduce((s, p) => s + p.a, 0) / n;
    const meanB = pairs.reduce((s, p) => s + p.b, 0) / n;
    let num = 0, denA = 0, denB = 0;
    for (const p of pairs) {
        const da = p.a - meanA;
        const db = p.b - meanB;
        num += da * db;
        denA += da * da;
        denB += db * db;
    }
    if (denA === 0 || denB === 0) return null;
    const r = num / Math.sqrt(denA * denB);
    const slope = num / denA;
    const intercept = meanB - slope * meanA;
    return {
        r: roundTo(r, 4),
        slope: roundTo(slope, 4),
        intercept: roundTo(intercept, 4),
        n,
        lagDays: lag,
        metricA: opts.metricA ?? "a",
        metricB: opts.metricB ?? "b",
    };
}

function roundTo(n: number, places: number): number {
    const k = 10 ** places;
    return Math.round(n * k) / k;
}
