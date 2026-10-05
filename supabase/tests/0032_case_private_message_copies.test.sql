begin;

select plan(10);

-- WP-46 (PS-COM-013): copies of private messages a party submitted with a
-- case entry. Bo (b1) writes to the administrators of the environment (e1)
-- Anna (a1) founded, and submits what Anna wrote to him in private.
select ok(
  not has_table_privilege(role_name, 'app.case_entry_private_messages', 'SELECT'),
  format('%s cannot read the submitted copies', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now());
insert into app.environments (id, type, name, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000e1', 'open', 'Borettslaget',
  '00000000-0000-4000-8000-0000000000a1');
insert into app.environment_memberships (
  id, environment_id, user_id, state, origin, activated_at, activation_revision
) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a1', 'active', 'founder', now(), 0),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000b1', 'active', 'self_service', now(), 0);
insert into app.environment_role_grants (environment_id, user_id, role, granted_by_user_id)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
    'owner', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
    'administrator', '00000000-0000-4000-8000-0000000000a1');

insert into app.cases (id, kind, environment_id, opened_by_user_id, opened_at)
values ('00000000-0000-4000-8000-000000000601', 'environment_contact',
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', now());
insert into app.case_participants (case_id, user_id, role, may_write, joined_at)
values ('00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-0000000000b1', 'requester', true, now());

create function pg_temp.write(id uuid, author uuid, capacity text)
returns void
language sql
as $$
  insert into app.case_entries (id, case_id, author_user_id, capacity, audience, body, created_at)
  values (id, '00000000-0000-4000-8000-000000000601', author, capacity, 'parties',
    'Forklaring', now());
$$;

create function pg_temp.copy(entry uuid, ordinal int, sender uuid, sent_at timestamptz)
returns void
language sql
as $$
  insert into app.case_entry_private_messages (
    entry_id, ordinal, conversation_id, message_id, sender_user_id, sent_at, body
  ) values (entry, ordinal, '00000000-0000-4000-8000-000000000701',
    gen_random_uuid(), sender, sent_at, 'Du får den ikke tilbake.');
$$;

select pg_temp.write('00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-0000000000b1', 'party');

select lives_ok(
  $$ select pg_temp.copy('00000000-0000-4000-8000-000000000801', 1,
       '00000000-0000-4000-8000-0000000000a1', now() - interval '1 hour') $$,
  'a participant submits a copy with what they write'
);

select throws_ok(
  $$ select pg_temp.copy('00000000-0000-4000-8000-000000000801', 2,
       '00000000-0000-4000-8000-0000000000a1', now() + interval '1 minute') $$,
  '23001',
  null,
  'no message was sent after the entry'
);

select throws_ok(
  $$ select pg_temp.copy('00000000-0000-4000-8000-000000000801', 2,
       gen_random_uuid(), now() - interval '1 hour') $$,
  '23503',
  null,
  'every sender has an account'
);

select throws_ok(
  $$ select pg_temp.copy('00000000-0000-4000-8000-000000000801', 51,
       '00000000-0000-4000-8000-0000000000a1', now() - interval '1 hour') $$,
  '23514',
  null,
  'an entry carries at most 50 messages'
);

select throws_ok(
  $$ update app.case_entry_private_messages set body = 'Endret' $$,
  null,
  null,
  'a copy is never rewritten'
);

select throws_ok(
  $$ delete from app.case_entry_private_messages $$,
  null,
  null,
  'a copy is never removed'
);

-- Anna answers as handler: her entry carries no copy, and Bo's entry,
-- no longer the latest, gets nothing added.
select pg_temp.write('00000000-0000-4000-8000-000000000802',
  '00000000-0000-4000-8000-0000000000a1', 'handler');

select throws_ok(
  $$ select pg_temp.copy('00000000-0000-4000-8000-000000000802', 1,
       '00000000-0000-4000-8000-0000000000a1', now()) $$,
  '23001',
  null,
  'a handler never submits private messages'
);

select throws_ok(
  $$ select pg_temp.copy('00000000-0000-4000-8000-000000000801', 2,
       '00000000-0000-4000-8000-0000000000a1', now() - interval '1 hour') $$,
  '23001',
  null,
  'nothing is added to an entry once the case has gone on'
);

select * from finish();
rollback;
