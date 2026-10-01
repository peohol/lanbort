-- Phase 1 foundation: append-only events, transactional outbox and idempotent
-- commands (ADR-0004, PS-DOM-006, PS-NFR-005, PS-NFR-009).
--
-- All tables live in the private `app` schema. The Phase 0 default privileges
-- already keep anon, authenticated and service_role out of them.

-- Shared guard for append-only tables. It fires for every role, including the
-- table owner, so ordinary product code cannot rewrite history.
create function app.reject_append_only_mutation()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  raise exception '% is not allowed on append-only table %.%',
    tg_op, tg_table_schema, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

revoke execute on function app.reject_append_only_mutation() from public;

-- Domain and audit events. A correction is always a new event (PS-DOM-006).
create table app.audit_events (
  id uuid primary key default gen_random_uuid(),
  -- Global, gap-tolerant ordering. occurred_at alone is not unique.
  position bigint generated always as identity unique,
  occurred_at timestamptz not null default clock_timestamp(),
  kind text not null check (kind in ('domain', 'audit')),
  event_type text not null
    check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  event_version smallint not null check (event_version > 0),
  actor_type text not null check (actor_type in ('user', 'system')),
  actor_user_id uuid,
  actor_process text check (actor_process ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  resource_type text not null check (resource_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  resource_id text not null check (resource_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  correlation_id text check (correlation_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  causation_event_id uuid references app.audit_events (id),
  -- Minimal structured data only. Each event type has a strict schema in
  -- @lanbort/domain; the size cap is a backstop against copying content in.
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 4096),
  constraint audit_events_actor_shape check (
    (actor_type = 'user' and actor_user_id is not null and actor_process is null)
    or (actor_type = 'system' and actor_user_id is null and actor_process is not null)
  )
);

comment on table app.audit_events is
  'Append-only domain and audit events. Rows are never updated or deleted by product operations.';

create index audit_events_resource_idx
  on app.audit_events (resource_type, resource_id, position);

create index audit_events_actor_user_idx
  on app.audit_events (actor_user_id, position)
  where actor_user_id is not null;

create trigger audit_events_append_only
  before update or delete on app.audit_events
  for each row execute function app.reject_append_only_mutation();

create trigger audit_events_no_truncate
  before truncate on app.audit_events
  for each statement execute function app.reject_append_only_mutation();

-- Transactional outbox: one row per (event, consumer), written in the same
-- transaction as the event. Each consumer is retried independently, so a
-- failing side effect never rolls back the domain change or another consumer.
create table app.outbox_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app.audit_events (id),
  consumer text not null check (consumer ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  -- When the message may next be claimed. While a worker holds a lease this is
  -- the lease expiry, so a crashed worker's message becomes claimable again.
  available_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  -- Machine-readable error code only, never free text or payload data.
  last_error text check (last_error ~ '^[a-z0-9_.:-]{1,64}$'),
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  constraint outbox_messages_event_consumer_key unique (event_id, consumer),
  constraint outbox_messages_finished_shape check (
    (status = 'pending' and finished_at is null)
    or (status <> 'pending' and finished_at is not null and lease_token is null)
  )
);

comment on table app.outbox_messages is
  'Transactional outbox. Delivery state is mutable; the referenced event is not.';

create index outbox_messages_ready_idx
  on app.outbox_messages (available_at, id)
  where status = 'pending';

-- Stored results of idempotent commands. The key is namespaced by the acting
-- principal and the command, so a key can never return another actor's result.
create table app.idempotency_records (
  scope text not null check (scope ~ '^(user|system):[A-Za-z0-9_.:-]{1,128}$'),
  command text not null
    check (command ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  idempotency_key text not null
    check (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (scope, command, idempotency_key)
);

comment on table app.idempotency_records is
  'Results of completed idempotent commands, scoped to actor and command.';
