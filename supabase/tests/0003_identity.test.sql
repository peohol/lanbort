begin;

select plan(14);

select has_table('app', table_name, format('app.%s exists', table_name))
from unnest(array['users', 'auth_identities', 'verified_contacts', 'profiles']) as table_name;

-- Identity and profile data is only reachable through the backend.
select ok(
  not has_table_privilege(role_name, 'app.' || table_name, 'SELECT'),
  format('%s cannot read app.%s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array['users', 'profiles']) as table_name;

insert into app.users (id) values ('00000000-0000-4000-8000-0000000000a1');

select throws_ok(
  $$ update app.users set status = 'active' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514',
  null,
  'an account cannot become active without the 18+ confirmation'
);

select throws_ok(
  $$
    insert into app.profiles (user_id, real_name)
    values ('00000000-0000-4000-8000-0000000000a1', ' Kari ')
  $$,
  '23514',
  null,
  'real names are stored trimmed'
);

select throws_ok(
  $$
    insert into app.profiles (user_id, real_name)
    values ('00000000-0000-4000-8000-0000000000a1', E'Kari\nNordmann')
  $$,
  '23514',
  null,
  'real names cannot contain control characters'
);

select throws_ok(
  $$
    insert into app.verified_contacts (user_id, kind, address, verified_at)
    values ('00000000-0000-4000-8000-0000000000a1', 'email', 'Kari@Example.no', now())
  $$,
  '23514',
  null,
  'verified e-mail addresses are stored normalized'
);

insert into app.auth_identities (provider, subject, user_id)
values ('supabase', 'subject-1', '00000000-0000-4000-8000-0000000000a1');

select throws_ok(
  $$
    insert into app.users (id) values ('00000000-0000-4000-8000-0000000000a2');
    insert into app.auth_identities (provider, subject, user_id)
    values ('supabase', 'subject-1', '00000000-0000-4000-8000-0000000000a2')
  $$,
  '23505',
  null,
  'a provider identity links to exactly one internal account'
);

select throws_ok(
  $$
    insert into app.audit_events (
      kind, event_type, event_version, actor_type, actor_user_id,
      resource_type, resource_id
    ) values (
      'audit', 'test.recorded', 1, 'user', '00000000-0000-4000-8000-0000000000ff',
      'user', 'x'
    )
  $$,
  '23503',
  null,
  'user events must reference a real internal account'
);

select * from finish();

rollback;
