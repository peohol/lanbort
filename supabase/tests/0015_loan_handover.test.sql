begin;

select plan(27);

select ok(
  not has_table_privilege(role_name, 'app.loan_handover_reports', 'SELECT'),
  format('%s cannot read app.loan_handover_reports', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

-- Anna (a1) owns the trailer (f1), available from 1 November, with Dag (d1)
-- as co-owner, and publishes it in the environment (e1). Bo (b1), Cia (c1)
-- and Eva (a2) are members there. Anna approves Bo's loan for 2–4 November
-- and Cia's for 8–10 November; Eva asks for 20–22 November.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000d1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'active', now());

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
insert into app.object_owners (object_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1');
insert into app.object_availability_intervals (object_id, period)
values ('00000000-0000-4000-8000-0000000000f1', daterange('2026-11-01', null));

insert into app.environments (id, type, name, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000e1', 'open', 'Borettslaget',
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
    '00000000-0000-4000-8000-0000000000a2', 'active', 'self_service', now(), 0);
insert into app.environment_publications (
  id, object_id, environment_id, published_by_user_id, status
)
values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'active');

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
    '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000101',
    '2026-11-08', '2026-11-10', 'Kan jeg låne den?', 1),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000a2', 'environment',
    '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000101',
    '2026-11-20', '2026-11-22', 'Kan jeg låne den?', 1);

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
    array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1']::uuid[]);
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

-- Runs the loans' deferred checks now, as a commit would.
create function pg_temp.check_now()
returns void
language plpgsql
as $$
begin
  set constraints app.loans_complete, app.loans_consistent,
    app.loan_agreements_consistent, app.loan_reservations_consistent,
    app.loan_amendments_consistent, app.loan_handover_reports_consistent immediate;
  set constraints app.loans_complete, app.loans_consistent,
    app.loan_agreements_consistent, app.loan_reservations_consistent,
    app.loan_amendments_consistent, app.loan_handover_reports_consistent deferred;
end;
$$;

select pg_temp.approve('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
  '[2026-11-02,2026-11-05)');
select pg_temp.approve('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
  '[2026-11-08,2026-11-11)');
select pg_temp.check_now();


-- A statement about the handover of a loan, on agreement version 1.
create function pg_temp.say(loan uuid, by uuid, role text, outcome text, version integer default 1)
returns void
language sql
as $$
  insert into app.loan_handover_reports (
    loan_id, agreement_version, reported_by_user_id, reporter_role, outcome, answer_due_at
  )
  values (loan, version, by, role, outcome,
    case outcome when 'not_handed_over' then clock_timestamp() + interval '72 hours' end);
$$;

-- Moves a loan to `status` without ending it.
create function pg_temp.move(loan uuid, status text)
returns void
language sql
as $$
  update app.loans set status = move.status, status_changed_at = clock_timestamp()
  where id = loan;
$$;

-- Ends a loan as not completed at `at` and releases its reservation.
create function pg_temp.not_completed(loan uuid, at timestamptz)
returns void
language sql
as $$
  update app.loans set status = 'ended', status_changed_at = at,
    end_reason = 'not_completed', ended_at = at
  where id = loan;
  delete from app.loan_reservations where loan_id = loan;
$$;

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000d1', 'lender', 'handed_over') $$,
  '23001',
  null,
  'a co-owner who is not the responsible lender says nothing about the handover'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', 'lender', 'handed_over') $$,
  '23001',
  null,
  'a party speaks only for their own side'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 'handed_over', 2) $$,
  '23001',
  null,
  'a statement is on the current agreement'
);

select throws_ok(
  $$ insert into app.loan_handover_reports (
       loan_id, agreement_version, reported_by_user_id, reporter_role, outcome
     ) values ('00000000-0000-4000-8000-000000000301', 1,
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 'not_handed_over') $$,
  '23514',
  null,
  '«not handed over» carries the deadline for the answer'
);

select throws_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000b1', 'borrower', 'handed_over');
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'a loan that was handed over does not stay reserved (PS-LOAN-012)'
);

select lives_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000b1', 'borrower', 'handed_over');
    select pg_temp.move('00000000-0000-4000-8000-000000000301', 'active');
    select pg_temp.check_now();
  $$,
  'Bo says it was handed over: the loan is active'
);

select throws_ok(
  $$ update app.loan_handover_reports set outcome = 'not_handed_over'
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'statements are never rewritten'
);

