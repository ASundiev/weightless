-- Baseline settings and the two weigh-ins we already have.
insert into user_settings (id, height_cm, goal_kg_low, goal_kg_high, birthdate)
values (1, 176, 74, 75, '1986-01-01')
on conflict (id) do update set
    height_cm    = excluded.height_cm,
    goal_kg_low  = excluded.goal_kg_low,
    goal_kg_high = excluded.goal_kg_high;

insert into weight_entries (date, kg, source, note) values
    ('2026-04-05', 80.2, 'manual', 'starting weight'),
    ('2026-04-19', 78.3, 'manual', 'two-week check-in')
on conflict (date) do nothing;
