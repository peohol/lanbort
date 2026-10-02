begin;

select plan(19);

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array[
    'app.environments',
    'app.environment_memberships',
    'app.environment_membership_answers'
  ]) as table_name;

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b2', 'active', now());

insert into app.environments (id, type, name, created_by_user_id, requirements_revision)
values
  ('00000000-0000-4000-8000-0000000000e1', 'closed', 'Borettslaget',
   '00000000-0000-4000-8000-0000000000b1', 1),
  ('00000000-0000-4000-8000-0000000000e2', 'open', 'Borettslaget',
   '00000000-0000-4000-8000-0000000000b1', 0);

select is(
  (select count(*)::int from app.environments
    where name = 'Borettslaget' and created_by_user_id = '00000000-0000-4000-8000-0000000000b1'),
  2,
  'names are not unique (PS-ENV-002)'
);

insert into app.environment_requirements (id, environment_id, kind, text, position, introduced_in_revision)
values (
  '00000000-0000-4000-8000-0000000000d1',
  '00000000-0000-4000-8000-0000000000e1',
  'acceptance', 'Husreglene', 0, 1
);

insert into app.environment_memberships (id, environment_id, user_id, state, origin, review_stage)
values (
  '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000b2',
  'pending', 'application', 'submitted'
);

select throws_ok(
  $$
    insert into app.environment_memberships (environment_id, user_id, state, origin, activated_at, activation_revision)
    values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b2',
      'active', 'self_service', now(), 1)
  $$,
  '23505',
  null,
  'a user has at most one current membership per environment'
);

select throws_ok(
  $$
    insert into app.environment_memberships (environment_id, user_id, state, origin)
    values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000b2',
      'active', 'self_service')
  $$,
  '23514',
  null,
  'an active membership records when and under which requirements it was activated'
);

select throws_ok(
  $$
    insert into app.environment_memberships (environment_id, user_id, state, origin)
    values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000b2',
      'pending', 'invitation')
  $$,
  '23514',
  null,
  'an invitation names the administrator who sent it'
);

select throws_ok(
  $$
    update app.environment_memberships
    set state = 'passive', activated_at = now(), activation_revision = 1
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  '23514',
  null,
  'a passive membership records why and since when'
);

select throws_ok(
  $$
    insert into app.environment_membership_answers (membership_id, requirement_id, environment_id)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1',
      '00000000-0000-4000-8000-0000000000e2')
  $$,
  '23503',
  null,
  'answers only refer to requirements and memberships of one environment'
);

select lives_ok(
  $$
    insert into app.environment_membership_answers (membership_id, requirement_id, environment_id)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1',
      '00000000-0000-4000-8000-0000000000e1')
  $$,
  'an acceptance is recorded for the membership'
);

select throws_ok(
  $$
    update app.environment_requirements set text = 'Nye husregler'
    where id = '00000000-0000-4000-8000-0000000000d1'
  $$,
  '23001',
  null,
  'a requirement text is never rewritten; a changed text is a new requirement'
);

select lives_ok(
  $$
    update app.environment_requirements set retired_in_revision = 2
    where id = '00000000-0000-4000-8000-0000000000d1'
  $$,
  'a requirement can be retired'
);

select throws_ok(
  $$
    update app.environment_requirements set position = 3
    where id = '00000000-0000-4000-8000-0000000000d1'
  $$,
  '23001',
  null,
  'a retired requirement is fixed history'
);

insert into app.environment_role_grants (environment_id, user_id, role, granted_by_user_id)
values (
  '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000b1',
  'owner',
  '00000000-0000-4000-8000-0000000000b1'
);

select throws_ok(
  $$
    insert into app.environment_role_grants (environment_id, user_id, role, granted_by_user_id)
    values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b2',
      'owner', '00000000-0000-4000-8000-0000000000b1')
  $$,
  '23505',
  null,
  'an environment has at most one owner (PS-ENV-003)'
);

select throws_ok(
  $$
    update app.environment_role_grants set user_id = '00000000-0000-4000-8000-0000000000b2'
    where environment_id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  '23001',
  null,
  'a role grant is only ever revoked, never rewritten'
);

select throws_ok(
  $$ delete from app.environment_memberships where id = '00000000-0000-4000-8000-0000000000f1' $$,
  '23001',
  null,
  'membership history is not deleted'
);

select * from finish();

rollback;
