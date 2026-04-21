#!/usr/bin/env bash
# Idempotent migration runner. Applies db/migrations/*.sql in filename order,
# skipping any already recorded in the _migrations table. Uses psql directly
# so we don't depend on Deno's Node-TLS shim (which disconnects against Neon
# from GitHub Actions).
#
# Requires: DATABASE_URL env var, psql on PATH.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q -A -t)

"${PSQL[@]}" -c "create table if not exists _migrations (
    name        text        primary key,
    applied_at  timestamptz not null default now()
)" >/dev/null

applied=$("${PSQL[@]}" -c "select name from _migrations")

dir="$(cd "$(dirname "$0")" && pwd)/migrations"

shopt -s nullglob
files=("$dir"/*.sql)
shopt -u nullglob

IFS=$'\n' files=($(printf '%s\n' "${files[@]}" | sort))
unset IFS

for path in "${files[@]}"; do
    name="$(basename "$path")"
    if grep -Fxq "$name" <<<"$applied"; then
        echo "skip  $name"
        continue
    fi
    echo "apply $name"
    "${PSQL[@]}" -f "$path" >/dev/null
    "${PSQL[@]}" -c "insert into _migrations (name) values ('$name')" >/dev/null
done

echo "migrations up to date"
