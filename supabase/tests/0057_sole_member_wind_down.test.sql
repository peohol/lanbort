begin;

select plan(5);

-- PS-ENV-012: an owner who is the only member winds the environment down
-- for good at once; anyone else's active or passive membership keeps the
-- cancellation period.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a3', 'active', now());

insert into app.environments (id, type, name, created_by_user_id) values
  ('00000000-0000-4000-8000-0000000000e1', 'closed', 'Borettslaget',
    '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e2', 'closed', 'Vellet',
    '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e3', 'closed', 'Hytta',
    '00000000-0000-4000-8000-0000000000a1');

insert into app.environment_memberships (
  id, environment_id, user_id, state, origin, activated_at, activation_revision
) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a1', 'active', 'founder', now(), 0),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a2', 'active', 'self_service', now(), 0),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000e2',
    '00000000-0000-4000-8000-0000000000a1', 'active', 'founder', now(), 0),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000e3',
    '00000000-0000-4000-8000-0000000000a1', 'active', 'founder', now(), 0);

-- Someone who left, and someone who has only applied, are not members.
insert into app.environment_memberships (
  environment_id, user_id, state, origin, activated_at, activation_revision,
  ended_at, end_reason
) values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a2',
  'ended', 'self_service', now(), 0, now(), 'left');
insert into app.environment_memberships (environment_id, user_id, state, origin, review_stage)
values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a3',
  'pending', 'application', 'submitted');

select throws_ok(
  $$
    insert into app.environment_wind_downs
      (environment_id, reason, started_by_user_id, started_at, final_at)
    values ('00000000-0000-4000-8000-0000000000e1', 'voluntary',
      '00000000-0000-4000-8000-0000000000a1', now(), now())
  $$,
  '23514',
  null,
  'another active member keeps the cancellation period'
);

update app.environment_memberships
set state = 'passive', passive_reason = 'requirements_not_met', passive_since = now()
where id = '00000000-0000-4000-8000-0000000000d2';

select throws_ok(
  $$
    insert into app.environment_wind_downs
      (environment_id, reason, started_by_user_id, started_at, final_at)
    values ('00000000-0000-4000-8000-0000000000e1', 'voluntary',
      '00000000-0000-4000-8000-0000000000a1', now(), now())
  $$,
  '23514',
  null,
  'so does a passive member'
);

select lives_ok(
  $$
    insert into app.environment_wind_downs
      (environment_id, reason, started_by_user_id, started_at, final_at)
    values ('00000000-0000-4000-8000-0000000000e1', 'voluntary',
      '00000000-0000-4000-8000-0000000000a1', now(), now() + interval '7 days')
  $$,
  'with the cancellation period, the owner winds down as before'
);

select lives_ok(
  $$
    insert into app.environment_wind_downs
      (environment_id, reason, started_by_user_id, started_at, final_at)
    values ('00000000-0000-4000-8000-0000000000e2', 'voluntary',
      '00000000-0000-4000-8000-0000000000a1', now(), now())
  $$,
  'the only member winds down at once, past former members and applicants'
);

select lives_ok(
  $$
    insert into app.environment_wind_downs (environment_id, reason, started_at, final_at)
    values ('00000000-0000-4000-8000-0000000000e3', 'ownerless', now(), now())
  $$,
  'an ownerless wind-down is final at once, as before'
);

select * from finish();
rollback;
