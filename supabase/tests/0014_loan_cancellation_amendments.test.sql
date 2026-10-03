begin;

select plan(29);

select ok(
  not has_table_privilege(role_name, 'app.loan_amendments', 'SELECT'),
  format('%s cannot read app.loan_amendments', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

-- Anna (a1) owns the trailer (f1), available from 1 November, with Dag (d1)
-- as co-owner, and publishes it in the environment (e1). Bo (b1) and Cia
-- (c1) are members there. Anna approves Bo's loan for 2–4 November and
-- Cia's for 8–10 November.
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
    '2026-11-08', '2026-11-10', 'Kan jeg låne den?', 1);

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
    app.loan_amendments_consistent immediate;
  set constraints app.loans_complete, app.loans_consistent,
    app.loan_agreements_consistent, app.loan_reservations_consistent,
    app.loan_amendments_consistent deferred;
end;
$$;

select pg_temp.approve('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
  '[2026-11-02,2026-11-05)');
select pg_temp.approve('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
  '[2026-11-08,2026-11-11)');
select pg_temp.check_now();

-- A proposal on Bo's loan (301).
create function pg_temp.propose(id uuid, by uuid, role text, base integer, period daterange)
returns void
language sql
as $$
  insert into app.loan_amendments (id, loan_id, base_version, proposed_by_user_id,
    proposer_role, period)
  values (id, '00000000-0000-4000-8000-000000000301', base, by, role, period);
$$;

-- Answers the proposal.
create function pg_temp.answer(id uuid, status text, by uuid)
returns void
language sql
as $$
  update app.loan_amendments
  set status = answer.status, resolved_at = now(), resolved_by_user_id = by
  where loan_amendments.id = answer.id;
$$;

-- The next agreement version of Bo's loan, with `period` and `terms`.
create function pg_temp.agree(version integer, period daterange, terms text)
returns void
language sql
as $$
  insert into app.loan_agreements (
    loan_id, version, object_version, terms_version, title, category_id,
    description, loan_terms, period, lender_user_id
  )
  values ('00000000-0000-4000-8000-000000000301', version, 1, 1, 'Tilhenger', 'annet',
    'Liten tilhenger', terms, period, '00000000-0000-4000-8000-0000000000a1');
$$;

select throws_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000401',
       '00000000-0000-4000-8000-0000000000d1', 'lender', 1, '[2026-11-02,2026-11-07)') $$,
  '23001',
  null,
  'a co-owner who is not the responsible lender proposes nothing'
);

select throws_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000401',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 2, '[2026-11-02,2026-11-07)') $$,
  '23001',
  null,
  'a proposal builds on the current agreement'
);

select throws_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000401',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 1, '[2026-11-02,2026-11-05)') $$,
  '23001',
  null,
  'a proposal changes something'
);

select lives_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000401',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 1, '[2026-11-02,2026-11-08)') $$,
  'the borrower proposes to keep the trailer until 7 November'
);

select results_eq(
  $$ select period::text from app.loan_reservations
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  $$ values ('[2026-11-02,2026-11-05)') $$,
  'a proposal changes nothing on its own (PS-LOAN-010)'
);

select throws_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000402',
       '00000000-0000-4000-8000-0000000000a1', 'lender', 1, '[2026-11-03,2026-11-05)') $$,
  '23505',
  null,
  'one proposal waits at a time'
);

select throws_ok(
  $$ select pg_temp.answer('00000000-0000-4000-8000-000000000401', 'accepted',
       '00000000-0000-4000-8000-0000000000b1') $$,
  '23001',
  null,
  'nobody agrees with their own proposal'
);

select throws_ok(
  $$ select pg_temp.answer('00000000-0000-4000-8000-000000000401', 'accepted',
       '00000000-0000-4000-8000-0000000000d1') $$,
  '23001',
  null,
  'another co-owner does not answer for the responsible lender'
);

select throws_ok(
  $$ select pg_temp.answer('00000000-0000-4000-8000-000000000401', 'withdrawn',
       '00000000-0000-4000-8000-0000000000a1') $$,
  '23001',
  null,
  'only the proposing side withdraws'
);

select throws_ok(
  $$ select pg_temp.agree(2, '[2026-11-02,2026-11-08)', 'Vaskes etter bruk') $$,
  '23001',
  null,
  'no new agreement version without the other party''s consent'
);

select throws_ok(
  $$
    select pg_temp.answer('00000000-0000-4000-8000-000000000401', 'accepted',
      '00000000-0000-4000-8000-0000000000a1');
    select pg_temp.agree(2, '[2026-11-02,2026-11-08)', 'Ingen vilkår');
  $$,
  '23001',
  null,
  'an agreed change carries nothing but the agreed period'
);

