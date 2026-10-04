begin;

select plan(57);

select ok(
  not has_table_privilege(role_name, 'app.moderation_actions', 'SELECT'),
  format('%s cannot read app.moderation_actions', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

-- Anna (a1) owns the trailer (f1) and publishes it in the environment (e1)
-- she founded and administers with Eva (a2), and in the cabin association
-- (e2) she also founded. Bo (b1) and Cia (c1) are members of e1, Cia also of
-- e2; Bo has a loan approved and Cia has asked through e2. Siv (a3) is a
-- platform steward; Hans (a4) has an account and nothing else.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a3', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a4', 'active', now());

insert into app.objects (id, title, category_id, description, loan_terms, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000f1', 'Tilhenger', 'annet', 'Liten tilhenger',
  'Vaskes etter bruk', '00000000-0000-4000-8000-0000000000a1');
insert into app.object_revisions (
  object_id, version, change, actor_user_id, title, category_id, description,
  loan_terms, status, availability, image_ids
)
values ('00000000-0000-4000-8000-0000000000f1', 1, 'created',
  '00000000-0000-4000-8000-0000000000a1', 'Tilhenger', 'annet', 'Liten tilhenger',
  'Vaskes etter bruk', 'active', '[]', '{}');
insert into app.object_owners (object_id, user_id)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1');
insert into app.object_availability_intervals (object_id, period)
values ('00000000-0000-4000-8000-0000000000f1', daterange('2026-11-01', null));

insert into app.environments (id, type, name, created_by_user_id) values
  ('00000000-0000-4000-8000-0000000000e1', 'open', 'Borettslaget',
    '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e2', 'open', 'Hytteforeningen',
    '00000000-0000-4000-8000-0000000000a1');
insert into app.environment_memberships (
  id, environment_id, user_id, state, origin, activated_at, activation_revision
) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a1', 'active', 'founder', now(), 0),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000b1', 'active', 'self_service', now(), 0),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000c1', 'active', 'self_service', now(), 0),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a2', 'active', 'self_service', now(), 0),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000e2',
    '00000000-0000-4000-8000-0000000000a1', 'active', 'founder', now(), 0),
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-0000000000e2',
    '00000000-0000-4000-8000-0000000000c1', 'active', 'self_service', now(), 0),
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-0000000000e2',
    '00000000-0000-4000-8000-0000000000b1', 'active', 'self_service', now(), 0);
insert into app.environment_role_grants (environment_id, user_id, role, granted_by_user_id)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
    'owner', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
    'administrator', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a2',
    'administrator', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1',
    'owner', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1',
    'administrator', '00000000-0000-4000-8000-0000000000a1');
insert into app.platform_role_grants (user_id, role, grant_reason, granted_by_process)
values ('00000000-0000-4000-8000-0000000000a3', 'platform_steward', 'Pilot', 'ops.platform_roles');
insert into app.environment_publications (
  id, object_id, environment_id, published_by_user_id, status
)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'active'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1', 'active');

insert into app.loan_requests (
  id, object_id, borrower_user_id, origin, environment_id, publication_id,
  desired_start, desired_end, message, terms_version
) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000b1', 'environment',
    '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000101',
    '2026-11-02', '2026-11-04', 'Kan jeg låne den?', 1),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000c1', 'environment',
    '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000102',
    '2026-11-12', '2026-11-14', 'Kan jeg låne den?', 1);

create function pg_temp.approve(
  loan uuid, request uuid, borrower uuid, period daterange
)
returns void
language plpgsql
as $$
begin
  insert into app.loans (id, request_id, object_id, borrower_user_id, responsible_lender_id,
    owner_ids_at_approval)
  values (loan, request, '00000000-0000-4000-8000-0000000000f1', borrower,
    '00000000-0000-4000-8000-0000000000a1',
    array['00000000-0000-4000-8000-0000000000a1']::uuid[]);
  insert into app.loan_agreements (
    loan_id, version, object_version, terms_version, title, category_id,
    description, loan_terms, period, lender_user_id
  )
  values (loan, 1, 1, 1, 'Tilhenger', 'annet', 'Liten tilhenger',
    'Vaskes etter bruk', period, '00000000-0000-4000-8000-0000000000a1');
  insert into app.loan_reservations (loan_id, object_id, period)
  values (loan, '00000000-0000-4000-8000-0000000000f1', period);
  update app.loan_requests set status = 'approved', status_changed_at = now()
  where id = request;
