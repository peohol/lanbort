begin;

select plan(34);

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array['app.loan_lender_transfers', 'app.loan_lender_unavailability'])
    as table_name;

-- As in 0016: Anna (a1) owns the trailer (f1) with Dag (d1) and approves
-- Bo's (b1) loan and Cia's (c1). Gro (a3) and Hans (a4) become co-owners
-- after that; Bo has blocked Hans.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000d1', 'active', now()),
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

-- Runs the deferred checks now, as a commit would.
create function pg_temp.check_now()
returns void
language plpgsql
as $$
begin
  set constraints app.loans_complete, app.loans_consistent,
    app.loan_agreements_consistent, app.loan_reservations_consistent,
    app.loan_amendments_consistent, app.loan_handover_reports_consistent,
    app.loan_return_reports_consistent, app.loan_return_confirmations_consistent,
    app.loan_lender_transfers_consistent
    immediate;
  set constraints app.loans_complete, app.loans_consistent,
    app.loan_agreements_consistent, app.loan_reservations_consistent,
    app.loan_amendments_consistent, app.loan_handover_reports_consistent,
    app.loan_return_reports_consistent, app.loan_return_confirmations_consistent,
    app.loan_lender_transfers_consistent
    deferred;
end;
$$;

-- A transfer of the loan's lender role, proposed now. A takeover is accepted
-- by its recipient as it is proposed.
create function pg_temp.propose(
  transfer uuid, loan uuid, kind text, from_user uuid, to_user uuid, consent boolean
)
returns void
language sql
as $$
  insert into app.loan_lender_transfers (
    id, loan_id, kind, from_user_id, to_user_id, borrower_consent_required,
    proposed_at, recipient_accepted_at
  ) values (transfer, loan, kind, from_user, to_user, consent, now(),
    case kind when 'takeover' then now() end);
$$;

-- The transfer completes and its recipient becomes the responsible lender.
create function pg_temp.complete(transfer uuid)
returns void
language sql
as $$
  update app.loan_lender_transfers
  set status = 'completed', resolved_at = clock_timestamp(),
    resolved_by_user_id = to_user_id
  where id = transfer;
  update app.loans as loan set responsible_lender_id = transfer_row.to_user_id
  from app.loan_lender_transfers as transfer_row
  where transfer_row.id = transfer and loan.id = transfer_row.loan_id;
$$;

-- A return statement on agreement version 1, by a party or a co-owner.
create function pg_temp.say(loan uuid, by uuid, role text, outcome text, made_as text)
returns void
language sql
as $$
  insert into app.loan_return_reports (
    loan_id, agreement_version, reported_by_user_id, reporter_role, outcome, reported_as
  ) values (loan, 1, by, role, outcome, made_as);
$$;

select pg_temp.approve('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
  '[2026-11-02,2026-11-05)');
select pg_temp.approve('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
  '[2026-11-12,2026-11-15)');
insert into app.loan_handover_reports (
  loan_id, agreement_version, reported_by_user_id, reporter_role, outcome
) values
  ('00000000-0000-4000-8000-000000000301', 1, '00000000-0000-4000-8000-0000000000b1',
    'borrower', 'handed_over'),
  ('00000000-0000-4000-8000-000000000302', 1, '00000000-0000-4000-8000-0000000000c1',
    'borrower', 'handed_over');
update app.loans set status = 'active', status_changed_at = clock_timestamp();
insert into app.object_owners (object_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a4');
insert into app.user_blocks (blocker_id, blocked_id)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a4');
select pg_temp.check_now();

-- Who can get the role.

select throws_ok(
  $$ insert into app.loan_lender_unavailability (loan_id, lender_user_id, established_at)
     values ('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000d1', now()) $$,
  '23001',
  null,
  'only the responsible lender is established as unavailable'
);

select throws_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-000000000301', 'voluntary',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1',
       true) $$,
  '23001',
  null,
  'a co-owner of the circle needs no consent from the borrower'
);

