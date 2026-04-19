// Trend math: centered/trailing moving average, ordinary least-squares
// regression, and ETA-to-goal projection.

import { addDays, daysBetween, todayUtcIso } from "../dates.ts";
import type { IsoDate } from "../types.ts";

export interface DatedValue {
    date: IsoDate;
    value: number;
}

// Trailing moving average over the last N days; emits one output per input
// point (so the chart shows a smoothed line covering the whole range).
export function trailingMovingAverage(points: DatedValue[], window: number): DatedValue[] {
    if (points.length === 0) return [];
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
    const out: DatedValue[] = [];
    for (let i = 0; i < sorted.length; i++) {
        const start = Math.max(0, i - window + 1);
        const slice = sorted.slice(start, i + 1);
        const avg = slice.reduce((s, p) => s + p.value, 0) / slice.length;
        out.push({ date: sorted[i].date, value: roundTo(avg, 3) });
    }
    return out;
}

export interface LinearFit {
    slopePerDay: number;   // kg per day (or metric per day)
    intercept: number;     // value at day 0
    r2: number;
    start: IsoDate;        // origin date of the fit window
    n: number;
}

// OLS regression treating date as day-offset from the earliest point.
export function linearFit(points: DatedValue[]): LinearFit | null {
    if (points.length < 2) return null;
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
    const start = sorted[0].date;
    const xs = sorted.map((p) => daysBetween(start, p.date));
    const ys = sorted.map((p) => p.value);
    const n = xs.length;
    const meanX = xs.reduce((s, x) => s + x, 0) / n;
    const meanY = ys.reduce((s, y) => s + y, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - meanX;
        const dy = ys[i] - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }
    if (denX === 0) return null;
    const slope = num / denX;
    const intercept = meanY - slope * meanX;
    const r2 = denY === 0 ? 1 : (num * num) / (denX * denY);
    return { slopePerDay: slope, intercept, r2, start, n };
}

export interface GoalProjection {
    reachable: boolean;
    etaDate: IsoDate | null;
    daysRemaining: number | null;
    weeklyRateKg: number;          // negative = losing
    kcalDailyDeficitImplied: number; // approx; 7700 kcal per kg
    currentKg: number;
    targetKg: number;
    slopeFlat: boolean;
}

// Project when the goal weight will be hit, using last N days of data.
export function projectEta(
    weights: DatedValue[],
    targetKg: number,
    windowDays = 14,
): GoalProjection | null {
    if (weights.length === 0) return null;
    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const cutoff = addDays(latest.date, -windowDays);
    const window = sorted.filter((p) => p.date >= cutoff);
    const fit = linearFit(window);
    const weeklyRate = fit ? fit.slopePerDay * 7 : 0;
    const slopeFlat = !fit || Math.abs(fit.slopePerDay) < 0.005; // <35g/week
    if (!fit || fit.slopePerDay >= 0) {
        return {
            reachable: latest.value <= targetKg,
            etaDate: null,
            daysRemaining: null,
            weeklyRateKg: roundTo(weeklyRate, 3),
            kcalDailyDeficitImplied: 0,
            currentKg: latest.value,
            targetKg,
            slopeFlat,
        };
    }
    const daysFromStart = (targetKg - fit.intercept) / fit.slopePerDay;
    const etaDate = addDays(fit.start, Math.round(daysFromStart));
    const daysRemaining = daysBetween(todayUtcIso(), etaDate);
    // 1 kg fat ≈ 7700 kcal. Daily deficit implied by the observed weekly rate.
    const kcalDaily = Math.abs(fit.slopePerDay) * 7700;
    return {
        reachable: true,
        etaDate,
        daysRemaining,
        weeklyRateKg: roundTo(weeklyRate, 3),
        kcalDailyDeficitImplied: Math.round(kcalDaily),
        currentKg: latest.value,
        targetKg,
        slopeFlat,
    };
}

function roundTo(n: number, places: number): number {
    const k = 10 ** places;
    return Math.round(n * k) / k;
}