end;
$$;

-- Runs the deferred checks now, as a commit would.
create function pg_temp.check_now()
returns void
language plpgsql
as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end;
$$;

-- A report by `opener`: in the environment when one is given, else to the
-- platform, possibly escalated from another report.
create function pg_temp.report(
  id uuid, opener uuid, environment uuid, target text, subject uuid, object uuid,
  review uuid, escalated_from uuid
)
returns void
language sql
as $$
  insert into app.cases (id, kind, environment_id, report_target, subject_user_id,
    object_id, review_id, escalated_from_case_id, opened_by_user_id, opened_at)
  values (id, case when environment is null then 'platform_report' else 'environment_report' end,
    environment, target, subject, object, review, escalated_from, opener, now());
$$;

-- A measure `decider` takes on report `c`.
create function pg_temp.measure(
  c uuid, kind text, decider uuid, environment uuid, object uuid, review uuid,
  dimension text, removed_text text, removed_score smallint
)
returns void
language sql
as $$
  insert into app.moderation_actions (case_id, kind, scope, environment_id, object_id,
    review_id, dimension, reason, decided_by_user_id, decided_at, removed_text, removed_score)
  values (c, kind, case when environment is null then 'platform' else 'environment' end,
    environment, object, review, dimension, 'Brudd på reglene.', decider, now(),
    removed_text, removed_score);
$$;

select pg_temp.approve('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
  '[2026-11-02,2026-11-05)');
select pg_temp.check_now();

-- Reports in the environment (PS-TRUST-013).

select throws_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000500',
       '00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000e1',
       'object', null, '00000000-0000-4000-8000-0000000000f1', null, null) $$,
  '23001',
  null,
  'only a member reports in the environment'
);

select throws_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000500',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1',
       'object', null, '00000000-0000-4000-8000-0000000000f1', null, null) $$,
  '23001',
  null,
  'an owner does not report their own object'
);

select throws_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000500',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000e1',
       'user', '00000000-0000-4000-8000-0000000000a4', null, null, null) $$,
  '23001',
  null,
  'a user is reported in the environment only when a member there'
);

select throws_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000500',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000e1',
       'user', '00000000-0000-4000-8000-0000000000b1', null, null, null) $$,
  '23514',
  null,
  'nobody reports themselves'
);

select lives_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000e1',
       'object', null, '00000000-0000-4000-8000-0000000000f1', null, null) $$,
  'Bo reports the trailer in the environment'
);

select throws_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000500',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000e1',
       'object', null, '00000000-0000-4000-8000-0000000000f1', null, null) $$,
  '23505',
  null,
  'one open report by a reporter about the same thing'
);

select ok(
  app.case_reported(c, '00000000-0000-4000-8000-0000000000a1')
    and app.case_involved(c, '00000000-0000-4000-8000-0000000000a1')
    and not app.case_handler(c, '00000000-0000-4000-8000-0000000000a1', now())
    and app.case_handler(c, '00000000-0000-4000-8000-0000000000a2', now()),
  'the owner of a reported object is involved and never handles the report'
)
from app.cases as c where id = '00000000-0000-4000-8000-000000000501';

-- Local measures (PS-TRUST-013, PS-OBJ-017).

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-000000000501', 'publication_blocked',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1',
       '00000000-0000-4000-8000-0000000000f1', null, null, null, null) $$,
  '23001',
  null,
  'an involved administrator takes no measure'
);

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-000000000501', 'object_blocked',
       '00000000-0000-4000-8000-0000000000a2', null,
       '00000000-0000-4000-8000-0000000000f1', null, null, null, null) $$,
  '23001',
  null,
  'an environment report gets no platform measure'
);

