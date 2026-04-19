// Domain types shared between the SPA (Vite/Node) and Supabase Edge
// Functions (Deno). Pure TS, no runtime deps.

export type IsoDate = string; // YYYY-MM-DD

export type SleepStage = "Core" | "REM" | "Deep" | "Awake" | "InBed";

export interface WeightEntry {
    date: IsoDate;
    kg: number;
    source: string;
    note?: string | null;
}

export interface SleepSegment {
    start_ts: string;
    end_ts: string;
    stage: SleepStage;
    hours: number;
    source?: string | null;
}

export interface SleepNight {
    date: IsoDate;
    total_hrs: number;
    deep_hrs: number;
    rem_hrs: number;
    core_hrs: number;
    awake_hrs: number;
    bedtime: string | null;
    wake_time: string | null;
}

export interface ActivityDay {
    date: IsoDate;
    steps: number | null;
    active_kcal: number | null;
    exercise_min: number | null;
    dietary_kcal: number | null;
}

export interface RecoveryDay {
    date: IsoDate;
    resting_hr: number | null;
    hrv_ms: number | null;
}

export interface BodyComposition {
    date: IsoDate;
    body_fat_pct: number | null;
    lean_mass_kg: number | null;
}

export interface Experiment {
    id: number;
    label: string;
    start_date: IsoDate;
    end_date: IsoDate | null;
    note?: string | null;
}

export interface UserSettings {
    height_cm: number;
    goal_kg_low: number;
    goal_kg_high: number;
    birthdate: IsoDate | null;
}
