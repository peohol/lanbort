begin;

select plan(20);

-- WP-43, ADR-0010: the database is only the delivery service for
-- end-to-end encrypted chat. It holds public keys, signatures, MLS
-- ciphertext and delivery metadata, keeps key material from changing
-- behind the devices' backs, and gives the browser no direct access.

select is_empty(
  $$
    select role_name || ' ' || c.relname
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    cross join unnest(array['anon', 'authenticated']) as role_name
    where n.nspname = 'app' and c.relname like 'chat\_%' and c.relkind = 'r'
      and (
        has_table_privilege(role_name, c.oid, 'SELECT')
        or has_table_privilege(role_name, c.oid, 'INSERT')
        or has_table_privilege(role_name, c.oid, 'UPDATE')
        or has_table_privilege(role_name, c.oid, 'DELETE')
      )
  $$,
  'the browser roles cannot read or write any chat table'
);

select ok(
  not has_function_privilege('authenticated', 'app.end_auth_sessions(text[])', 'EXECUTE')
    and not has_function_privilege('anon', 'app.end_auth_sessions(text[])', 'EXECUTE'),
  'only the server can end sign-in sessions'
);

-- A tripwire: a column that could hold a readable message, a private key or
-- who-read-what changes this test on purpose, together with ADR-0010.
select set_eq(
  $$
    select c.relname || '.' || a.attname
    from pg_attribute as a
    join pg_class as c on c.oid = a.attrelid
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relname in ('chat_messages', 'chat_deliveries')
      and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
  $$,
  array[
    'chat_messages.id', 'chat_messages.conversation_id', 'chat_messages.generation',
    'chat_messages.epoch', 'chat_messages.content_type',
    'chat_messages.ciphertext', 'chat_messages.created_at',
    'chat_deliveries.device_id', 'chat_deliveries.message_id'
  ],
  'messages are ciphertext and delivery metadata: no sender, no read state'
);

-- Anna (a1) and Bo (b1) are active; Dag (d1) is deactivated.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000d1', 'deactivated', now());

insert into app.chat_account_keys (id, user_id, public_key) values
  ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000a1',
    decode(repeat('a1', 32), 'hex'));

select throws_ok(
  $$ insert into app.chat_account_keys (user_id, public_key)
     values ('00000000-0000-4000-8000-0000000000a1', decode(repeat('a2', 32), 'hex')) $$,
  '23505',
  null,
  'an account has one current account key'
);

select throws_ok(
  $$ insert into app.chat_account_keys (user_id, public_key)
     values ('00000000-0000-4000-8000-0000000000d1', decode(repeat('d1', 32), 'hex')) $$,
  '23001',
  null,
  'an account that takes no new activity gets no chat key'
);

insert into app.chat_devices
  (id, user_id, account_key_id, session_id, device_key, certificate_signature)
values
  ('00000000-0000-4000-8000-0000000d0a11', '00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-00000000c0a1', 'session-a1-phone',
    decode(repeat('11', 32), 'hex'), decode(repeat('11', 64), 'hex'));

select throws_ok(
  $$ insert into app.chat_devices
       (id, user_id, account_key_id, session_id, device_key, certificate_signature)
     values ('00000000-0000-4000-8000-0000000d0a12', '00000000-0000-4000-8000-0000000000a1',
       '00000000-0000-4000-8000-00000000c0a1', 'session-a1-phone',
       decode(repeat('12', 32), 'hex'), decode(repeat('12', 64), 'hex')) $$,
  '23505',
  null,
  'a sign-in session has one live device'
);

select throws_ok(
  $$ insert into app.chat_devices
       (id, user_id, account_key_id, session_id, device_key, certificate_signature)
     values ('00000000-0000-4000-8000-0000000d0b11', '00000000-0000-4000-8000-0000000000b1',
       '00000000-0000-4000-8000-00000000c0a1', 'session-b1',
       decode(repeat('13', 32), 'hex'), decode(repeat('13', 64), 'hex')) $$,
  '23503',
  null,
  'a device belongs to the account whose key certified it'
);

select throws_ok(
  $$ update app.chat_devices set device_key = decode(repeat('ff', 32), 'hex')
     where id = '00000000-0000-4000-8000-0000000d0a11' $$,
  '23001',
  null,
  'a device''s key never changes'
);

update app.chat_devices
set revoked_at = clock_timestamp(), revocation_signature = decode(repeat('ee', 64), 'hex')
where id = '00000000-0000-4000-8000-0000000d0a11';

select throws_ok(
  $$ update app.chat_devices set revoked_at = null
     where id = '00000000-0000-4000-8000-0000000d0a11' $$,
  '23001',
  null,
  'a revoked device stays revoked'
);

