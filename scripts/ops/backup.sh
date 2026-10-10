#!/usr/bin/env bash
# Backup and isolated restore of a Lånbort database (WP-72, OD-0022,
# docs/implementation/backup-restore.md). Used by the GitHub workflow
# "Backup" (.github/workflows/backup.yml); also runs locally.
#
#   backup.sh dump <dir>
#       Logical dump of the linked project (`supabase link` first), or of
#       SOURCE_DB_URL when set: roles, schema, data and migration history,
#       as Supabase documents for the CLI. Writes <dir>/taken-at.
#   backup.sh restore <dir> <workdir>
#       Starts a new, empty Supabase stack in <workdir> (its own containers
#       and ports, never the repository's) and restores the dump into it the
#       way it would be restored into a new project. Prints the stack's
#       DATABASE_URL, SUPABASE_URL and SUPABASE_SECRET_KEY as env lines.
#   backup.sh stop <workdir>
#       Stops that stack and deletes its data.
#
# Output holds no data: the dump only ever goes to files.
set -euo pipefail

cd "$(dirname "$0")/../.."
umask 077

supabase() { pnpm --silent exec supabase "$@"; }

dump() {
  local dir="$1"
  local source=(--linked)
  [[ -n "${SOURCE_DB_URL:-}" ]] && source=(--db-url "$SOURCE_DB_URL")

  mkdir -p "$dir"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$dir/taken-at"
  supabase db dump "${source[@]}" -f "$dir/roles.sql" --role-only
  supabase db dump "${source[@]}" -f "$dir/schema.sql"
  # Storage's vector tables do not exist in every new project (Supabase's
  # own restore guide leaves them out too).
  supabase db dump "${source[@]}" -f "$dir/data.sql" --use-copy --data-only \
    -x storage.buckets_vectors -x storage.vector_indexes
  supabase db dump "${source[@]}" -f "$dir/history_schema.sql" --schema supabase_migrations
  supabase db dump "${source[@]}" -f "$dir/history_data.sql" --use-copy --data-only --schema supabase_migrations
}

restore_stack_id="lanbort-restore"
# The stack's name comes from SUPABASE_PROJECT_ID when it is set.
stack() { SUPABASE_PROJECT_ID="$restore_stack_id" supabase "$@"; }

restore() {
  local dir="$1" work="$2"
  local db="supabase_db_${restore_stack_id}"

  mkdir -p "$work"
  supabase init --workdir "$work" --force > /dev/null
  # Own name and ports (543xx -> 553xx), so it never touches another stack.
  sed -i \
    -e "s/^project_id = .*/project_id = \"${restore_stack_id}\"/" \
    -e 's/^\(\(port\|shadow_port\|smtp_port\|pop3_port\) = \)543/\1553/' \
    "$work/supabase/config.toml"
  stack start --workdir "$work" \
    -x realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor,mailpit > /dev/null

  # As the local superuser: a dump may grant platform settings (roles.sql)
  # that only the platform's own admin may grant.
  docker exec "$db" mkdir -p /tmp/restore
  for file in roles schema data history_schema history_data; do
    docker cp "$dir/$file.sql" "$db:/tmp/restore/$file.sql" > /dev/null
  done
  docker exec "$db" psql --quiet --single-transaction --variable ON_ERROR_STOP=1 \
    --username supabase_admin --dbname postgres \
    --file /tmp/restore/roles.sql --file /tmp/restore/schema.sql \
    --command 'SET session_replication_role = replica' \
    --file /tmp/restore/data.sql > /dev/null
  docker exec "$db" psql --quiet --single-transaction --variable ON_ERROR_STOP=1 \
    --username supabase_admin --dbname postgres \
    --file /tmp/restore/history_schema.sql --file /tmp/restore/history_data.sql > /dev/null
  docker exec "$db" rm -rf /tmp/restore

  local status
  status="$(stack status --workdir "$work" -o env)"
  value_of() { sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" <<< "$status"; }
  echo "DATABASE_URL=$(value_of DB_URL)"
  echo "SUPABASE_URL=$(value_of API_URL)"
  echo "SUPABASE_SECRET_KEY=$(value_of SECRET_KEY)"
}

stop() {
  stack stop --workdir "$1" --no-backup > /dev/null
}

usage() { sed -n '2,20s/^# \{0,1\}//p' "$0" >&2; exit 2; }

case "${1:-}:$#" in
  dump:2) dump "$2" ;;
  restore:3) restore "$2" "$3" ;;
  stop:2) stop "$2" ;;
  *) usage ;;
esac