select throws_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-000000000301', 'voluntary',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3',
       false) $$,
  '23001',
  null,
  'a later co-owner needs the borrower''s consent'
);

select throws_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-000000000301', 'voluntary',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a4',
       true) $$,
  '23001',
  null,
  'nobody blocked with the borrower gets the role'
);

select throws_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-000000000301', 'voluntary',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1',
       false) $$,
  '23001',
  null,
  'the borrower does not get the lender''s role'
);

select throws_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-000000000301', 'takeover',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1',
       false) $$,
  '23001',
  null,
  'nobody takes over from an available lender'
);

-- A voluntary transfer to Dag.

select lives_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-000000000301', 'voluntary',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1',
       false) $$,
  'Anna offers Dag the role'
);

select throws_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000502',
       '00000000-0000-4000-8000-000000000301', 'voluntary',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3',
       true) $$,
  '23505',
  null,
  'one change of the lender is open at a time'
);

select throws_ok(
  $$ update app.loans set responsible_lender_id = '00000000-0000-4000-8000-0000000000d1'
     where id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'the role moves only through a completed transfer'
);

select throws_ok(
  $$ update app.loan_lender_transfers
     set status = 'declined', resolved_at = now(),
       resolved_by_user_id = '00000000-0000-4000-8000-0000000000b1'
     where id = '00000000-0000-4000-8000-000000000501' $$,
  '23001',
  null,
  'the borrower has no say over a co-owner of the circle'
);

select throws_ok(
  $$ update app.loan_lender_transfers set status = 'lapsed', resolved_at = now()
     where id = '00000000-0000-4000-8000-000000000501' $$,
  '23001',
  null,
  'a transfer that can still complete does not lapse'
);

select throws_ok(
  $$ select pg_temp.complete('00000000-0000-4000-8000-000000000501') $$,
  '23514',
  null,
  'nobody is made responsible without accepting'
);

update app.loan_lender_transfers set recipient_accepted_at = now()
where id = '00000000-0000-4000-8000-000000000501';

select throws_ok(
  $$
    update app.loan_lender_transfers
    set status = 'completed', resolved_at = now(),
      resolved_by_user_id = '00000000-0000-4000-8000-0000000000d1'
    where id = '00000000-0000-4000-8000-000000000501';
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'a completed transfer names the responsible lender by commit'
);

select lives_ok(
  $$
    select pg_temp.complete('00000000-0000-4000-8000-000000000501');
    select pg_temp.check_now();
  $$,
  'Dag accepts and is the responsible lender'
);

select throws_ok(
  $$ update app.loan_lender_transfers set resolved_at = now()
     where id = '00000000-0000-4000-8000-000000000501' $$,
  '23001',
  null,
  'a resolved transfer stays as it was'
);

select throws_ok(
  $$ delete from app.loan_lender_transfers
     where id = '00000000-0000-4000-8000-000000000501' $$,
  '23001',
  null,
  'a transfer is never deleted'
);

select throws_ok(
  $$ update app.loans set responsible_lender_id = '00000000-0000-4000-8000-0000000000a1'
     where id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'the role does not move back by itself'
);

-- Dag hands it on to Gro, who joined later.

select lives_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000502',
       '00000000-0000-4000-8000-000000000301', 'voluntary',
       '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a3',
       true) $$,
  'Dag offers Gro the role'
);

update app.loan_lender_transfers set recipient_accepted_at = now()
where id = '00000000-0000-4000-8000-000000000502';

select throws_ok(
  $$ select pg_temp.complete('00000000-0000-4000-8000-000000000502') $$,
  '23514',
  null,
  'a later co-owner gets the role only with the borrower''s consent'
);

select lives_ok(
  $$
    update app.loan_lender_transfers set borrower_consented_at = now()
    where id = '00000000-0000-4000-8000-000000000502';
    select pg_temp.complete('00000000-0000-4000-8000-000000000502');
    select pg_temp.check_now();
  $$,
  'Bo consents and Gro is the responsible lender'
);

