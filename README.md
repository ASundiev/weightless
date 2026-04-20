# Weightless

Personal weight-loss tracker that **extends** Apple Health rather than
redrawing it. A small server ingests daily exports from [Health Auto
Export] (HAE) and exposes them to Claude via a remote MCP connector, so
you get coaching through your existing **Claude Pro** subscription — no
Anthropic API bill.

Three free tiers only: **GitHub** (source + static hosting on Pages),
**Deno Deploy** (runs the server), and **Neon** (Postgres).

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
              Deno Deploy (server/main.ts)
                ├─ /ingest  parses HAE → Postgres
                ├─ /api     JSON-RPC for the SPA
                └─ /mcp     Streamable HTTP MCP for Claude.ai
                            │
                    Neon Postgres  ◀── GH Action (db/migrate.ts)
                            ▲
                            │ fetch
                   SPA (Vite + React, GitHub Pages)
                            ▲
                            │ custom connector (MCP)
                     Claude.ai (Pro)
```

- **Frontend**: Vite + React SPA hosted on GitHub Pages.
- **Server**: single Deno Deploy project; `server/main.ts` routes `/ingest`,
  `/api`, `/mcp` to separate handlers.
- **DB**: Neon Postgres. Migrations in `db/migrations/`, applied by
  `db/migrate.ts` (run by GitHub Actions or manually).
- **Auth**: one bearer token (`WEIGHTLESS_TOKEN`), shared by the SPA, the
  Mac watcher, and Claude's MCP connector.

The **same tool implementations** power both `/api` (browser) and `/mcp`
(Claude) — see `server/_shared/tools.ts`.

## Health Auto Export metrics to enable

Configure HAE on iPhone to export these to iCloud Drive → `Weightless/`:

- `sleep_analysis` (stage-segmented Core/REM/Deep/Awake — rolled up into nights)
- `weight_body_mass`
- `step_count`
- `active_energy`
- `apple_exercise_time`
- `resting_heart_rate`
- `heart_rate_variability`
- `body_fat_percentage` (if your scale supports it)
- `lean_body_mass` (if your scale supports it)
- `dietary_energy` (optional)

Aggregate = **daily**, format = **JSON**, automation = **hourly**.

## First-time setup

### 1. Neon (Postgres)

1. Create a free Neon project (pick the region closest to you).
2. Copy the **pooled** connection string (hostname contains `-pooler`).
3. Run migrations locally:

   ```sh
   export DATABASE_URL='postgresql://…?sslmode=require'
   deno run --allow-net --allow-env --allow-read db/migrate.ts
   ```

   This applies `0001_init.sql` + `0002_seed.sql` (seeds `user_settings`
   and your two starting weigh-ins: 80.2 kg on 5 Apr and 78.3 kg on 19 Apr).

### 2. Deno Deploy (server)

1. Install the CLI: `deno install -gArf jsr:@deno/deployctl`.
2. Create a project (e.g. `weightless`) at <https://dash.deno.com>.
3. In the project's **Settings → Environment Variables**, set:
   - `DATABASE_URL` — the Neon pooled string from step 1
   - `WEIGHTLESS_TOKEN` — a random secret (e.g. `openssl rand -hex 24`)
4. First manual deploy:

   ```sh
   deployctl deploy --project=weightless --entrypoint=server/main.ts .
   ```

   Note the URL Deno Deploy prints — e.g. `https://weightless.deno.dev`.

### 3. GitHub Pages + Actions

Enable Pages in **Settings → Pages → GitHub Actions**. Add repo secrets
(Settings → Secrets and variables → Actions):

| Secret                  | Value                                                |
| ----------------------- | ---------------------------------------------------- |
| `VITE_FUNCTIONS_URL`    | Deno Deploy URL, e.g. `https://weightless.deno.dev`  |
| `DENO_DEPLOY_PROJECT`   | Your Deno Deploy project name                        |
| `DATABASE_URL`          | Neon pooled connection string                        |

In **Deno Deploy → project → Settings → GitHub integration**, link the
repo — this grants the Actions workflow permission to push deploys via
OIDC (no token needed).

Push to `main`. Three workflows run:

- `deploy-pages.yml` — builds the SPA and publishes to GitHub Pages.
- `deploy-deno.yml` — deploys `server/main.ts` to Deno Deploy.
- `db-push.yml` — applies any new migrations against Neon.

### 4. Mac sync watcher

```sh
cp .env.example .env
# Edit .env:
#   HAE_WATCH_DIR=/Users/you/Library/Mobile Documents/iCloud~…/Documents/Weightless
#   FUNCTIONS_URL=https://weightless.deno.dev
#   WEIGHTLESS_TOKEN=<same token you set in Deno Deploy>
pnpm install
pnpm sync        # verify it picks up a file and POSTs successfully
```

Then install as a launchd service:

```sh
cp scripts/com.weightless.sync.plist ~/Library/LaunchAgents/
# edit plist — replace /ABSOLUTE/PATH/TO/weightless with repo path
launchctl load ~/Library/LaunchAgents/com.weightless.sync.plist
```

### 5. Add the Claude connector

Claude.ai → **Settings → Connectors → Add custom connector**.

- URL: `https://weightless.deno.dev/mcp`
- Authentication: Bearer token = your `WEIGHTLESS_TOKEN`

Create a Project called **Weightless Coach** with this system prompt:

> I'm 39, 176 cm, new father, goal 74–75 kg. Use the Weightless MCP tools
> for all data — never guess numbers. Keep advice concise and actionable.
> On request, do a weekly review (`weekly_digest` + `get_correlation` for
> sleep vs weight + `detect_plateau`) and return three bullet points I can
> act on this week.

### 6. Verify end-to-end

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
shared/                 # pure-TS libs (used by SPA and server)
server/                 # Deno Deploy server
  main.ts               # router (entrypoint)
  ingest.ts api.ts mcp.ts
  _shared/              # db + auth + tools
db/                     # migrations + migration runner
scripts/sync.ts         # macOS iCloud-folder watcher
.github/workflows/      # pages, deno deploy, db migrations
```

## Local dev

```sh
pnpm install
pnpm dev                # SPA at http://localhost:5173 (needs VITE_FUNCTIONS_URL)

# Server (in a second terminal):
cd server
deno task dev           # runs main.ts locally on http://localhost:8000

# Point the SPA at the local server:
#   VITE_FUNCTIONS_URL=http://localhost:8000 pnpm dev
```

[Health Auto Export]: https://apps.apple.com/app/health-auto-export/id1115567069
