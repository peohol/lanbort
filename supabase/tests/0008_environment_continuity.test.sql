begin;

select plan(20);

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array[
    'app.environment_role_invitations',
    'app.environment_ownership_vacancies',
    'app.environment_ownership_claims',
    'app.environment_wind_downs'
  ]) as table_name;

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b2', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b3', 'active', now());

insert into app.environments (id, type, name, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000e1', 'hidden', 'Borettslaget',
  '00000000-0000-4000-8000-0000000000b1');

insert into app.environment_role_grants (environment_id, user_id, role, granted_by_user_id)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 'owner',
   '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 'administrator',
   '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b2', 'administrator',
   '00000000-0000-4000-8000-0000000000b1');

-- The continuity invariant is checked at commit; checking it after every
-- statement here shows each violation on its own.
set constraints all immediate;

select throws_ok(
  $$
    update app.environment_role_grants
    set revoked_at = now(), revoked_by_user_id = user_id, revoke_reason = 'resigned'
    where user_id = '00000000-0000-4000-8000-0000000000b1' and role = 'administrator'
  $$,
  '23514',
  null,
  'the owner must also be administrator (PS-ENV-003)'
);

select throws_ok(
  $$
    update app.environment_role_grants
    set revoked_at = now(), revoked_by_user_id = user_id, revoke_reason = 'transferred'
    where role = 'owner'
  $$,
  '23514',
  null,
  'an active environment cannot be left without owner outside a vacancy'
);

select throws_ok(
  $$
    insert into app.environment_role_grants (environment_id, user_id, role, granted_by_user_id)
    values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b2',
      'owner', '00000000-0000-4000-8000-0000000000b1')
  $$,
  '23505',
  null,
  'an environment has at most one owner'
);

select throws_ok(
  $$
    insert into app.environment_ownership_vacancies
      (environment_id, former_owner_user_id, claim_deadline)
    values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1',
      now() + interval '7 days')
  $$,
  '23514',
  null,
  'a vacancy cannot exist while the environment has an owner'
);

select throws_ok(
  $$
    update app.environments set state = 'winding_down'
    where id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  '23514',
  null,
  'the state is winding_down only with a current wind-down'
);

select throws_ok(
  $$
    insert into app.environment_role_grants (environment_id, user_id, role, granted_by_user_id,
      revoked_at, revoked_by_user_id)
    values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b3',
      'administrator', '00000000-0000-4000-8000-0000000000b1', now(),
      '00000000-0000-4000-8000-0000000000b1')
  $$,
  '23514',
  null,
  'a revoked grant records why'
);

insert into app.environment_role_invitations (id, environment_id, user_id, role, invited_by_user_id)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000b2', 'owner', '00000000-0000-4000-8000-0000000000b1');

select throws_ok(
  $$
    insert into app.environment_role_invitations (environment_id, user_id, role, invited_by_user_id)
    values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b3',
      'owner', '00000000-0000-4000-8000-0000000000b1')
  $$,
  '23505',
  null,
  'one ownership handover at a time'
);

update app.environment_role_invitations
set closed_at = now(), outcome = 'declined',
  closed_by_user_id = '00000000-0000-4000-8000-0000000000b2'
where id = '00000000-0000-4000-8000-0000000000c1';

select throws_ok(
  $$
    update app.environment_role_invitations set outcome = 'accepted'
    where id = '00000000-0000-4000-8000-0000000000c1'
  $$,
  '23001',
  null,
  'a closed role invitation is history and cannot change'
);

-- Voluntary winding down, in its cancellation period: the row and the state
-- change together.
set constraints all deferred;
insert into app.environment_wind_downs (id, environment_id, reason, started_by_user_id, final_at)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1',
  'voluntary', '00000000-0000-4000-8000-0000000000b1', now() + interval '7 days');
update app.environments set state = 'winding_down'
where id = '00000000-0000-4000-8000-0000000000e1';
set constraints all immediate;

select is(
  (select type from app.environments where id = '00000000-0000-4000-8000-0000000000e1'),
  'hidden',
  'winding down does not change the privacy type'
);

select throws_ok(
  $$
    insert into app.environment_wind_downs (environment_id, reason, final_at)
    values ('00000000-0000-4000-8000-0000000000e1', 'ownerless', clock_timestamp())
  $$,
  '23505',
  null,
  'an environment has one current wind-down'
);

select throws_ok(
  $$
    update app.environment_wind_downs
    set settled_at = now(), outcome = 'finalized'
    where id = '00000000-0000-4000-8000-0000000000d1'
  $$,
  '23514',
  null,
  'a wind-down cannot become final before its cancellation period ends'
);

select throws_ok(
  $$ delete from app.environment_wind_downs where id = '00000000-0000-4000-8000-0000000000d1' $$,
  '23001',
  null,
  'wind-downs are never deleted'
);

select * from finish();

rollback;