select throws_ok(
  $$
    select pg_temp.measure('00000000-0000-4000-8000-000000000501', 'publication_blocked',
      '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000f1', null, null, null, null);
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'a measure is not recorded without its effect'
);

select lives_ok(
  $$
    select pg_temp.measure('00000000-0000-4000-8000-000000000501', 'publication_blocked',
      '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000f1', null, null, null, null);
    update app.environment_publications set status = 'blocked', status_changed_at = now()
    where id = '00000000-0000-4000-8000-000000000101';
    select pg_temp.check_now();
  $$,
  'Eva blocks the trailer in the environment'
);

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-000000000501', 'publication_rejected',
       '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e1',
       '00000000-0000-4000-8000-0000000000f1', null, null, null, null) $$,
  '23001',
  null,
  'a publication no longer shown takes no further measure'
);

select throws_ok(
  $$ update app.moderation_actions set reason = 'Annen grunn.' $$,
  '23001',
  null,
  'a measure is never changed'
);

select throws_ok(
  $$ delete from app.moderation_actions $$,
  '23001',
  null,
  'or deleted'
);

-- Escalation to the platform.

select throws_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000502',
       '00000000-0000-4000-8000-0000000000b1', null,
       'object', null, '00000000-0000-4000-8000-0000000000f1', null,
       '00000000-0000-4000-8000-000000000501') $$,
  '23001',
  null,
  'only the report''s handler escalates it'
);

select throws_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000502',
       '00000000-0000-4000-8000-0000000000a2', null,
       'user', '00000000-0000-4000-8000-0000000000a1', null, null,
       '00000000-0000-4000-8000-000000000501') $$,
  '23001',
  null,
  'an escalation is about what was reported'
);

select lives_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000502',
       '00000000-0000-4000-8000-0000000000a2', null,
       'object', null, '00000000-0000-4000-8000-0000000000f1', null,
       '00000000-0000-4000-8000-000000000501') $$,
  'Eva escalates the report to the platform'
);

select results_eq(
  $$ select app.case_handlers(id, now()) from app.cases
     where id in ('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-000000000502')
     order by id $$,
  $$ values ('00000000-0000-4000-8000-0000000000a2'::uuid),
       ('00000000-0000-4000-8000-0000000000a3'::uuid) $$,
  'the local report waits for Eva, never the owner; the escalated one for the stewards'
);

-- Platform measures on an object (PS-TRUST-013).

select throws_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000500',
       '00000000-0000-4000-8000-0000000000a4', null,
       'object', null, '00000000-0000-4000-8000-0000000000f1', null, null) $$,
  '23001',
  null,
  'an object is reported to the platform only by someone who has met it'
);

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-000000000502', 'object_blocked',
       '00000000-0000-4000-8000-0000000000a2', null,
       '00000000-0000-4000-8000-0000000000f1', null, null, null, null) $$,
  '23001',
  null,
  'an administrator takes no platform measure'
);

select lives_ok(
  $$
    select pg_temp.measure('00000000-0000-4000-8000-000000000502', 'object_blocked',
      '00000000-0000-4000-8000-0000000000a3', null,
      '00000000-0000-4000-8000-0000000000f1', null, null, null, null);
    select pg_temp.check_now();
  $$,
  'Siv blocks the trailer on the platform'
);

select ok(
  app.object_platform_blocked('00000000-0000-4000-8000-0000000000f1'),
  'the trailer is blocked'
);

select throws_ok(
  $$ select pg_temp.approve('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
       '[2026-11-12,2026-11-15)') $$,
  '23001',
  'object 00000000-0000-4000-8000-0000000000f1 is blocked by the platform',
  'a blocked object gets no new loan, also where it is still published'
);

