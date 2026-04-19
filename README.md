# Weightless

Personal weight-loss tracker that **extends** Apple Health rather than
redrawing it. A Supabase-backed data layer ingests daily exports from
[Health Auto Export] (HAE), and exposes them to Claude (via MCP) so you can
ask for coaching through your existing Claude Pro subscription — no API bill.

Two vendors only: **GitHub** (source + static hosting) and **Supabase**
(Postgres + Edge Functions). There is no Vercel, no Neon, no OpenAI key.

## What it does that Apple Health doesn't

- Projects a **dated ETA to your goal weight** from the last 14 days' slope
  and the implied daily kcal deficit (7700 kcal ≈ 1 kg).
- Runs **personal correlations** on _your_ data — e.g. `get_correlation(sleep_total_hrs, weight_kg, lag_days=1)`
  answers "does less sleep last night make my weight higher today?".
- Flags **plateaus** (`detect_plateau` — slope too flat for N days).
- Tags **experiments** (`tag_experiment("16:8", "2026-04-25")`) and computes
  the before/after delta on any metric (`compare_before_after`).
- Feeds **Claude Pro** a structured `weekly_digest` so Claude can write the
  coaching narrative, using the tokens you already pay for.

## Architecture

```
iPhone ──HAE JSON──▶ iCloud Drive/Weightless/
                            │ (iCloud sync)
                            ▼
                    Mac iCloud folder
                            │
                    scripts/sync.ts  (chokidar, launchd)
                            │ POST Bearer
                            ▼
    https://<project>.supabase.co/functions/v1/ingest  →  Supabase Postgres
                            ▲            ▲
                            │ fetch      │ MCP JSON-RPC
                            │            │
                        SPA (GH Pages)   Claude.ai (Pro, custom connector)
```

- **Frontend**: Vite + React SPA hosted on GitHub Pages (auto-deployed by Actions).
- **Backend**: Three Supabase Edge Functions — `ingest`, `api`, `mcp`.
- **DB**: Supabase Postgres; migrations under `supabase/migrations/`.
- **Auth**: one bearer token (`WEIGHTLESS_TOKEN`), shared between the SPA,
  the Mac watcher, and Claude's MCP connector.

The **same tool implementations** power both `/api` (browser) and `/mcp`
(Claude), so the UI and Claude can never disagree about the numbers — see
`supabase/functions/_shared/tools.ts`.

## Health Auto Export metrics to enable

Configure HAE on iPhone to export these to iCloud Drive → `Weightless/`:

- `sleep_analysis` (stage-segmented Core/REM/Deep/Awake — rolled up into nights)
- `weight_body_mass` (your manual weigh-ins)
- `step_count`
- `active_energy`
- `apple_exercise_time`
- `resting_heart_rate`
- `heart_rate_variability`
- `body_fat_percentage` (if your scale supports it)
- `lean_body_mass` (if your scale supports it)
- `dietary_energy` (optional, only if you log food)

Aggregate = **daily**, format = **JSON**, automation = **hourly**.

## First-time setup

### 1. Supabase project

```sh
pnpm install
supabase login
supabase link --project-ref <your-project-ref>
supabase db push           # applies 0001_init.sql + 0002_seed.sql
supabase secrets set WEIGHTLESS_TOKEN="$(openssl rand -hex 24)"
supabase functions deploy ingest api mcp --no-verify-jwt
```

### 2. GitHub Pages

Enable Pages in repo Settings → Pages → "GitHub Actions".
Add these repo secrets (Settings → Secrets and variables → Actions):

| Secret                   | Value                                                 |
| ------------------------ | ----------------------------------------------------- |
| `VITE_FUNCTIONS_URL`     | `https://<project>.supabase.co/functions/v1`          |
| `SUPABASE_ACCESS_TOKEN`  | Personal access token from Supabase account settings  |
| `SUPABASE_PROJECT_REF`   | Your project ref (the XXXXX in `XXXXX.supabase.co`)   |
| `SUPABASE_DB_PASSWORD`   | Your database password                                |

Push to `main`. The three workflows will deploy the SPA, the functions,
and any new migrations.

### 3. Mac sync watcher

```sh
cp .env.example .env
# Edit .env:
#   HAE_WATCH_DIR=/Users/you/Library/Mobile Documents/iCloud~…/Documents/Weightless
#   FUNCTIONS_URL=https://<project>.supabase.co/functions/v1
#   WEIGHTLESS_TOKEN=<same token you set in Supabase secrets>
pnpm sync        # verify it picks up a file and POSTs successfully
```

Then install as a launchd service:

```sh
cp scripts/com.weightless.sync.plist ~/Library/LaunchAgents/
# edit the plist — replace /ABSOLUTE/PATH/TO/weightless with the repo path
launchctl load ~/Library/LaunchAgents/com.weightless.sync.plist
```

### 4. Add the Claude connector

Claude.ai → **Settings → Connectors → Add custom connector**.

- URL: `https://<project>.supabase.co/functions/v1/mcp`
- Authentication: Bearer token = your `WEIGHTLESS_TOKEN`

Create a Project called **Weightless Coach** with this system prompt:

> I'm 39, 176 cm, new father, goal 74–75 kg. Use the Weightless MCP tools
> for all data — never guess numbers. Keep advice concise and actionable.
> On request, do a weekly review (`weekly_digest` + `get_correlation` for
> sleep vs weight + `detect_plateau`) and return three bullet points I can
> act on this week.

### 5. Verify end-to-end

In Claude:

```
list my weightless tools
```

then

```
what's my weight trend and ETA to 74.5 kg?
```

Claude should call `get_weight_trend` and `compute_goal_eta`. Sunday nights:

```
run my weekly review
```

When starting a new experiment:

```
I'm starting 16:8 today.
```

Claude will call `tag_experiment("16:8", "<today>")`. Two weeks later ask
"how's 16:8 going?" and Claude will call `compare_before_after`.

## Repo layout

```
src/                    # Vite + React SPA
shared/                 # pure-TS libs (used by SPA and Edge Functions)
supabase/migrations/    # SQL schema + seed
supabase/functions/
  _shared/              # db + auth + tools shared between functions
  ingest/               # POST HAE JSON → Postgres
  api/                  # POST {tool,args} used by the SPA
  mcp/                  # remote MCP server for Claude.ai
scripts/sync.ts         # macOS iCloud-folder watcher
.github/workflows/      # pages, functions, db migrations
```

## Local dev

```sh
pnpm install
pnpm dev                 # SPA at http://localhost:5173, set VITE_FUNCTIONS_URL in .env
supabase start           # optional: run DB + functions locally
supabase functions serve # optional: emulate edge functions
```

[Health Auto Export]: https://apps.apple.com/app/health-auto-export/id1115567069
