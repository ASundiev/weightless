// Rolls raw sleep segments up into per-night summaries.
//
// A night is anchored to the wake date: a segment that ends on date D and
// starts no earlier than 18:00 of D-1 (local time of the end timestamp)
// belongs to night D. This matches how Apple Health itself groups sleep.

import type { SleepNight, SleepSegment } from "../types.ts";
import { toIsoDate } from "../dates.ts";

export function aggregateNights(segments: SleepSegment[]): SleepNight[] {
    const byNight = new Map<string, SleepSegment[]>();
    for (const seg of segments) {
        const end = new Date(seg.end_ts);
        const start = new Date(seg.start_ts);
        // Anchor to wake (end) date. If the segment started before 18:00 of
        // the previous day, it's a different sleep episode — skip daytime naps.
        const wakeDate = toIsoDate(end);
        const previousEvening = new Date(end);
        previousEvening.setUTCHours(18, 0, 0, 0);
        previousEvening.setUTCDate(previousEvening.getUTCDate() - 1);
        if (start < previousEvening) continue;
        const bucket = byNight.get(wakeDate) ?? [];
        bucket.push(seg);
        byNight.set(wakeDate, bucket);
    }

    const nights: SleepNight[] = [];
    for (const [date, segs] of byNight) {
        let deep = 0, rem = 0, core = 0, awake = 0;
        let bedtime: string | null = null;
        let wake: string | null = null;
        for (const s of segs) {
            if (s.stage === "Deep") deep += s.hours;
            else if (s.stage === "REM") rem += s.hours;
            else if (s.stage === "Core") core += s.hours;
            else if (s.stage === "Awake") awake += s.hours;
            // InBed intentionally ignored — it's a container, not a stage.
            if (!bedtime || s.start_ts < bedtime) bedtime = s.start_ts;
            if (!wake || s.end_ts > wake) wake = s.end_ts;
        }
        const total = deep + rem + core; // exclude Awake from total sleep
        nights.push({
            date,
            total_hrs: roundTo(total, 2),
            deep_hrs: roundTo(deep, 2),
            rem_hrs: roundTo(rem, 2),
            core_hrs: roundTo(core, 2),
            awake_hrs: roundTo(awake, 2),
            bedtime,
            wake_time: wake,
        });
    }
    nights.sort((a, b) => a.date.localeCompare(b.date));
    return nights;
}

export function datesTouched(segments: SleepSegment[]): string[] {
    const set = new Set<string>();
    for (const s of segments) set.add(toIsoDate(new Date(s.end_ts)));
    return [...set];
}

function roundTo(n: number, places: number): number {
    const k = 10 ** places;
    return Math.round(n * k) / k;
}
