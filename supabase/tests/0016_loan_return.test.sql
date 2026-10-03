begin;

select plan(33);

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array['app.loan_return_reports', 'app.loan_return_confirmations']) as table_name;

-- Anna (a1) owns the trailer (f1), available from 1 November, with Dag (d1)
-- as co-owner, and publishes it in the environment (e1). Bo (b1), Cia (c1)
-- and Eva (a2) are members there. Anna approves Bo's loan for 2–4 November
-- and Cia's for 12–14 November; Eva asks for 20–22 November.
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
    '2026-11-12', '2026-11-14', 'Kan jeg låne den?', 1),
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

-- The lender `by` received it: the loan ends as returned, its reservation
-- released.
create function pg_temp.returned(loan uuid, by uuid)
returns void
language sql
as $$
  update app.loans set status = 'ended', status_changed_at = clock_timestamp(),
    end_reason = 'returned', ended_at = clock_timestamp(), ended_by_user_id = by
  where id = loan;
  delete from app.loan_reservations where loan_id = loan;
$$;

select pg_temp.approve('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
  '[2026-11-02,2026-11-05)');
select pg_temp.approve('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
  '[2026-11-12,2026-11-15)');
select pg_temp.check_now();

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 'returned') $$,
  '23001',
  null,
  'nothing is returned before it was handed over'
);

select lives_ok(
  $$
    select pg_temp.hand_over('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000b1');
    select pg_temp.check_now();
  $$,
  'Bo''s loan is handed over'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000d1', 'lender', 'received') $$,
  '23001',
  null,
  'a co-owner who is not the responsible lender confirms no receipt (PS-LOAN-015)'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 'received') $$,
  '23514',
  null,
  'the borrower never says the lender''s receipt'
);

select throws_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000b1', 'borrower', 'returned');
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'the borrower''s word does not leave the loan plainly active'
);

select throws_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000b1', 'borrower', 'returned');
    select pg_temp.returned('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1');
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'the borrower''s word alone never ends the loan (PS-LOAN-015)'
);

select lives_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000b1', 'borrower', 'returned');
    select pg_temp.move('00000000-0000-4000-8000-000000000301', 'awaiting_return');
    select pg_temp.check_now();
  $$,
  'Bo says it was returned: the loan awaits return clarification'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 'returned') $$,
  '23001',
  null,
  'saying the same again with nobody speaking since adds nothing'
);

select throws_ok(
  $$ select pg_temp.approve('00000000-0000-4000-8000-000000000303',
       '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000a2',
       '[2026-11-20,2026-11-23)') $$,
  '23001',
  null,
  'an unsettled return blocks new loans (PS-LOAN-014)'
);

select lives_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'not_received');
    select pg_temp.move('00000000-0000-4000-8000-000000000301', 'return_disputed');
    select pg_temp.check_now();
  $$,
  'Anna has not received it: the return is disputed'
);

select throws_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'received');
    update app.loans set status = 'ended', status_changed_at = clock_timestamp(),
      end_reason = 'returned', ended_at = clock_timestamp(),
      ended_by_user_id = '00000000-0000-4000-8000-0000000000a1'
    where id = '00000000-0000-4000-8000-000000000301';
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'a returned loan releases its reservation'
);

select throws_ok(
  $$ update app.loans set status = 'ended', status_changed_at = clock_timestamp(),
       end_reason = 'returned', ended_at = clock_timestamp(),
       ended_by_user_id = '00000000-0000-4000-8000-0000000000b1'
     where id = '00000000-0000-4000-8000-000000000301' $$,
  '23514',
  null,
  'only the responsible lender''s receipt ends a loan as returned'
);

select lives_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'received');
    select pg_temp.returned('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1');
    select pg_temp.check_now();
  $$,
  'Anna confirms receipt: the loan ends as returned and frees its period'
);

select lives_ok(
  $$
    select pg_temp.approve('00000000-0000-4000-8000-000000000303',
      '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000a2',
      '[2026-11-20,2026-11-23)');
    select pg_temp.check_now();
  $$,
  'with the return settled, Eva''s loan can be approved'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 'returned') $$,
  '23001',
  null,
  'after the receipt, only a contradiction of it can be said'
);

select lives_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000b1', 'borrower', 'still_has');
    update app.loans set status = 'return_disputed', status_changed_at = clock_timestamp(),
      end_reason = null, ended_at = null, ended_by_user_id = null
    where id = '00000000-0000-4000-8000-000000000301';
    select pg_temp.check_now();
  $$,
  'Bo says he still has it after all: the loan reopens as disputed (PS-LOAN-017)'
);

select results_eq(
  $$ select reporter_role, outcome from app.loan_return_reports
     where loan_id = '00000000-0000-4000-8000-000000000301' order by position $$,
  $$ values ('borrower', 'returned'), ('lender', 'not_received'),
       ('lender', 'received'), ('borrower', 'still_has') $$,
  'the receipt stays in the history next to the contradiction'
);

