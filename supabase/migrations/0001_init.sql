-- Weightless core schema.
-- All tables live in the default `public` schema and are accessed from Edge
-- Functions via the service-role connection. No Row-Level Security is needed
-- for this single-user app since the Postgres role is not exposed publicly.

create table if not exists weight_entries (
    date      date primary key,
    kg        numeric(5, 2) not null,
    source    text          not null default 'manual',
    note      text,
    created_at timestamptz  not null default now()
);

-- Raw HAE sleep segments (Core/REM/Deep/Awake rows). One per segment.
create table if not exists sleep_segments (
    id         bigserial primary key,
    start_ts   timestamptz not null,
    end_ts     timestamptz not null,
    stage      text        not null check (stage in ('Core','REM','Deep','Awake','InBed')),
    hours      numeric(6, 4) not null,
    source     text,
    unique (start_ts, stage)
);
create index if not exists sleep_segments_end_ts_idx on sleep_segments (end_ts);

-- Derived nightly rollup, keyed by wake date. Rebuilt after each ingest.
create table if not exists sleep_nights (
    date       date primary key,
    total_hrs  numeric(5, 2) not null,
    deep_hrs   numeric(5, 2) not null default 0,
    rem_hrs    numeric(5, 2) not null default 0,
    core_hrs   numeric(5, 2) not null default 0,
    awake_hrs  numeric(5, 2) not null default 0,
    bedtime    timestamptz,
    wake_time  timestamptz
);

create table if not exists activity_daily (
    date          date primary key,
    steps         integer,
    active_kcal   numeric(7, 1),
    exercise_min  integer,
    dietary_kcal  numeric(7, 1)
);

create table if not exists recovery_daily (
    date        date primary key,
    resting_hr  numeric(5, 1),
    hrv_ms      numeric(6, 2)
);

create table if not exists body_composition (
    date           date primary key,
    body_fat_pct   numeric(4, 1),
    lean_mass_kg   numeric(5, 2)
);

create table if not exists experiments (
    id         bigserial primary key,
    label      text not null,
    start_date date not null,
    end_date   date,
    note       text,
    created_at timestamptz not null default now()
);
create index if not exists experiments_start_idx on experiments (start_date);

create table if not exists user_settings (
    id            integer primary key default 1 check (id = 1),
    height_cm     numeric(5, 1) not null,
    goal_kg_low   numeric(4, 1) not null,
    goal_kg_high  numeric(4, 1) not null,
    birthdate     date
);
