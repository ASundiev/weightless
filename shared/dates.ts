// Date helpers — deliberately small and timezone-aware. HAE emits strings
// like "2026-04-18 02:11:42 +0100"; we preserve the original offset.

import type { IsoDate } from "./types.ts";

export function toIsoDate(d: Date): IsoDate {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

// Parse HAE timestamp: "2026-04-18 02:11:42 +0100" → Date.
export function parseHaeTimestamp(s: string): Date {
    // JS Date accepts ISO-ish strings; replace the space with 'T' and keep the offset.
    const iso = s.replace(" ", "T").replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2");
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        throw new Error(`invalid HAE timestamp: ${s}`);
    }
    return d;
}

export function addDays(d: IsoDate, delta: number): IsoDate {
    const dt = new Date(`${d}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + delta);
    return toIsoDate(dt);
}

export function daysBetween(a: IsoDate, b: IsoDate): number {
    const da = new Date(`${a}T00:00:00Z`).getTime();
    const db = new Date(`${b}T00:00:00Z`).getTime();
    return Math.round((db - da) / 86_400_000);
}

export function todayUtcIso(): IsoDate {
    return toIsoDate(new Date());
}
