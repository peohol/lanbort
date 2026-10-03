begin;

select plan(24);

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array['app.loans', 'app.loan_agreements', 'app.loan_reservations'])
    as table_name;

-- Anna (a1) owns the trailer (f1), available from 1 November, and publishes
-- it in the environment (e1). Bo (b1) and Cia (c1) are members there and ask
-- for it. Dag (d1) co-owns it without being a member.
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
    '2026-11-03', '2026-11-05', 'Kan jeg låne den?', 1);

-- Approving Bo's request: the loan, its agreement, the reservation and the
-- approved request, as the domain writes them.
create function pg_temp.approve(
  loan uuid, request uuid, borrower uuid, lender uuid, period daterange
)
returns void
language plpgsql
as $$
begin
  set constraints app.loans_complete deferred;
  insert into app.loans (id, request_id, object_id, borrower_user_id, responsible_lender_id,
    owner_ids_at_approval)
  values (loan, request, '00000000-0000-4000-8000-0000000000f1', borrower, lender,
    array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1']::uuid[]);
  insert into app.loan_agreements (
    loan_id, version, object_version, terms_version, title, category_id,
    description, loan_terms, period, lender_user_id
  )
  values (loan, 1, 1, 1, 'Tilhenger', 'annet', 'Liten tilhenger',
    'Vaskes etter bruk', period, lender);
  insert into app.loan_reservations (loan_id, object_id, period)
  values (loan, '00000000-0000-4000-8000-0000000000f1', period);
  update app.loan_requests set status = 'approved', status_changed_at = now()
  where id = request;
  set constraints app.loans_complete immediate;
end;
$$;

select throws_ok(
  $$ select pg_temp.approve('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
       '00000000-0000-4000-8000-0000000000d1', '[2026-11-02,2026-11-05)') $$,
  '23001',
  null,
  'a co-owner without the borrower''s relation to the origin cannot approve'
);

select throws_ok(
  $$ select pg_temp.approve('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
       '00000000-0000-4000-8000-0000000000c1', '[2026-11-02,2026-11-05)') $$,
  '23001',
  null,
  'only an owner approves (PS-LOAN-008)'
);

select throws_ok(
  $$ select pg_temp.approve('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
       '00000000-0000-4000-8000-0000000000a1', '[2026-10-30,2026-11-02)') $$,
  '23001',
  null,
  'a reservation lies within the general availability'
);

select throws_ok(
  $$
    set constraints app.loans_complete deferred;
    insert into app.loans (id, request_id, object_id, borrower_user_id, responsible_lender_id,
    owner_ids_at_approval)
    values ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1',
      '00000000-0000-4000-8000-0000000000a1', array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1']::uuid[]);
    set constraints app.loans_complete immediate
  $$,
  '23001',
  null,
  'a loan is never without its agreement and reservation (PS-LOAN-006)'
);

select throws_ok(
  $$
    insert into app.loans (request_id, object_id, borrower_user_id, responsible_lender_id,
      owner_ids_at_approval)
    values ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000f1',
      '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
      array['00000000-0000-4000-8000-0000000000a1']::uuid[])
  $$,
  '23001',
  null,
  'a loan records exactly the owners of the moment it was approved'
);

select throws_ok(
  $$
    update app.loan_requests set status = 'approved'
    where id = '00000000-0000-4000-8000-000000000201'
  $$,
  '23001',
  null,
  'a request is approved only with its loan'
);

select lives_ok(
  $$ select pg_temp.approve('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
       '00000000-0000-4000-8000-0000000000a1', '[2026-11-02,2026-11-05)') $$,
  'an owner approves: loan, agreement, reservation and approved request'
);

select throws_ok(
  $$ select pg_temp.approve('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
       '00000000-0000-4000-8000-0000000000a1', '[2026-11-03,2026-11-06)') $$,
  '23P01',
  null,
  'two reservations of one object never overlap (PS-NFR-004)'
);

select lives_ok(
  $$ select pg_temp.approve('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
       '00000000-0000-4000-8000-0000000000a1', '[2026-11-05,2026-11-08)') $$,
  'a reservation that only touches another one is fine'
);

