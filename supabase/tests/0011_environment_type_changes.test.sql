begin;

select plan(21);

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array[
    'app.environment_type_periods',
    'app.environment_type_proposals',
    'app.environment_type_responses'
  ]) as table_name;

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b2', 'active', now());

insert into app.environments (id, type, name, created_by_user_id, created_at)
values ('00000000-0000-4000-8000-0000000000e1', 'hidden', 'Borettslaget',
  '00000000-0000-4000-8000-0000000000b1', '2026-10-01 10:00+00');

insert into app.environment_memberships
  (id, environment_id, user_id, state, origin, activated_at, activation_revision)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000b1', 'active', 'founder', now(), 0);

insert into app.environment_role_grants (environment_id, user_id, role, granted_by_user_id)
select '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', role,
  '00000000-0000-4000-8000-0000000000b1'
from unnest(array['owner', 'administrator']) as role;

select results_eq(
  $$ select type, started_at from app.environment_type_periods
     where environment_id = '00000000-0000-4000-8000-0000000000e1' $$,
  $$ values ('hidden'::text, '2026-10-01 10:00+00'::timestamptz) $$,
  'a new environment starts its type history (PS-ENV-009)'
);

-- The type history is checked at commit; checking after every statement here
-- shows each violation on its own.
set constraints all immediate;

select throws_ok(
  $$ update app.environments set type = 'open'
     where id = '00000000-0000-4000-8000-0000000000e1' $$,
  '23514',
  null,
  'the type cannot change without its history'
);

select throws_ok(
  $$ insert into app.environment_type_periods (environment_id, type, started_at)
     values ('00000000-0000-4000-8000-0000000000e1', 'closed', '2026-10-02 10:00+00') $$,
  '23514',
  null,
  'a weaker type needs an adopted proposal (PS-ENV-008)'
);

select throws_ok(
  $$ insert into app.environment_type_proposals
       (environment_id, from_type, to_type, proposed_by_user_id, proposed_at, deadline)
     values ('00000000-0000-4000-8000-0000000000e1', 'hidden', 'open',
       '00000000-0000-4000-8000-0000000000b1', now(), now() + interval '7 days') $$,
  '23514',
  null,
  'hidden → open is never proposed in one step'
);

select throws_ok(
  $$ insert into app.environment_type_proposals
       (environment_id, from_type, to_type, proposed_by_user_id, proposed_at, deadline)
     values ('00000000-0000-4000-8000-0000000000e1', 'open', 'closed',
       '00000000-0000-4000-8000-0000000000b1', now(), now() + interval '7 days') $$,
  '23514',
  null,
  'a stricter type is never proposed'
);

insert into app.environment_type_proposals
  (id, environment_id, from_type, to_type, proposed_by_user_id, proposed_at, deadline)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1',
  'hidden', 'closed', '00000000-0000-4000-8000-0000000000b1', now(), now() + interval '7 days');

select throws_ok(
  $$ insert into app.environment_type_proposals
       (environment_id, from_type, to_type, proposed_by_user_id, proposed_at, deadline)
     values ('00000000-0000-4000-8000-0000000000e1', 'hidden', 'closed',
       '00000000-0000-4000-8000-0000000000b1', now(), now() + interval '7 days') $$,
  '23505',
  null,
  'an environment has at most one open proposal'
);

select throws_ok(
  $$ insert into app.environment_type_periods (environment_id, type, started_at, proposal_id)
     values ('00000000-0000-4000-8000-0000000000e1', 'closed', '2026-10-02 10:00+00',
       '00000000-0000-4000-8000-0000000000c1') $$,
  '23514',
  null,
  'a proposal still open adopts nothing'
);

insert into app.environment_type_responses (proposal_id, environment_id, membership_id, support)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000f1', true);

select throws_ok(
  $$ insert into app.environment_type_responses (proposal_id, environment_id, membership_id, support)
     values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1',
       '00000000-0000-4000-8000-0000000000f1', false) $$,
  '23505',
  null,
  'a member has one current answer; a new one supersedes it'
);

select throws_ok(
  $$ update app.environment_type_proposals set outcome = 'rejected', closed_at = now()
     where id = '00000000-0000-4000-8000-0000000000c1' $$,
  '23514',
  null,
  'a concluded vote records the counts it was decided on'
);

update app.environment_type_proposals
set closed_at = now(), outcome = 'adopted', eligible_count = 1, support_count = 1
where id = '00000000-0000-4000-8000-0000000000c1';

-- A command writes the period and the type together.
set constraints all deferred;

select lives_ok(
  $$
    insert into app.environment_type_periods (environment_id, type, started_at, proposal_id)
    values ('00000000-0000-4000-8000-0000000000e1', 'closed', '2026-10-02 10:00+00',
      '00000000-0000-4000-8000-0000000000c1');
    update app.environments set type = 'closed'
    where id = '00000000-0000-4000-8000-0000000000e1';
  $$,
  'an adopted proposal makes the weaker type possible'
);

set constraints all immediate;

select throws_ok(
  $$ update app.environment_type_proposals set outcome = 'withdrawn'
     where id = '00000000-0000-4000-8000-0000000000c1' $$,
  '23001',
  null,
  'a concluded proposal is history'
);

select throws_ok(
  $$ insert into app.environment_type_periods (environment_id, type, started_at, proposal_id)
     values ('00000000-0000-4000-8000-0000000000e1', 'open', '2026-10-03 10:00+00',
       '00000000-0000-4000-8000-0000000000c1') $$,
  '23514',
  null,
  'an adopted proposal only adopts its own step'
);

-- A command writes the period and the type together.
set constraints all deferred;

select lives_ok(
  $$
    insert into app.environment_type_periods (environment_id, type, started_at)
    values ('00000000-0000-4000-8000-0000000000e1', 'hidden', '2026-10-03 10:00+00');
    update app.environments set type = 'hidden'
    where id = '00000000-0000-4000-8000-0000000000e1';
  $$,
  'a stricter type needs no proposal (PS-ENV-007)'
);

set constraints all immediate;

select throws_ok(
  $$ update app.environment_type_periods set type = 'open'
     where environment_id = '00000000-0000-4000-8000-0000000000e1' $$,
  '23001',
  null,
  'the type history is never rewritten'
);

select throws_ok(
  $$ insert into app.environment_memberships (environment_id, user_id, state, origin,
       activated_at, activation_revision, passive_reason, passive_since, review_stage)
     values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b2',
       'passive', 'self_service', now(), 0, 'requirements_not_met', now(),
       'confirmation_required') $$,
  '23514',
  null,
  'only a pending application can wait for confirmation'
);

select * from finish();
rollback;
