// Reusable SQL queries. Thin wrappers around `sql` so that both the `api`
// and `mcp` functions can share them without duplicating SQL.

import { sql } from "./db.ts";
import { addDays, todayUtcIso } from "../../../shared/dates.ts";
import type {
    ActivityDay,
    BodyComposition,
    Experiment,
    IsoDate,
    RecoveryDay,
    SleepNight,
    UserSettings,
    WeightEntry,
} from "../../../shared/types.ts";

export async function getSettings(): Promise<UserSettings> {
    const rows = await sql<UserSettings[]>`
        select height_cm, goal_kg_low, goal_kg_high, birthdate
        from user_settings where id = 1`;
    if (rows.length === 0) {
        throw new Error("user_settings row (id=1) is missing — run seed migration");
    }
    return rows[0];
}

export async function getWeights(days: number): Promise<WeightEntry[]> {
    const since = addDays(todayUtcIso(), -days);
    const rows = await sql<Array<{ date: string; kg: string; source: string; note: string | null }>>`
        select to_char(date, 'YYYY-MM-DD') as date, kg::text, source, note
        from weight_entries
        where date >= ${since}
        order by date asc`;
    return rows.map((r) => ({ date: r.date, kg: Number(r.kg), source: r.source, note: r.note }));
}

export async function insertWeight(e: WeightEntry): Promise<void> {
    await sql`
        insert into weight_entries (date, kg, source, note)
        values (${e.date}, ${e.kg}, ${e.source ?? "manual"}, ${e.note ?? null})
        on conflict (date) do update set
            kg = excluded.kg,
            source = excluded.source,
            note = coalesce(excluded.note, weight_entries.note)`;
}

export async function getSleepNights(days: number): Promise<SleepNight[]> {
    const since = addDays(todayUtcIso(), -days);
    const rows = await sql<Array<SleepNight & { date: string }>>`
        select to_char(date, 'YYYY-MM-DD') as date,
               total_hrs::float8 as total_hrs,
               deep_hrs::float8 as deep_hrs,
               rem_hrs::float8 as rem_hrs,
               core_hrs::float8 as core_hrs,
               awake_hrs::float8 as awake_hrs,
               bedtime, wake_time
        from sleep_nights
        where date >= ${since}
        order by date asc`;
    return rows.map((r) => ({
        ...r,
        bedtime: r.bedtime ? new Date(r.bedtime as unknown as string).toISOString() : null,
        wake_time: r.wake_time ? new Date(r.wake_time as unknown as string).toISOString() : null,
    }));
}

export async function getActivity(days: number): Promise<ActivityDay[]> {
    const since = addDays(todayUtcIso(), -days);
    return await sql<ActivityDay[]>`
        select to_char(date, 'YYYY-MM-DD') as date,
               steps, active_kcal::float8 as active_kcal,
               exercise_min, dietary_kcal::float8 as dietary_kcal
        from activity_daily
        where date >= ${since}
        order by date asc`;
}

export async function getRecovery(days: number): Promise<RecoveryDay[]> {
    const since = addDays(todayUtcIso(), -days);
    return await sql<RecoveryDay[]>`
        select to_char(date, 'YYYY-MM-DD') as date,
               resting_hr::float8 as resting_hr,
               hrv_ms::float8 as hrv_ms
        from recovery_daily
        where date >= ${since}
        order by date asc`;
}

export async function getBodyComposition(days: number): Promise<BodyComposition[]> {
    const since = addDays(todayUtcIso(), -days);
    return await sql<BodyComposition[]>`
        select to_char(date, 'YYYY-MM-DD') as date,
               body_fat_pct::float8 as body_fat_pct,
               lean_mass_kg::float8 as lean_mass_kg
        from body_composition
        where date >= ${since}
        order by date asc`;
}

export async function listExperiments(): Promise<Experiment[]> {
    return await sql<Experiment[]>`
        select id,
               label,
               to_char(start_date, 'YYYY-MM-DD') as start_date,
               to_char(end_date, 'YYYY-MM-DD') as end_date,
               note
        from experiments
        order by start_date desc`;
}

export async function insertExperiment(
    label: string,
    start: IsoDate,
    end: IsoDate | null,
    note: string | null,
): Promise<Experiment> {
    const rows = await sql<Experiment[]>`
        insert into experiments (label, start_date, end_date, note)
        values (${label}, ${start}, ${end}, ${note})
        returning id, label,
            to_char(start_date, 'YYYY-MM-DD') as start_date,
            to_char(end_date, 'YYYY-MM-DD') as end_date,
            note`;
    return rows[0];
}

export async function closeExperiment(id: number, end: IsoDate): Promise<Experiment | null> {
    const rows = await sql<Experiment[]>`
        update experiments set end_date = ${end}
        where id = ${id}
        returning id, label,
            to_char(start_date, 'YYYY-MM-DD') as start_date,
            to_char(end_date, 'YYYY-MM-DD') as end_date,
            note`;
    return rows[0] ?? null;
}