select throws_ok(
  $$
    insert into app.loans (request_id, object_id, borrower_user_id, responsible_lender_id,
    owner_ids_at_approval)
    values ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000f1',
      '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
      array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1']::uuid[])
  $$,
  '23001',
  null,
  'an approved request is not approved again'
);

select throws_ok(
  $$
    update app.loan_requests set status = 'ended', ended_at = now(),
      end_reason = 'withdrawn', ended_by_user_id = borrower_user_id
    where id = '00000000-0000-4000-8000-000000000201'
  $$,
  '23001',
  null,
  'an approved request never changes again'
);

select throws_ok(
  $$ update app.loan_agreements set loan_terms = 'Endret' $$,
  '23001',
  null,
  'the agreement snapshot is never rewritten'
);

select throws_ok(
  $$ delete from app.loan_reservations $$,
  '23001',
  null,
  'a reservation is not released before cancellation and return exist'
);

select throws_ok(
  $$ update app.loans set responsible_lender_id = '00000000-0000-4000-8000-0000000000d1' $$,
  '23001',
  null,
  'the responsible lender changes only through a transfer (WP-35)'
);

-- Bo leaves the environment after approval: his loan stays.
update app.environment_memberships
set state = 'ended', end_reason = 'left', ended_at = now(), transition_deadline = null
where id = '00000000-0000-4000-8000-0000000000d2';

select is(
  (select status from app.loan_requests where id = '00000000-0000-4000-8000-000000000201'),
  'approved',
  'access lost after approval does not end the loan (PS-LOAN-002)'
);

-- A third request, from Dag's friend Eva (e5), waits for new terms.
insert into app.users (id, status, adult_confirmed_at)
values ('00000000-0000-4000-8000-0000000000e5', 'active', now());
insert into app.friendships (requester_id, addressee_id, status, accepted_at)
values ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000d1',
  'active', now());
insert into app.loan_requests (
  id, object_id, borrower_user_id, origin, desired_start, desired_end, message,
  terms_version
)
values ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000e5', 'direct', '2026-12-01', '2026-12-02',
  'Kan jeg låne den?', 1);

select throws_ok(
  $$
    insert into app.loans (id, request_id, object_id, borrower_user_id, responsible_lender_id,
    owner_ids_at_approval)
    values ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000203',
      '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e5',
      '00000000-0000-4000-8000-0000000000d1', array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1']::uuid[]);
    insert into app.loan_agreements (
      loan_id, version, object_version, terms_version, title, category_id,
      description, loan_terms, period, lender_user_id, responsibility_declaration_version
    )
    values ('00000000-0000-4000-8000-000000000303', 1, 1, 1, 'Tilhenger', 'annet',
      'Liten tilhenger', 'Vaskes etter bruk', '[2026-12-01,2026-12-03)',
      '00000000-0000-4000-8000-0000000000d1', 1)
  $$,
  '23001',
  null,
  'a direct loan needs both parties'' acceptance of the declaration (PS-LOAN-003)'
);

insert into app.object_revisions (
  object_id, version, change, actor_user_id, title, category_id, description,
  loan_terms, status, availability, image_ids
)
values ('00000000-0000-4000-8000-0000000000f1', 2, 'updated',
  '00000000-0000-4000-8000-0000000000a1', 'Tilhenger', 'annet', 'Liten tilhenger',
  'Vaskes og tørkes', 'active', '[]', '{}');
update app.objects set version = 2, loan_terms = 'Vaskes og tørkes'
where id = '00000000-0000-4000-8000-0000000000f1';

select throws_ok(
  $$
    insert into app.loans (request_id, object_id, borrower_user_id, responsible_lender_id,
    owner_ids_at_approval)
    values ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000f1',
      '00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000d1',
      array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1']::uuid[])
  $$,
  '23001',
  null,
  'no loan while new terms wait for the borrower (PS-LOAN-005)'
);

select results_eq(
  $$ select loan_terms from app.loan_agreements order by loan_id $$,
  $$ values ('Vaskes etter bruk'::text), ('Vaskes etter bruk'::text) $$,
  'agreements keep the terms that were approved'
);

select * from finish();
rollback;
