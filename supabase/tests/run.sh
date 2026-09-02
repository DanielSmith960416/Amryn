#!/usr/bin/env bash
# Rebuild the test database from scratch and apply every migration, then run
# the RLS test suite. Requires a local PostgreSQL 16 reachable via PGHOST/PGPORT.
set -euo pipefail

HOST="${PGHOST:-/var/tmp}"
PORT="${PGPORT:-55432}"
USER="${PGUSER:-postgres}"
DB="${PGDATABASE:-amryn_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

psql_run() { psql -h "$HOST" -p "$PORT" -U "$USER" -v ON_ERROR_STOP=1 -q "$@"; }

psql_run -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
psql_run -d "$DB" -f "$ROOT/supabase/tests/00_supabase_shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '  applying %s\n' "$(basename "$f")"
  psql_run -d "$DB" -f "$f"
done

for f in "$ROOT"/supabase/tests/[1-9]*.sql; do
  [ -e "$f" ] || continue
  printf '  running  %s\n' "$(basename "$f")"
  psql_run -d "$DB" -f "$f"
done

echo "schema and policy tests passed"
