#!/usr/bin/env bash
# Links the Supabase CLI to the hosted production project, the one named in
# `[remotes.production]` in supabase/config.toml. Needs SUPABASE_ACCESS_TOKEN.
# Prints the project ref.
set -euo pipefail

cd "$(dirname "$0")/../.."

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "::error::The SUPABASE_ACCESS_TOKEN secret is missing." >&2
  exit 1
fi
ref="$(sed -n '/^\[remotes\.production\]/,/^\[/s/^project_id = "\([a-z]*\)"$/\1/p' supabase/config.toml)"
if [[ -z "$ref" ]]; then
  echo "::error::No project_id under [remotes.production] in supabase/config.toml." >&2
  exit 1
fi
pnpm --silent exec supabase link --project-ref "$ref" >&2
echo "$ref"