select throws_ok(
  $$ insert into app.loan_requests (
       id, object_id, borrower_user_id, origin, environment_id, publication_id,
       desired_start, desired_end, message, terms_version
     ) values ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000f1',
       '00000000-0000-4000-8000-0000000000b1', 'environment',
       '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000102',
       '2026-11-20', '2026-11-22', 'Kan jeg låne den?', 1) $$,
  '23001',
  'object 00000000-0000-4000-8000-0000000000f1 is blocked by the platform',
  'and no new request'
);

select ok(
  exists (
    select 1 from app.loans
    where id = '00000000-0000-4000-8000-000000000301' and status = 'reserved'
  ),
  'the loan approved before goes on'
);

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-000000000502', 'object_blocked',
       '00000000-0000-4000-8000-0000000000a3', null,
       '00000000-0000-4000-8000-0000000000f1', null, null, null, null) $$,
  '23001',
  null,
  'a blocked object is not blocked again'
);

select lives_ok(
  $$
    select pg_temp.measure('00000000-0000-4000-8000-000000000502', 'object_unblocked',
      '00000000-0000-4000-8000-0000000000a3', null,
      '00000000-0000-4000-8000-0000000000f1', null, null, null, null);
    select pg_temp.check_now();
  $$,
  'Siv lifts the block'
);

select ok(
  not app.object_platform_blocked('00000000-0000-4000-8000-0000000000f1'),
  'the trailer is no longer blocked'
);

-- Reports about a user to the platform.

select throws_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000500',
       '00000000-0000-4000-8000-0000000000a4', null,
       'user', '00000000-0000-4000-8000-0000000000b1', null, null, null) $$,
  '23001',
  null,
  'a user is reported only by someone related to them'
);

select lives_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000505',
       '00000000-0000-4000-8000-0000000000c1', null,
       'user', '00000000-0000-4000-8000-0000000000b1', null, null, null) $$,
  'Cia, a member with Bo, reports him'
);

-- Bo sent Hans a friend request, and Hans blocked him.
select lives_ok(
  $$
    insert into app.friendships (requester_id, addressee_id)
    values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a4');
    insert into app.user_blocks (blocker_id, blocked_id)
    values ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000b1');
    update app.friendships
    set status = 'ended', ended_at = clock_timestamp(),
      ended_by_user_id = '00000000-0000-4000-8000-0000000000a4', end_reason = 'blocked'
    where requester_id = '00000000-0000-4000-8000-0000000000b1'
      and addressee_id = '00000000-0000-4000-8000-0000000000a4';
    select pg_temp.report('00000000-0000-4000-8000-000000000506',
      '00000000-0000-4000-8000-0000000000a4', null,
      'user', '00000000-0000-4000-8000-0000000000b1', null, null, null);
  $$,
  'whoever blocked someone still reports them from the request they got'
);

select throws_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000500',
       '00000000-0000-4000-8000-0000000000b1', null,
       'user', '00000000-0000-4000-8000-0000000000a4', null, null, null) $$,
  '23001',
  null,
  'a request one sent gives no context to report from'
);

-- Moderation of reviews (PS-TRUST-014–016). Bo cancels; Anna and Bo
-- review each other and both reviews are published.

