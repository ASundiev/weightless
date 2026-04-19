// POST /functions/v1/ingest
//
// Accepts a Health Auto Export JSON envelope:
//   { data: { metrics: [ { name, units, data: [...] } ] } }
//
// Parses it, upserts all known metrics, and rebuilds affected sleep-night
// rollups. Idempotent: replaying the same file produces the same DB state.

import { json, requireBearer } from "../_shared/auth.ts";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { sql } from "../_shared/db.ts";
import { parseHae, type HaeEnvelope } from "../../../shared/hae/parser.ts";
import { aggregateNights, datesTouched } from "../../../shared/hae/aggregate.ts";

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    const auth = requireBearer(req);
    if (auth) return auth;

    let envelope: HaeEnvelope;
    try {
        envelope = (await req.json()) as HaeEnvelope;
    } catch {
        return json({ error: "invalid JSON" }, 400);
    }

    const parsed = parseHae(envelope);
    const counts = {
        weights: 0,
        sleep_segments: 0,
        sleep_nights: 0,
        activity: 0,
        recovery: 0,
        body_composition: 0,
        unknown: parsed.unknown,
    };

    // Weights.
    for (const w of parsed.weights) {
        await sql`
            insert into weight_entries (date, kg, source)
            values (${w.date}, ${w.kg}, ${w.source})
            on conflict (date) do update set kg = excluded.kg, source = excluded.source`;
        counts.weights++;
    }

    // Sleep segments.
    if (parsed.sleepSegments.length > 0) {
        for (const s of parsed.sleepSegments) {
            await sql`
                insert into sleep_segments (start_ts, end_ts, stage, hours, source)
                values (${s.start_ts}, ${s.end_ts}, ${s.stage}, ${s.hours}, ${s.source})
                on conflict (start_ts, stage) do update set
                    end_ts = excluded.end_ts,
                    hours  = excluded.hours,
                    source = excluded.source`;
            counts.sleep_segments++;
        }
        // Rebuild affected nights from the union of ingested segment dates
        // plus all stored segments on those dates (a late-arriving segment
        // can change the rollup).
        const touched = datesTouched(parsed.sleepSegments);
        for (const date of touched) {
            const rows = await sql<Array<{ start_ts: string; end_ts: string; stage: string; hours: number }>>`
                select start_ts, end_ts, stage, hours::float8 as hours
                from sleep_segments
                where end_ts::date = ${date}::date
                   or (end_ts::date = (${date}::date + interval '1 day')
                       and start_ts::date = ${date}::date)`;
            const nights = aggregateNights(rows.map((r) => ({
                start_ts: new Date(r.start_ts).toISOString(),
                end_ts: new Date(r.end_ts).toISOString(),
                stage: r.stage as "Core" | "REM" | "Deep" | "Awake" | "InBed",
                hours: r.hours,
            })));
            for (const n of nights) {
                if (n.date !== date) continue;
                await sql`
                    insert into sleep_nights
                        (date, total_hrs, deep_hrs, rem_hrs, core_hrs, awake_hrs, bedtime, wake_time)
                    values
                        (${n.date}, ${n.total_hrs}, ${n.deep_hrs}, ${n.rem_hrs},
                         ${n.core_hrs}, ${n.awake_hrs}, ${n.bedtime}, ${n.wake_time})
                    on conflict (date) do update set
                        total_hrs = excluded.total_hrs,
                        deep_hrs  = excluded.deep_hrs,
                        rem_hrs   = excluded.rem_hrs,
                        core_hrs  = excluded.core_hrs,
                        awake_hrs = excluded.awake_hrs,
                        bedtime   = excluded.bedtime,
                        wake_time = excluded.wake_time`;
                counts.sleep_nights++;
            }
        }
    }

    // Activity: merge partials keyed by date.
    for (const a of parsed.activity) {
        if (!a.date) continue;
        await sql`
            insert into activity_daily (date, steps, active_kcal, exercise_min, dietary_kcal)
            values (${a.date},
                    ${a.steps ?? null},
                    ${a.active_kcal ?? null},
                    ${a.exercise_min ?? null},
                    ${a.dietary_kcal ?? null})
            on conflict (date) do update set
                steps         = coalesce(excluded.steps, activity_daily.steps),
                active_kcal   = coalesce(excluded.active_kcal, activity_daily.active_kcal),
                exercise_min  = coalesce(excluded.exercise_min, activity_daily.exercise_min),
                dietary_kcal  = coalesce(excluded.dietary_kcal, activity_daily.dietary_kcal)`;
        counts.activity++;
    }

    // Recovery.
    for (const r of parsed.recovery) {
        if (!r.date) continue;
        await sql`
            insert into recovery_daily (date, resting_hr, hrv_ms)
            values (${r.date}, ${r.resting_hr ?? null}, ${r.hrv_ms ?? null})
            on conflict (date) do update set
                resting_hr = coalesce(excluded.resting_hr, recovery_daily.resting_hr),
                hrv_ms     = coalesce(excluded.hrv_ms, recovery_daily.hrv_ms)`;
        counts.recovery++;
    }

    // Body composition.
    for (const b of parsed.bodyComposition) {
        if (!b.date) continue;
        await sql`
            insert into body_composition (date, body_fat_pct, lean_mass_kg)
            values (${b.date}, ${b.body_fat_pct ?? null}, ${b.lean_mass_kg ?? null})
            on conflict (date) do update set
                body_fat_pct = coalesce(excluded.body_fat_pct, body_composition.body_fat_pct),
                lean_mass_kg = coalesce(excluded.lean_mass_kg, body_composition.lean_mass_kg)`;
        counts.body_composition++;
    }

    return new Response(JSON.stringify({ ok: true, counts }), {
        status: 200,
        headers: { "content-type": "application/json", ...corsHeaders },
    });
});
