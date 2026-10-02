begin;

select plan(24);

select has_table('app', 'audit_events', 'audit events table exists');
select has_table('app', 'outbox_messages', 'outbox table exists');
select has_table('app', 'idempotency_records', 'idempotency table exists');

-- Client roles never reach the tables directly (ADR-0007).
select ok(
  not has_table_privilege(role_name, 'app.' || table_name, privilege),
  format('%s has no %s on app.%s', role_name, privilege, table_name)
)
from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
  unnest(array['audit_events', 'outbox_messages', 'idempotency_records']) as table_name,
  unnest(array['SELECT', 'INSERT']) as privilege
where role_name = 'authenticated' or privilege = 'SELECT';

insert into app.audit_events (
  id, kind, event_type, event_version, actor_type, actor_process,
  resource_type, resource_id, payload
) values (
  '00000000-0000-4000-8000-000000000001', 'audit', 'test.recorded', 1,
  'system', 'pgtap', 'test_resource', 'r-1', '{}'
);

-- Append-only: the events cannot be rewritten, even by the owner role.
select throws_ok(
  $$ update app.audit_events set payload = '{"changed": true}' $$,
  '23001',
  null,
  'audit events cannot be updated'
);

select throws_ok(
  $$ delete from app.audit_events $$,
  '23001',
  null,
  'audit events cannot be deleted'
);

select throws_ok(
  $$ truncate app.audit_events cascade $$,
  '23001',
  null,
  'audit events cannot be truncated'
);

select throws_ok(
  $$
    insert into app.audit_events (
      kind, event_type, event_version, actor_type, actor_process,
      resource_type, resource_id
    ) values ('audit', 'test.recorded', 1, 'user', 'pgtap', 'test_resource', 'r-1')
  $$,
  '23514',
  null,
  'a user event must name the acting user, not a process'
);

select throws_ok(
  $$
    insert into app.audit_events (
      kind, event_type, event_version, actor_type, actor_process,
      resource_type, resource_id, payload
    ) values (
      'audit', 'test.recorded', 1, 'system', 'pgtap', 'test_resource', 'r-1',
      jsonb_build_object('blob', repeat('x', 5000))
    )
  $$,
  '23514',
  null,
  'oversized event payloads are rejected'
);

insert into app.outbox_messages (event_id, consumer)
values ('00000000-0000-4000-8000-000000000001', 'test.consumer');

select throws_ok(
  $$
    insert into app.outbox_messages (event_id, consumer)
    values ('00000000-0000-4000-8000-000000000001', 'test.consumer')
  $$,
  '23505',
  null,
  'an event is queued at most once per consumer'
);

select throws_ok(
  $$ update app.outbox_messages set last_error = 'Free text with user content' $$,
  '23514',
  null,
  'outbox errors are machine codes, not free text'
);

insert into app.idempotency_records (scope, command, idempotency_key, request_hash, response)
values ('user:u-1', 'test.command', 'key-0123456789abcdef', repeat('a', 64), '{}');

select throws_ok(
  $$
    insert into app.idempotency_records (scope, command, idempotency_key, request_hash, response)
    values ('user:u-1', 'test.command', 'key-0123456789abcdef', repeat('b', 64), '{}')
  $$,
  '23505',
  null,
  'an idempotency key is recorded once per actor and command'
);

select lives_ok(
  $$
    insert into app.idempotency_records (scope, command, idempotency_key, request_hash, response)
    values ('user:u-2', 'test.command', 'key-0123456789abcdef', repeat('b', 64), '{}')
  $$,
  'the same key from another actor is an independent record'
);

select * from finish();

rollback;
