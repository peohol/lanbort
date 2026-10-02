begin;

select plan(11);

select has_table('app', 'platform_role_grants', 'app.platform_role_grants exists');

select ok(
  not has_table_privilege(role_name, 'app.platform_role_grants', 'SELECT'),
  format('%s cannot read platform role grants', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

insert into app.users (id) values
  ('00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000b2');

insert into app.platform_role_grants (id, user_id, role, granted_by_process, grant_reason)
values (
  '00000000-0000-4000-8000-0000000000c1',
  '00000000-0000-4000-8000-0000000000b1',
  'platform_steward',
  'ops.platform_roles',
  'Initial steward'
);

select throws_ok(
  $$
    insert into app.platform_role_grants (user_id, role, granted_by_process, grant_reason)
    values ('00000000-0000-4000-8000-0000000000b1', 'platform_steward', 'ops.platform_roles', 'Again')
  $$,
  '23505',
  null,
  'a user holds at most one active grant of a role'
);

select throws_ok(
  $$
    insert into app.platform_role_grants (user_id, role, granted_by_process, grant_reason)
    values ('00000000-0000-4000-8000-0000000000b2', 'environment_admin', 'ops.platform_roles', 'No')
  $$,
  '23514',
  null,
  'only known global roles can be granted'
);

select throws_ok(
  $$
    insert into app.platform_role_grants (user_id, role, grant_reason)
    values ('00000000-0000-4000-8000-0000000000b2', 'platform_steward', 'Nobody granted it')
  $$,
  '23514',
  null,
  'every grant names who granted it'
);

select throws_ok(
  $$
    update app.platform_role_grants
    set grant_reason = 'Rewritten'
    where id = '00000000-0000-4000-8000-0000000000c1'
  $$,
  '23001',
  null,
  'a grant cannot be rewritten'
);

select throws_ok(
  $$ delete from app.platform_role_grants where id = '00000000-0000-4000-8000-0000000000c1' $$,
  '23001',
  null,
  'a grant cannot be deleted'
);

select lives_ok(
  $$
    update app.platform_role_grants
    set revoked_at = now(), revoked_by_process = 'ops.platform_roles', revoke_reason = 'Stepped down'
    where id = '00000000-0000-4000-8000-0000000000c1'
  $$,
  'an active grant can be revoked'
);

select throws_ok(
  $$
    update app.platform_role_grants
    set revoked_at = now(), revoke_reason = 'Again'
    where id = '00000000-0000-4000-8000-0000000000c1'
  $$,
  '23001',
  null,
  'a revoked grant is fixed history'
);

select lives_ok(
  $$
    insert into app.platform_role_grants (user_id, role, granted_by_user_id, grant_reason)
    values ('00000000-0000-4000-8000-0000000000b1', 'platform_steward',
            '00000000-0000-4000-8000-0000000000b2', 'Granted again later')
  $$,
  'the role can be granted again after a revocation'
);

select * from finish();

rollback;