select results_eq(
  $$ select
       (select count(*) from app.loan_reservations
        where loan_id = '00000000-0000-4000-8000-000000000301'),
       (select period::text from app.loan_reservations
        where loan_id = '00000000-0000-4000-8000-000000000303') $$,
  $$ values (0::bigint, '[2026-11-20,2026-11-23)') $$,
  'the reopened loan holds no reservation, and Eva''s loan stays (scenario 58)'
);

select throws_ok(
  $$ update app.loan_reservations set period = '[2026-11-20,2026-11-25)'
     where loan_id = '00000000-0000-4000-8000-000000000303' $$,
  '23001',
  null,
  'nobody knows who has the object: no loan grows while the return is reopened'
);

select throws_ok(
  $$ update app.loan_return_reports set outcome = 'returned'
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'statements are never rewritten'
);

-- Anna confirms receipt again, with the 30-second undo buffer.
insert into app.loan_return_confirmations (
  id, loan_id, agreement_version, requested_by_user_id, reporter_role, outcome,
  requested_at, effective_at
) values ('00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000301', 1,
  '00000000-0000-4000-8000-0000000000a1', 'lender', 'received',
  '2026-11-06 10:00:00+00', '2026-11-06 10:00:30+00');

select throws_ok(
  $$ insert into app.loan_return_confirmations (
       loan_id, agreement_version, requested_by_user_id, reporter_role, outcome,
       requested_at, effective_at
     ) values ('00000000-0000-4000-8000-000000000301', 1,
       '00000000-0000-4000-8000-0000000000a1', 'lender', 'received',
       '2026-11-06 10:00:01+00', '2026-11-06 10:00:31+00') $$,
  '23505',
  null,
  'one confirmation waits per side'
);

select throws_ok(
  $$ update app.loan_return_confirmations
     set status = 'withdrawn', resolved_at = '2026-11-06 10:00:30+00'
     where id = '00000000-0000-4000-8000-000000000401' $$,
  '23514',
  null,
  'a confirmation is undone only before it takes effect (PS-LOAN-016)'
);

select throws_ok(
  $$ update app.loan_return_confirmations
     set status = 'lapsed', resolved_at = '2026-11-06 10:00:10+00'
     where id = '00000000-0000-4000-8000-000000000401' $$,
  '23001',
  null,
  'a confirmation does not lapse while it can still be made'
);

select throws_ok(
  $$
    update app.loan_return_confirmations
    set status = 'applied', resolved_at = '2026-11-06 10:00:30+00'
    where id = '00000000-0000-4000-8000-000000000401';
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'an applied confirmation is a statement'
);

select lives_ok(
  $$
    update app.loan_return_confirmations
    set status = 'applied', resolved_at = '2026-11-06 10:00:30+00'
    where id = '00000000-0000-4000-8000-000000000401';
    insert into app.loan_return_reports (
      loan_id, agreement_version, reported_by_user_id, reporter_role, outcome,
      confirmation_id
    ) values ('00000000-0000-4000-8000-000000000301', 1,
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'received',
      '00000000-0000-4000-8000-000000000401');
    select pg_temp.returned('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a1');
    select pg_temp.check_now();
  $$,
  'the receipt is made after its buffer, and the loan ends as returned again'
);

-- Cia's loan is handed over; she confirms the return and it waits.
select pg_temp.hand_over('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-0000000000c1');
insert into app.loan_return_confirmations (
  id, loan_id, agreement_version, requested_by_user_id, reporter_role, outcome,
  requested_at, effective_at
) values ('00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000302', 1,
  '00000000-0000-4000-8000-0000000000c1', 'borrower', 'returned',
  '2026-11-13 10:00:00+00', '2026-11-13 10:00:30+00');

select throws_ok(
  $$ insert into app.loan_amendments (
       loan_id, base_version, proposed_by_user_id, proposer_role, period
     ) values ('00000000-0000-4000-8000-000000000302', 1,
       '00000000-0000-4000-8000-0000000000c1', 'borrower', '[2026-11-13,2026-11-16)') $$,
  '23001',
  null,
  'once handed over, a change keeps the handover day'
);

select lives_ok(
  $$ insert into app.loan_amendments (
       loan_id, base_version, proposed_by_user_id, proposer_role, period
     ) values ('00000000-0000-4000-8000-000000000302', 1,
       '00000000-0000-4000-8000-0000000000c1', 'borrower', '[2026-11-12,2026-11-17)') $$,
  'an active loan can propose a new return day (extension)'
);

select lives_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'received');
    select pg_temp.returned('00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-0000000000a1');
    select pg_temp.check_now();
  $$,
  'Anna confirms receipt at once, before Cia''s confirmation is made'
);

select results_eq(
  $$
    select 'confirmation', status from app.loan_return_confirmations
    where id = '00000000-0000-4000-8000-000000000402'
    union all
    select 'amendment', status from app.loan_amendments
    where loan_id = '00000000-0000-4000-8000-000000000302'
  $$,
  $$ values ('confirmation', 'lapsed'), ('amendment', 'lapsed') $$,
  'what waited on the loan lapses when it ends'
);

select * from finish();
rollback;
