#!/usr/bin/env bash
# Writes .env for the running local Supabase stack (`pnpm db:start` first).
#
# Starts from .env.example and fills in the values the local stack generates,
# so no key, not even a public local one, is committed to the repository.
# Variables already exported in the shell (as in CI) are written as they are.
set -euo pipefail

cd "$(dirname "$0")/../.."

status="$(pnpm --silent exec supabase status -o env)"
value_of() {
  sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" <<< "$status"
}

publishable_key="$(value_of PUBLISHABLE_KEY)"
if [[ -z "$publishable_key" ]]; then
  echo "Could not read the local Supabase keys. Is the stack running (pnpm db:start)?" >&2
  exit 1
fi

sed \
  -e "s|^SUPABASE_URL=.*|SUPABASE_URL=$(value_of API_URL)|" \
  -e "s|^SUPABASE_PUBLISHABLE_KEY=.*|SUPABASE_PUBLISHABLE_KEY=${publishable_key}|" \
  -e "s|^SUPABASE_SECRET_KEY=.*|SUPABASE_SECRET_KEY=$(value_of SECRET_KEY)|" \
  -e "s|^MAILPIT_URL=.*|MAILPIT_URL=$(value_of MAILPIT_URL)|" \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=$(value_of DB_URL | sed 's|//[^@]*@|//lanbort_app:lanbort_app@|')|" \
  -e "s|^ADMIN_DATABASE_URL=.*|ADMIN_DATABASE_URL=$(value_of DB_URL)|" \
  .env.example > .env

ADMIN_DATABASE_URL="$(value_of DB_URL)" scripts/dev/app-role-login.sh

echo "Wrote .env for the local Supabase stack."