select throws_ok(
  $$ delete from app.loan_handover_reports
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'statements are never deleted'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 'not_handed_over') $$,
  '23001',
  null,
  'the side that said it was handed over cannot take it back once active'
);

select throws_ok(
  $$ select pg_temp.move('00000000-0000-4000-8000-000000000301', 'reserved') $$,
  '23001',
  null,
  'an active loan does not go back to reserved'
);

select throws_ok(
  $$ delete from app.loan_reservations
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'an active loan keeps its reservation'
);

select lives_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'not_handed_over');
    select pg_temp.move('00000000-0000-4000-8000-000000000301', 'disputed');
    select pg_temp.check_now();
  $$,
  'Anna contradicts it: the loan is disputed (PS-LOAN-013)'
);

select throws_ok(
  $$ select pg_temp.approve('00000000-0000-4000-8000-000000000303',
       '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000a2',
       '[2026-11-20,2026-11-23)') $$,
  '23001',
  null,
  'nobody knows who has the object: no new loan after the disputed handover'
);

select throws_ok(
  $$ update app.loan_reservations set period = '[2026-11-08,2026-11-13)'
     where loan_id = '00000000-0000-4000-8000-000000000302' $$,
  '23001',
  null,
  'a loan approved before the dispute does not grow into the uncertain time'
);

select results_eq(
  $$ select period::text from app.loan_reservations
     where loan_id = '00000000-0000-4000-8000-000000000302' $$,
  $$ values ('[2026-11-08,2026-11-11)') $$,
  'a loan approved before the dispute stays as it was (scenario 61)'
);

select throws_ok(
  $$
    select pg_temp.not_completed('00000000-0000-4000-8000-000000000301', clock_timestamp());
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'a disputed loan does not end as not completed while the parties disagree'
);

select throws_ok(
  $$ update app.loans set status = 'ended', status_changed_at = now(),
       end_reason = 'not_completed', ended_at = now(),
       ended_by_user_id = '00000000-0000-4000-8000-0000000000b1'
     where id = '00000000-0000-4000-8000-000000000301' $$,
  '23514',
  null,
  'nobody ends a loan as not completed: no party is blamed'
);

select lives_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000b1', 'borrower', 'not_handed_over');
    select pg_temp.not_completed('00000000-0000-4000-8000-000000000301', clock_timestamp());
    select pg_temp.check_now();
  $$,
  'Bo agrees it was not handed over: it ends as not completed'
);

select results_eq(
  $$ select reporter_role, outcome from app.loan_handover_reports
     where loan_id = '00000000-0000-4000-8000-000000000301' order by position $$,
  $$ values ('borrower', 'handed_over'), ('lender', 'not_handed_over'),
       ('borrower', 'not_handed_over') $$,
  'every statement stays in the history'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000a1', 'lender', 'handed_over') $$,
  '23001',
  null,
  'an ended loan takes no statements'
);

select lives_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-0000000000c1', 'borrower', 'not_handed_over');
    select pg_temp.check_now();
  $$,
  'Cia says hers was not handed over: the loan waits for Anna''s answer'
);

select throws_ok(
  $$
    select pg_temp.not_completed('00000000-0000-4000-8000-000000000302', clock_timestamp());
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'an unanswered statement does not end the loan before its deadline'
);

select lives_ok(
  $$
    select pg_temp.not_completed('00000000-0000-4000-8000-000000000302', (
      select answer_due_at from app.loan_handover_reports
      where loan_id = '00000000-0000-4000-8000-000000000302'
    ));
    select pg_temp.check_now();
  $$,
  'after the deadline, the unanswered statement ends it as not completed'
);

select lives_ok(
  $$
    select pg_temp.approve('00000000-0000-4000-8000-000000000303',
      '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000a2',
      '[2026-11-20,2026-11-23)');
    select pg_temp.check_now();
  $$,
  'with the dispute over, Eva''s loan can be approved'
);

select throws_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000303',
      '00000000-0000-4000-8000-0000000000a2', 'borrower', 'not_handed_over');
    update app.loans set status = 'ended', status_changed_at = now(),
      end_reason = 'cancelled', ended_at = now(),
      ended_by_user_id = '00000000-0000-4000-8000-0000000000a2'
    where id = '00000000-0000-4000-8000-000000000303';
    delete from app.loan_reservations
    where loan_id = '00000000-0000-4000-8000-000000000303';
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'a loan whose handover is being clarified is not cancelled (PS-LOAN-011)'
);

select * from finish();
rollback;