select lives_ok(
  $$
    update app.loans set status = 'ended', status_changed_at = clock_timestamp(),
      end_reason = 'cancelled', ended_at = clock_timestamp(),
      ended_by_user_id = '00000000-0000-4000-8000-0000000000b1'
    where id = '00000000-0000-4000-8000-000000000301';
    delete from app.loan_reservations where loan_id = '00000000-0000-4000-8000-000000000301';
    -- One clock reading, so a review's submission and update times match.
    insert into app.loan_reviews (
      id, loan_id, author_role, author_user_id, subject_user_id, body, submitted_at, updated_at
    )
    select review.*, at, at
    from (values
      ('00000000-0000-4000-8000-000000000401'::uuid, '00000000-0000-4000-8000-000000000301'::uuid,
        'lender', '00000000-0000-4000-8000-0000000000a1'::uuid,
        '00000000-0000-4000-8000-0000000000b1'::uuid, 'Avlyste sent. Naboen sa han er upålitelig.'),
      ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000301',
        'borrower', '00000000-0000-4000-8000-0000000000b1',
        '00000000-0000-4000-8000-0000000000a1', 'Svarte aldri.')
    ) as review, (select clock_timestamp() as at) as now;
    insert into app.loan_review_scores (review_id, reviewer_role, dimension, score) values
      ('00000000-0000-4000-8000-000000000401', 'lender', 'communication', 1),
      ('00000000-0000-4000-8000-000000000402', 'borrower', 'communication', 2);
    update app.loan_review_periods
    set status = 'closed', closed_at = clock_timestamp(), closed_as = 'both_submitted'
    where loan_id = '00000000-0000-4000-8000-000000000301';
    select pg_temp.check_now();
  $$,
  'both reviews are published'
);

select throws_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000500',
       '00000000-0000-4000-8000-0000000000c1', null,
       'review', '00000000-0000-4000-8000-0000000000a1', null,
       '00000000-0000-4000-8000-000000000401', null) $$,
  '23001',
  null,
  'only the reviewed party reports a review'
);

select lives_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000503',
       '00000000-0000-4000-8000-0000000000b1', null,
       'review', '00000000-0000-4000-8000-0000000000a1', null,
       '00000000-0000-4000-8000-000000000401', null) $$,
  'Bo reports Anna''s review of him'
);

select ok(
  app.case_involved(c, '00000000-0000-4000-8000-0000000000a1')
    and app.case_reported(c, '00000000-0000-4000-8000-0000000000a1'),
  'the author of a reported review is involved'
)
from app.cases as c where id = '00000000-0000-4000-8000-000000000503';

select throws_ok(
  $$ update app.loan_reviews set body = null
     where id = '00000000-0000-4000-8000-000000000401' $$,
  '23001',
  null,
  'a published review''s text does not go without a measure'
);

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-000000000503', 'review_text_removed',
       '00000000-0000-4000-8000-0000000000a3', null, null,
       '00000000-0000-4000-8000-000000000401', null, 'Noe annet.', null) $$,
  '23001',
  null,
  'the measure keeps the text as it was'
);

select lives_ok(
  $$
    select pg_temp.measure('00000000-0000-4000-8000-000000000503', 'review_text_removed',
      '00000000-0000-4000-8000-0000000000a3', null, null,
      '00000000-0000-4000-8000-000000000401', null,
      'Avlyste sent. Naboen sa han er upålitelig.', null);
    update app.loan_reviews set body = null
    where id = '00000000-0000-4000-8000-000000000401';
    select pg_temp.check_now();
  $$,
  'Siv removes the text; the low score stands without it'
);

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-000000000503', 'review_score_removed',
       '00000000-0000-4000-8000-0000000000a3', null, null,
       '00000000-0000-4000-8000-000000000401', 'communication', null, 5::smallint) $$,
  '23001',
  null,
  'the measure keeps the score as it was'
);

select throws_ok(
  $$ delete from app.loan_review_scores
     where review_id = '00000000-0000-4000-8000-000000000402' $$,
  '23001',
  null,
  'a published score does not go without a measure'
);

select lives_ok(
  $$
    select pg_temp.measure('00000000-0000-4000-8000-000000000503', 'review_score_removed',
      '00000000-0000-4000-8000-0000000000a3', null, null,
      '00000000-0000-4000-8000-000000000401', 'communication', null, 1::smallint);
    delete from app.loan_review_scores
    where review_id = '00000000-0000-4000-8000-000000000401' and dimension = 'communication';
    select pg_temp.check_now();
  $$,
  'Siv removes the score'
);

select ok(
  app.loan_review_fits(review),
  'the review still fits its window without the removed score'
)
from app.loan_reviews as review where id = '00000000-0000-4000-8000-000000000401';

