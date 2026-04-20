// Plateau detection — is the weight trend stalling?

import { addDays } from "../dates.ts";
import { linearFit, type DatedValue } from "./trend.ts";

export interface PlateauResult {
    plateau: boolean;
    windowDays: number;
    slopeKgPerWeek: number;
    thresholdKgPerWeek: number;
    n: number;
}

export function detectPlateau(
    weights: DatedValue[],
    windowDays = 14,
    minSlopeKgPerWeek = 0.1,
): PlateauResult | null {
    if (weights.length < 3) return null;
    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1].date;
    const cutoff = addDays(latest, -windowDays);
    const window = sorted.filter((p) => p.date >= cutoff);
    if (window.length < 3) return null;
    const fit = linearFit(window);
    if (!fit) return null;
    const slopeWeek = fit.slopePerDay * 7;
    return {
        plateau: slopeWeek > -minSlopeKgPerWeek, // not losing fast enough (or gaining)
        windowDays,
        slopeKgPerWeek: Math.round(slopeWeek * 1000) / 1000,
        thresholdKgPerWeek: -minSlopeKgPerWeek,
        n: window.length,
    };
}