select lives_ok(
  $$ insert into app.chat_devices
       (id, user_id, account_key_id, session_id, device_key, certificate_signature)
     values ('00000000-0000-4000-8000-0000000d0a12', '00000000-0000-4000-8000-0000000000a1',
       '00000000-0000-4000-8000-00000000c0a1', 'session-a1-phone',
       decode(repeat('12', 32), 'hex'), decode(repeat('12', 64), 'hex')) $$,
  'the session gets a new device once the old one is revoked'
);

update app.chat_account_keys set replaced_at = clock_timestamp()
where id = '00000000-0000-4000-8000-00000000c0a1';

select throws_ok(
  $$ insert into app.chat_devices
       (id, user_id, account_key_id, session_id, device_key, certificate_signature)
     values ('00000000-0000-4000-8000-0000000d0a13', '00000000-0000-4000-8000-0000000000a1',
       '00000000-0000-4000-8000-00000000c0a1', 'session-a1-laptop',
       decode(repeat('14', 32), 'hex'), decode(repeat('14', 64), 'hex')) $$,
  '23001',
  null,
  'a replaced account key certifies no new device'
);

select throws_ok(
  $$ update app.chat_account_keys set replaced_at = null
     where id = '00000000-0000-4000-8000-00000000c0a1' $$,
  '23001',
  null,
  'a replaced account key stays replaced'
);

select throws_ok(
  $$ insert into app.chat_link_requests
       (user_id, session_id, device_id, device_key, link_key, expires_at, package)
     values ('00000000-0000-4000-8000-0000000000a1', 'session-a1-tablet', gen_random_uuid(),
       decode(repeat('15', 32), 'hex'), decode(repeat('16', 32), 'hex'),
       now() + interval '10 minutes', '\x01') $$,
  '23514',
  null,
  'a link request carries a package only once approved'
);

-- One private conversation per pair, its participants in uuid order.
insert into app.chat_conversations (id, kind, user_low_id, user_high_id, opened_via, created_by_user_id)
values ('00000000-0000-4000-8000-00000000cc01', 'private',
  '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1',
  'friendship', '00000000-0000-4000-8000-0000000000a1');

select throws_ok(
  $$ insert into app.chat_conversations (kind, user_low_id, user_high_id, opened_via, created_by_user_id)
     values ('private', '00000000-0000-4000-8000-0000000000a1',
       '00000000-0000-4000-8000-0000000000b1', 'friendship',
       '00000000-0000-4000-8000-0000000000b1') $$,
  '23505',
  null,
  'a pair has one private conversation'
);

select throws_ok(
  $$ insert into app.chat_conversations (kind, user_low_id, user_high_id, opened_via, created_by_user_id)
     values ('private', '00000000-0000-4000-8000-0000000000b1',
       '00000000-0000-4000-8000-0000000000a1', 'friendship',
       '00000000-0000-4000-8000-0000000000b1') $$,
  '23514',
  null,
  'the pair is stored in one order only'
);

select throws_ok(
  $$ insert into app.chat_conversations (kind, user_low_id, user_high_id, opened_via, created_by_user_id)
     values ('private', '00000000-0000-4000-8000-0000000000a1',
       '00000000-0000-4000-8000-0000000000d1', 'friendship',
       '00000000-0000-4000-8000-0000000000a1') $$,
  '23001',
  null,
  'no new conversation with an account that takes no new activity'
);

insert into app.chat_messages (conversation_id, generation, epoch, content_type, ciphertext)
values ('00000000-0000-4000-8000-00000000cc01', 1, 0, 'application', '\x0102');
insert into app.chat_deliveries (device_id, message_id)
select '00000000-0000-4000-8000-0000000d0a12', id from app.chat_messages
where conversation_id = '00000000-0000-4000-8000-00000000cc01';

select throws_ok(
  $$ update app.chat_messages set ciphertext = '\x03'
     where conversation_id = '00000000-0000-4000-8000-00000000cc01' $$,
  '23001',
  null,
  'ciphertext is never changed'
);

delete from app.chat_devices where id = '00000000-0000-4000-8000-0000000d0a12';

select is_empty(
  $$ select 1 from app.chat_deliveries
     where device_id = '00000000-0000-4000-8000-0000000d0a12' $$,
  'a deleted device has nothing waiting for it'
);

-- Ending sign-in sessions reaches only the sessions named.
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000f1');
insert into auth.sessions (id, user_id) values
  ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-0000000000f1'),
  ('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-0000000000f1');

select is(
  app.end_auth_sessions(array['00000000-0000-4000-8000-00000000f001', 'not-a-session']),
  1,
  'a revoked device''s session ends'
);

select results_eq(
  $$ select id::text from auth.sessions where user_id = '00000000-0000-4000-8000-0000000000f1' $$,
  array['00000000-0000-4000-8000-00000000f002'],
  'other sessions are left alone'
);

select * from finish();
rollback;
