begin;

select plan(17);

select ok(
  not has_table_privilege(role_name, 'app.loan_logistics_channels', 'SELECT'),
  format('%s cannot read app.loan_logistics_channels', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

-- Anna (a1) owns the trailer (f1) and approves Bo's (b1) loan (301) and
-- Cia's (c1) loan (302). Dag (d1) is someone else.
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
insert into app.object_owners (object_id, user_id)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1');
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

select pg_temp.approve('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
  daterange('2026-11-02', '2026-11-04', '[]'));
select pg_temp.approve('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
  daterange('2026-11-12', '2026-11-14', '[]'));

create function pg_temp.channels(loan uuid)
returns table (borrower uuid, lender uuid, open boolean, reason text)
language sql
as $$
  select borrower_user_id, lender_user_id, closed_at is null, close_reason
  from app.loan_logistics_channels
  where loan_id = loan
  order by opened_at, id;
$$;

-- PS-COM-007: the server opens the channel; nobody adds one by hand.
select throws_ok(
  $$ insert into app.loan_logistics_channels (loan_id, borrower_user_id, lender_user_id)
     values ('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1') $$,
  '23001',
  null,
  'parties who are not blocked get no channel'
);

-- A block with someone who is not a party opens nothing; one between the
-- parties opens one channel, whoever blocked whom.
insert into app.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000d1');

select is_empty(
  $$ select * from pg_temp.channels('00000000-0000-4000-8000-000000000301') $$,
  'a block with someone who is not a party opens no channel'
);

insert into app.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1');

select results_eq(
  $$ select * from pg_temp.channels('00000000-0000-4000-8000-000000000301') $$,
  $$ values ('00000000-0000-4000-8000-0000000000b1'::uuid,
       '00000000-0000-4000-8000-0000000000a1'::uuid, true, null::text) $$,
  'a block between the parties opens one channel between them'
);

select throws_ok(
  $$ insert into app.loan_logistics_channels (loan_id, borrower_user_id, lender_user_id)
     values ('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1') $$,
  null,
  null,
  'a loan has at most one open channel'
);

select throws_ok(
  $$ update app.loan_logistics_channels
     set lender_user_id = '00000000-0000-4000-8000-0000000000d1'
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'a channel never changes whom it joins'
);

select throws_ok(
  $$ update app.loan_logistics_channels
     set closed_at = now(), close_reason = 'loan_ended'
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'a channel does not close as ended while its loan goes on'
);

select throws_ok(
  $$ update app.loan_logistics_channels
     set closed_at = now(), close_reason = 'parties_changed'
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'a channel does not close as changed while its parties are the same'
);

select throws_ok(
  $$ delete from app.loan_logistics_channels
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  null,
  null,
  'a channel is never deleted'
);

-- OD-0020: nobody closes the channel while the loan is in progress; only
-- the loan's end and a change of its parties do.
select throws_ok(
  $$ update app.loan_logistics_channels set closed_at = now(), close_reason = 'safety'
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23514',
  null,
  'there is no early closing as a safety measure'
);

select throws_ok(
  $$ update app.loan_logistics_channels set closed_at = now(), close_reason = 'loan_ended'
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'a channel does not close as ended while the loan is in progress'
);

-- Lifting the block and placing it again keeps the one open channel.
update app.user_blocks set lifted_at = now()
where blocked_id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1');
insert into app.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1');

select results_eq(
  $$ select * from pg_temp.channels('00000000-0000-4000-8000-000000000301') $$,
  $$ values ('00000000-0000-4000-8000-0000000000b1'::uuid,
       '00000000-0000-4000-8000-0000000000a1'::uuid, true, null::text) $$,
  'the channel stays open through a new block'
);

select throws_ok(
  $$ insert into app.loan_logistics_channels (loan_id, borrower_user_id, lender_user_id)
     values ('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1') $$,
  '23505',
  null,
  'nor can another be added by hand'
);

select throws_ok(
  $$ insert into app.loan_logistics_channels (loan_id, borrower_user_id, lender_user_id,
       closed_at, close_reason)
     values ('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1',
       now(), 'loan_ended') $$,
  '23001',
  null,
  'no channel is added closed'
);

-- Cia's loan: the block opens a channel, and cancelling the loan closes it
-- in the same transaction.
insert into app.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1');

update app.loans set status = 'ended', status_changed_at = now(),
  end_reason = 'cancelled', ended_at = now(),
  ended_by_user_id = '00000000-0000-4000-8000-0000000000c1'
where id = '00000000-0000-4000-8000-000000000302';
delete from app.loan_reservations where loan_id = '00000000-0000-4000-8000-000000000302';

select results_eq(
  $$ select * from pg_temp.channels('00000000-0000-4000-8000-000000000302') $$,
  $$ values ('00000000-0000-4000-8000-0000000000c1'::uuid,
       '00000000-0000-4000-8000-0000000000a1'::uuid, false, 'loan_ended'::text) $$,
  'the channel closes when the loan ends'
);

-- A block between parties of a loan that has ended opens nothing.
update app.user_blocks set lifted_at = now()
where blocker_id = '00000000-0000-4000-8000-0000000000c1';
insert into app.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1');

select is(
  (select count(*) from app.loan_logistics_channels
   where loan_id = '00000000-0000-4000-8000-000000000302'),
  1::bigint,
  'a block on an ended loan opens no channel'
);

select * from finish();
rollback;