-- Gro is established as unavailable; Dag, of the circle, takes over.

select lives_ok(
  $$
    insert into app.loan_lender_unavailability (loan_id, lender_user_id, established_at)
    values ('00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-0000000000a3', now());
    insert into app.loan_lender_transfers (
      id, loan_id, kind, from_user_id, to_user_id, borrower_consent_required,
      proposed_at, recipient_accepted_at, status, resolved_at, resolved_by_user_id
    ) values ('00000000-0000-4000-8000-000000000503',
      '00000000-0000-4000-8000-000000000301', 'takeover',
      '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000d1',
      false, now(), now(), 'completed', now(), '00000000-0000-4000-8000-0000000000d1');
    update app.loans set responsible_lender_id = '00000000-0000-4000-8000-0000000000d1'
    where id = '00000000-0000-4000-8000-000000000301';
    select pg_temp.check_now();
  $$,
  'a co-owner of the circle takes over from an unavailable lender at once'
);

select results_eq(
  $$
    select kind, from_user_id::text, to_user_id::text, status
    from app.loan_lender_transfers
    where loan_id = '00000000-0000-4000-8000-000000000301'
    order by position
  $$,
  $$ values
    ('voluntary', '00000000-0000-4000-8000-0000000000a1',
      '00000000-0000-4000-8000-0000000000d1', 'completed'),
    ('voluntary', '00000000-0000-4000-8000-0000000000d1',
      '00000000-0000-4000-8000-0000000000a3', 'completed'),
    ('takeover', '00000000-0000-4000-8000-0000000000a3',
      '00000000-0000-4000-8000-0000000000d1', 'completed') $$,
  'every change of the lender is kept, in order'
);

-- A co-owner's narrow receipt on Cia's loan (PS-LOAN-015).

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-0000000000d1', 'lender', 'received', 'co_owner') $$,
  '23001',
  null,
  'no co-owner receipt while the lender is available'
);

insert into app.loan_lender_unavailability (loan_id, lender_user_id, established_at)
values ('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-0000000000a1', now());

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-0000000000a3', 'lender', 'received', 'co_owner') $$,
  '23001',
  null,
  'only a co-owner of the circle confirms the receipt'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-0000000000d1', 'lender', 'not_received', 'co_owner') $$,
  '23514',
  null,
  'a co-owner confirms the receipt and nothing else'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-0000000000d1', 'lender', 'received', 'party') $$,
  '23001',
  null,
  'a co-owner does not speak as the lender'
);

select lives_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-0000000000c1', 'borrower', 'returned', 'party');
    select pg_temp.say('00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-0000000000d1', 'lender', 'received', 'co_owner');
    update app.loans set status = 'ended', status_changed_at = clock_timestamp(),
      end_reason = 'returned', ended_at = clock_timestamp(),
      ended_by_user_id = '00000000-0000-4000-8000-0000000000d1'
    where id = '00000000-0000-4000-8000-000000000302';
    delete from app.loan_reservations
    where loan_id = '00000000-0000-4000-8000-000000000302';
    select pg_temp.check_now();
  $$,
  'Dag''s receipt ends the loan, and Anna stays the responsible lender'
);

select is(
  (select responsible_lender_id::text from app.loans
   where id = '00000000-0000-4000-8000-000000000302'),
  '00000000-0000-4000-8000-0000000000a1',
  'the narrow receipt does not move the role'
);

select throws_ok(
  $$ select pg_temp.propose('00000000-0000-4000-8000-000000000504',
       '00000000-0000-4000-8000-000000000302', 'voluntary',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1',
       false) $$,
  '23001',
  null,
  'an ended loan gets no new lender'
);

select throws_ok(
  $$ insert into app.loan_lender_unavailability (loan_id, lender_user_id, established_at)
     values ('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-0000000000a1', now()) $$,
  '23001',
  null,
  'nothing is established about the lender of an ended loan'
);

select * from finish();
rollback;
