#!/usr/bin/env bash
# Lets the server's own database role (lanbort_app, least privilege) log in
# to the local Supabase stack with the local password in .env.example. The
# role itself comes from the migrations; hosted environments set their own
# login and password, never this one.
set -euo pipefail

cd "$(dirname "$0")/../.."

admin_url="${ADMIN_DATABASE_URL:-$(pnpm --silent exec supabase status -o env | sed -n 's/^DB_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p')}"
psql "$admin_url" --quiet --no-psqlrc --set ON_ERROR_STOP=1 \
  --command "alter role lanbort_app login password 'lanbort_app'"