select lives_ok(
  $$
    select pg_temp.measure('00000000-0000-4000-8000-000000000503', 'review_removed',
      '00000000-0000-4000-8000-0000000000a3', null, null,
      '00000000-0000-4000-8000-000000000401', null, null, null);
    update app.loan_reviews set status = 'removed'
    where id = '00000000-0000-4000-8000-000000000401';
    select pg_temp.check_now();
  $$,
  'Siv removes the whole review'
);

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-000000000503', 'review_removed',
       '00000000-0000-4000-8000-0000000000a3', null, null,
       '00000000-0000-4000-8000-000000000401', null, null, null) $$,
  '23001',
  null,
  'a removed review takes no further measure'
);

select throws_ok(
  $$ update app.loan_reviews set status = 'published'
     where id = '00000000-0000-4000-8000-000000000401' $$,
  '23001',
  null,
  'a removed review stays removed'
);

-- The response (PS-TRUST-005, PS-TRUST-015).

select throws_ok(
  $$ insert into app.loan_review_responses (review_id, author_user_id, body, responded_at)
     values ('00000000-0000-4000-8000-000000000402',
       '00000000-0000-4000-8000-0000000000a1', null, clock_timestamp()) $$,
  '23001',
  null,
  'a response is written with text'
);

select lives_ok(
  $$ insert into app.loan_review_responses (review_id, author_user_id, body, responded_at)
     values ('00000000-0000-4000-8000-000000000402',
       '00000000-0000-4000-8000-0000000000a1', 'Bo er en løgner.', clock_timestamp()) $$,
  'Anna responds to Bo''s review'
);

select throws_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000500',
       '00000000-0000-4000-8000-0000000000a1', null,
       'review_response', '00000000-0000-4000-8000-0000000000a1', null,
       '00000000-0000-4000-8000-000000000402', null) $$,
  '23001',
  null,
  'the responder does not report their own response'
);

select lives_ok(
  $$ select pg_temp.report('00000000-0000-4000-8000-000000000504',
       '00000000-0000-4000-8000-0000000000b1', null,
       'review_response', '00000000-0000-4000-8000-0000000000a1', null,
       '00000000-0000-4000-8000-000000000402', null) $$,
  'Bo reports the response to his review'
);

select throws_ok(
  $$ update app.loan_review_responses set body = null
     where review_id = '00000000-0000-4000-8000-000000000402' $$,
  '23001',
  null,
  'a response''s text does not go without a measure'
);

select throws_ok(
  $$ select pg_temp.measure('00000000-0000-4000-8000-000000000504', 'review_removed',
       '00000000-0000-4000-8000-0000000000a3', null, null,
       '00000000-0000-4000-8000-000000000402', null, null, null) $$,
  '23001',
  null,
  'a reported response does not remove the review it answers'
);

select lives_ok(
  $$
    select pg_temp.measure('00000000-0000-4000-8000-000000000504', 'review_response_removed',
      '00000000-0000-4000-8000-0000000000a3', null, null,
      '00000000-0000-4000-8000-000000000402', null, 'Bo er en løgner.', null);
    update app.loan_review_responses set body = null
    where review_id = '00000000-0000-4000-8000-000000000402';
    select pg_temp.check_now();
  $$,
  'Siv removes the response''s text'
);

select throws_ok(
  $$ delete from app.loan_review_responses
     where review_id = '00000000-0000-4000-8000-000000000402' $$,
  '23001',
  null,
  'a removed response stays as the one response'
);

select results_eq(
  $$ select kind, removed_text, removed_score from app.moderation_actions
     where case_id = '00000000-0000-4000-8000-000000000503' order by position $$,
  $$ values
       ('review_text_removed', 'Avlyste sent. Naboen sa han er upålitelig.', null::smallint),
       ('review_score_removed', null, 1::smallint),
       ('review_removed', null, null::smallint) $$,
  'what was removed is kept with the measure'
);

select * from finish();
rollback;
