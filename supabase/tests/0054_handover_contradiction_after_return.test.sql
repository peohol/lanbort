begin;

select plan(11);

-- PS-LOAN-022: the side that has said nothing about the handover, or the
-- return, may still say it was not handed over once the return is under
-- way; the loan is then disputed with its return statements kept.
--
-- Anna (a1) owns the trailer (f1), with Dag (d1) as co-owner, and lends it to Bo (b1) for 2–4 November
-- and to Cia (c1) for 12–14 November, in the environment (e1).
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000d1', 'active', now());

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
    '00000000-0000-4000-8000-0000000000c1', 'active', 'self_service', now(), 0);
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
    app.loan_amendments_consistent, app.loan_handover_reports_consistent,
    app.loan_return_reports_consistent, app.loan_return_confirmations_consistent
    immediate;
  set constraints app.loans_complete, app.loans_consistent,
    app.loan_agreements_consistent, app.loan_reservations_consistent,
    app.loan_amendments_consistent, app.loan_handover_reports_consistent,
    app.loan_return_reports_consistent, app.loan_return_confirmations_consistent
    deferred;
end;
$$;

-- The borrower says it was handed over: the loan is active.
create function pg_temp.hand_over(loan uuid, borrower uuid)
returns void
language sql
as $$
  insert into app.loan_handover_reports (
    loan_id, agreement_version, reported_by_user_id, reporter_role, outcome
  ) values (loan, 1, borrower, 'borrower', 'handed_over');
  update app.loans set status = 'active', status_changed_at = clock_timestamp()
  where id = loan;
$$;

-- A statement about the return, on agreement version 1.
create function pg_temp.say(loan uuid, by uuid, role text, outcome text)
returns void
language sql
as $$
  insert into app.loan_return_reports (
    loan_id, agreement_version, reported_by_user_id, reporter_role, outcome
  ) values (loan, 1, by, role, outcome);
$$;

-- Moves a loan to `status` without ending it.
create function pg_temp.move(loan uuid, status text)
returns void
language sql
as $$
  update app.loans set status = move.status, status_changed_at = clock_timestamp()
  where id = loan;
$$;

-- A statement about the handover, on agreement version 1; «not handed
-- over» gives the other side until its deadline to answer.
create function pg_temp.say_handover(loan uuid, by uuid, role text, outcome text)
returns void
language sql
as $$
  insert into app.loan_handover_reports (
    loan_id, agreement_version, reported_by_user_id, reporter_role, outcome,
    answer_due_at
  ) values (loan, 1, by, role, outcome, case outcome
    when 'not_handed_over' then clock_timestamp() + interval '72 hours'
  end);
$$;

select pg_temp.approve('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
  '[2026-11-02,2026-11-05)');
select pg_temp.approve('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
  '[2026-11-12,2026-11-15)');
select pg_temp.hand_over('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-0000000000b1');
select pg_temp.hand_over('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-0000000000c1');
-- Bo says it was returned; Cia that she still has it.
select pg_temp.say('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-0000000000b1', 'borrower', 'returned');
select pg_temp.move('00000000-0000-4000-8000-000000000301', 'awaiting_return');
select pg_temp.say('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-0000000000c1', 'borrower', 'still_has');
select pg_temp.move('00000000-0000-4000-8000-000000000302', 'late');
select pg_temp.check_now();

select throws_ok(
  $$ select pg_temp.say_handover('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 'not_handed_over') $$,
  '23001',
  null,
  'the side that said it was handed over cannot take it back on its own'
);

select throws_ok(
  $$ select pg_temp.say_handover('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000a1', 'lender', 'handed_over') $$,
  '23001',
  null,
  'saying it was handed over adds nothing once the return is under way'
);

select throws_ok(
  $$
    select pg_temp.say_handover('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'not_handed_over');
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'a contradicted handover does not leave the loan awaiting its return'
);

select lives_ok(
  $$
    select pg_temp.say_handover('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'not_handed_over');
    select pg_temp.move('00000000-0000-4000-8000-000000000301', 'disputed');
    select pg_temp.check_now();
  $$,
  'Anna, who said nothing, says it was not handed over: the loan is disputed'
);

select results_eq(
  $$
    select reporter_role, outcome from app.loan_return_reports
    where loan_id = '00000000-0000-4000-8000-000000000301'
  $$,
  $$ values ('borrower', 'returned') $$,
  'what Bo said about the return stays'
);

select throws_ok(
  $$
    select pg_temp.say_handover('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'handed_over');
    select pg_temp.move('00000000-0000-4000-8000-000000000301', 'active');
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'agreeing again does not forget what was said about the return'
);

select lives_ok(
  $$
    select pg_temp.say_handover('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'handed_over');
    select pg_temp.move('00000000-0000-4000-8000-000000000301', 'awaiting_return');
    select pg_temp.check_now();
  $$,
  'agreeing again puts the loan back where the return statements say'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-0000000000a1', 'lender', 'not_received');
     select pg_temp.say_handover('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-0000000000a1', 'lender', 'not_handed_over') $$,
  '23001',
  null,
  'the side that spoke about the return has spoken'
);

select lives_ok(
  $$
    select pg_temp.say_handover('00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'not_handed_over');
    select pg_temp.move('00000000-0000-4000-8000-000000000302', 'disputed');
    select pg_temp.check_now();
  $$,
  'a late loan becomes disputed the same way'
);

select lives_ok(
  $$
    select pg_temp.say_handover('00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-0000000000c1', 'borrower', 'not_handed_over');
    update app.loans set status = 'ended', status_changed_at = clock_timestamp(),
      end_reason = 'not_completed', ended_at = clock_timestamp()
    where id = '00000000-0000-4000-8000-000000000302';
    delete from app.loan_reservations
    where loan_id = '00000000-0000-4000-8000-000000000302';
    select pg_temp.check_now();
  $$,
  'both saying it was not handed over ends it as not completed, by nobody'
);

select throws_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'not_received');
    select pg_temp.move('00000000-0000-4000-8000-000000000301', 'return_disputed');
    select pg_temp.say_handover('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'not_handed_over');
  $$,
  '23001',
  null,
  'a disputed return has been spoken to by both'
);

select * from finish();
rollback;