select throws_ok(
  $$
    select pg_temp.answer('00000000-0000-4000-8000-000000000401', 'accepted',
      '00000000-0000-4000-8000-0000000000a1');
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'an accepted proposal is its agreement''s next version by commit'
);

select lives_ok(
  $$
    select pg_temp.answer('00000000-0000-4000-8000-000000000401', 'accepted',
      '00000000-0000-4000-8000-0000000000a1');
    select pg_temp.agree(2, '[2026-11-02,2026-11-08)', 'Vaskes etter bruk');
    update app.loan_reservations set period = '[2026-11-02,2026-11-08)'
    where loan_id = '00000000-0000-4000-8000-000000000301';
    select pg_temp.check_now();
  $$,
  'the lender accepts: version 2 and the reservation move together'
);

select results_eq(
  $$ select version, period::text from app.loan_agreements
     where loan_id = '00000000-0000-4000-8000-000000000301' order by version $$,
  $$ values (1, '[2026-11-02,2026-11-05)'), (2, '[2026-11-02,2026-11-08)') $$,
  'the earlier version stays as it was'
);

select throws_ok(
  $$ update app.loan_agreements set period = '[2026-11-02,2026-11-09)'
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'agreement versions are never rewritten'
);

select throws_ok(
  $$ update app.loan_reservations set period = '[2026-11-02,2026-11-09)'
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23P01',
  null,
  'a reservation never moves into another loan''s period (scenario 26)'
);

select throws_ok(
  $$
    update app.loan_reservations set period = '[2026-11-02,2026-11-07)'
    where loan_id = '00000000-0000-4000-8000-000000000301';
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'a reservation always holds the current agreement''s period'
);

select throws_ok(
  $$ delete from app.loan_reservations
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'a reserved loan keeps its reservation'
);

select throws_ok(
  $$ update app.loans set status = 'ended', end_reason = 'cancelled', ended_at = now(),
       ended_by_user_id = '00000000-0000-4000-8000-0000000000d1'
     where id = '00000000-0000-4000-8000-000000000301' $$,
  '23514',
  null,
  'only a party cancels (PS-LOAN-011)'
);

select throws_ok(
  $$
    update app.loans set status = 'ended', end_reason = 'cancelled', ended_at = now(),
      ended_by_user_id = '00000000-0000-4000-8000-0000000000b1'
    where id = '00000000-0000-4000-8000-000000000301';
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'a cancelled loan releases its reservation'
);

select pg_temp.propose('00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-0000000000a1', 'lender', 2, '[2026-11-03,2026-11-08)');

select lives_ok(
  $$
    update app.loans set status = 'ended', status_changed_at = now(),
      end_reason = 'cancelled', ended_at = now(),
      ended_by_user_id = '00000000-0000-4000-8000-0000000000b1'
    where id = '00000000-0000-4000-8000-000000000301';
    delete from app.loan_reservations
    where loan_id = '00000000-0000-4000-8000-000000000301';
    select pg_temp.check_now();
  $$,
  'the borrower cancels: the loan ends and its period is free'
);

select results_eq(
  $$ select status, resolved_by_user_id from app.loan_amendments
     where id = '00000000-0000-4000-8000-000000000402' $$,
  $$ values ('lapsed'::text, null::uuid) $$,
  'an open proposal lapses with the loan'
);

select throws_ok(
  $$ update app.loans set status = 'reserved', end_reason = null, ended_at = null,
       ended_by_user_id = null
     where id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'a cancelled loan stays cancelled'
);

select throws_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000403',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 2, '[2026-11-02,2026-11-04)') $$,
  '23001',
  null,
  'an ended loan takes no proposals'
);

select throws_ok(
  $$ select app.release_loan_requests('00000000-0000-4000-8000-0000000000f1', now()) $$,
  '23001',
  null,
  'the object does not let go of a loan that is still reserved'
);

select lives_ok(
  $$
    update app.loans set status = 'ended', status_changed_at = now(),
      end_reason = 'cancelled', ended_at = now(),
      ended_by_user_id = '00000000-0000-4000-8000-0000000000a1'
    where id = '00000000-0000-4000-8000-000000000302';
    delete from app.loan_reservations
    where loan_id = '00000000-0000-4000-8000-000000000302';
    select app.release_loan_requests('00000000-0000-4000-8000-0000000000f1', now());
    select pg_temp.check_now();
  $$,
  'once both loans ended, they and their requests let go of the object'
);

select results_eq(
  $$ select count(*)::integer from app.loans l
     join app.loan_requests r on r.id = l.request_id
     where l.object_id is null and r.object_id is null and r.status = 'approved'
       and l.status = 'ended' $$,
  $$ values (2) $$,
  'ended loans and their approved requests outlive the object (PS-OBJ-011)'
);

select * from finish();
rollback;
