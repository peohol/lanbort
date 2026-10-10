begin;

select plan(14);

-- PS-ENV-021: an impartial administrator ends an active membership as a
-- local measure, on no case, and the person may still contact the
-- administrators to ask for a new assessment.
--
-- Anna (a1) owns and administers the environment (e1), Edda (a2) administers
-- it too. Bo (b1) and Cia (c1) are members; Edda has reported Cia, and that
-- report is open. Finn (f1) has never been a member.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000f1', 'active', now());

insert into app.environments (id, type, name, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000e1', 'closed', 'Borettslaget',
  '00000000-0000-4000-8000-0000000000a1');
insert into app.environment_memberships (
  id, environment_id, user_id, state, origin, activated_at, activation_revision
) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a1', 'active', 'founder', now(), 0),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a2', 'active', 'self_service', now(), 0),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000b1', 'active', 'self_service', now(), 0),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000c1', 'active', 'self_service', now(), 0);
insert into app.environment_role_grants (environment_id, user_id, role, granted_by_user_id)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
    'owner', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
    'administrator', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a2',
    'administrator', '00000000-0000-4000-8000-0000000000a1');

insert into app.cases (id, kind, environment_id, report_target, subject_user_id,
  opened_by_user_id, opened_at)
values ('00000000-0000-4000-8000-000000000501', 'environment_report',
  '00000000-0000-4000-8000-0000000000e1', 'user',
  '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a2', now());

-- The measure that ends `membership`, decided by `administrator`.
create function pg_temp.measure(membership uuid, administrator uuid)
returns void
language sql
as $$
  insert into app.moderation_actions (kind, scope, environment_id, membership_id,
    reason, decided_by_user_id, decided_at)
  values ('membership_ended', 'environment', '00000000-0000-4000-8000-0000000000e1',
    membership, 'Gjentatte brudd på husreglene.', administrator, now());
$$;

-- The measure without its effect, checked as a commit would.
create function pg_temp.measure_only()
returns void
language plpgsql
as $$
begin
  perform pg_temp.measure('00000000-0000-4000-8000-0000000000d3',
    '00000000-0000-4000-8000-0000000000a1');
  set constraints all immediate;
end;
$$;

create function pg_temp.contact(member uuid)
returns void
language sql
as $$
  insert into app.cases (kind, environment_id, opened_by_user_id, opened_at)
  values ('environment_contact', '00000000-0000-4000-8000-0000000000e1', member, now());
$$;

select throws_ok(
  $$
    insert into app.moderation_actions (case_id, kind, scope, environment_id,
      membership_id, reason, decided_by_user_id, decided_at)
    values ('00000000-0000-4000-8000-000000000501', 'membership_ended', 'environment',
      '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d3',
      'Grunn.', '00000000-0000-4000-8000-0000000000a1', now())
  $$,
  '23514', null,
  'ending a membership is a measure on no case'
);

select throws_ok(
  $$
    insert into app.moderation_actions (kind, scope, environment_id, object_id,
      reason, decided_by_user_id, decided_at)
    values ('publication_blocked', 'environment', '00000000-0000-4000-8000-0000000000e1',
      gen_random_uuid(), 'Grunn.', '00000000-0000-4000-8000-0000000000a1', now())
  $$,
  '23001', null,
  'every other measure is taken on a case'
);

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-0000000000d1',
    '00000000-0000-4000-8000-0000000000a1') $$,
  '23001', null,
  'an administrator does not end their own membership'
);

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-0000000000d4',
    '00000000-0000-4000-8000-0000000000b1') $$,
  '23001', null,
  'a member who is no administrator ends nobody''s membership'
);

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-0000000000d2',
    '00000000-0000-4000-8000-0000000000a1') $$,
  '23001', null,
  'a member who holds a role keeps it until it is handed over or removed'
);

select is(
  app.administrator_impartial('00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1'),
  false,
  'an administrator who reported the member is not impartial toward them'
);

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-0000000000d4',
    '00000000-0000-4000-8000-0000000000a2') $$,
  '23001', null,
  'an administrator involved in an open case with the member does not end it'
);

select throws_ok(
  $$ select pg_temp.measure_only() $$,
  '23001', null,
  'the measure ends the membership by commit'
);

-- Anna ends Cia's membership, as the domain does: the measure, then its effect.
select pg_temp.measure('00000000-0000-4000-8000-0000000000d4',
  '00000000-0000-4000-8000-0000000000a1');
update app.environment_memberships
set state = 'ended', end_reason = 'removed', ended_at = now(), updated_at = now()
where id = '00000000-0000-4000-8000-0000000000d4';

select lives_ok(
  $$ set constraints all immediate $$,
  'an ended membership is the measure''s effect'
);

select is(
  app.removed_from_environment('00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000c1'),
  true,
  'Cia was removed from the environment'
);

select lives_ok(
  $$ select pg_temp.contact('00000000-0000-4000-8000-0000000000c1') $$,
  'whoever was removed may still contact the administrators'
);

select throws_ok(
  $$ select pg_temp.contact('00000000-0000-4000-8000-0000000000f1') $$,
  '23001', null,
  'someone who was never a member may not'
);

select throws_ok(
  $$
    update app.moderation_actions set reason = 'Annen grunn.'
    where membership_id = '00000000-0000-4000-8000-0000000000d4'
  $$,
  null, null,
  'the measure is kept as it was decided'
);

select lives_ok(
  $$
    update app.environment_memberships
    set state = 'ended', end_reason = 'type_change_not_accepted', ended_at = now(),
      updated_at = now()
    where id = '00000000-0000-4000-8000-0000000000d3'
  $$,
  'a membership still ends for every earlier reason'
);

select * from finish();
rollback;
