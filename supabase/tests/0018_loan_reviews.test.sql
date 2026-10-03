begin;

select plan(41);

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array[
    'app.review_dimensions', 'app.loan_review_periods', 'app.loan_reviews',
    'app.loan_review_scores', 'app.loan_review_responses'
  ]) as table_name;

-- Anna (a1) owns the trailer (f1), available from 1 November, and publishes
-- it in the environment (e1), where Bo (b1) and Cia (c1) are members. Anna
-- approves Bo's loan for 2–4 November and Cia's for 12–14 November.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now());

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
    app.loan_lender_transfers_consistent, app.loan_reviews_complete,
    app.loan_review_scores_complete
    immediate;
  set constraints app.loans_complete, app.loans_consistent,
    app.loan_agreements_consistent, app.loan_reservations_consistent,
    app.loan_amendments_consistent, app.loan_handover_reports_consistent,
    app.loan_return_reports_consistent, app.loan_return_confirmations_consistent,
    app.loan_lender_transfers_consistent, app.loan_reviews_complete,
    app.loan_review_scores_complete
    deferred;
end;
$$;

-- A review by `author` on `role`'s side of the loan, about `subject`.
create function pg_temp.review(
  id uuid, loan uuid, role text, author uuid, subject uuid, body text
)
returns void
language sql
as $$
  insert into app.loan_reviews (
    id, loan_id, author_role, author_user_id, subject_user_id, body,
    submitted_at, updated_at
  )
  select id, loan, role, author, subject, body, at, at
  from (select clock_timestamp() as at) as now;
$$;

create function pg_temp.score(review uuid, role text, dimension text, score smallint)
returns void
language sql
as $$
  insert into app.loan_review_scores (review_id, reviewer_role, dimension, score)
  values (review, role, dimension, score);
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

select pg_temp.approve('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
  '[2026-11-02,2026-11-05)');
select pg_temp.approve('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
  '[2026-11-12,2026-11-15)');
select pg_temp.check_now();

-- The window follows the loan's ending (PS-TRUST-001/003).

select throws_ok(
  $$ insert into app.loan_review_periods (
       loan_id, borrower_user_id, lender_user_id, basis, opened_at, due_at
     ) values ('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
       'cancelled', now(), now() + interval '14 days') $$,
  '23001',
  null,
  'a loan that has not ended has no review window'
);

select lives_ok(
  $$
    update app.loans set status = 'ended', status_changed_at = clock_timestamp(),
      end_reason = 'cancelled', ended_at = clock_timestamp(),
      ended_by_user_id = '00000000-0000-4000-8000-0000000000b1'
    where id = '00000000-0000-4000-8000-000000000301';
    delete from app.loan_reservations where loan_id = '00000000-0000-4000-8000-000000000301';
    select pg_temp.check_now();
  $$,
  'Bo cancels his loan'
);

select results_eq(
  $$ select status, basis, borrower_user_id, lender_user_id,
       due_at = opened_at + interval '14 days',
       opened_at = (select ended_at from app.loans
         where id = '00000000-0000-4000-8000-000000000301')
     from app.loan_review_periods
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  $$ values ('open', 'cancelled', '00000000-0000-4000-8000-0000000000b1'::uuid,
       '00000000-0000-4000-8000-0000000000a1'::uuid, true, true) $$,
  'the window opens for 14 days from the ending, between the loan''s parties'
);

select is(
  app.review_dimensions_for('cancelled', 'borrower'),
  array['communication'],
  'after a cancellation, only what was experienced can be reviewed'
);

select is(
  app.review_dimensions_for('not_completed', 'lender'),
  array['pickup_on_time', 'communication'],
  'a loan that was not completed is reviewed up to the handover appointment'
);

-- Who reviews whom, on what.

select throws_ok(
  $$ select pg_temp.review('00000000-0000-4000-8000-000000000401',
       '00000000-0000-4000-8000-000000000301', 'borrower',
       '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', null) $$,
  '23001',
  null,
  'someone who is not a party reviews nobody'
);

select throws_ok(
  $$ select pg_temp.review('00000000-0000-4000-8000-000000000401',
       '00000000-0000-4000-8000-000000000301', 'borrower',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', null) $$,
  '23001',
  null,
  'the lender does not review on the borrower''s side'
);

select throws_ok(
  $$
    select pg_temp.review('00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-000000000301', 'borrower',
      '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', null);
    select pg_temp.score('00000000-0000-4000-8000-000000000401', 'borrower',
      'available_for_return', 5::smallint);
  $$,
  '23001',
  null,
  'a dimension the ending does not allow is never scored'
);

select throws_ok(
  $$
    select pg_temp.review('00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-000000000301', 'borrower',
      '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', null);
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'a review scores every dimension of its side'
);

select throws_ok(
  $$
    select pg_temp.review('00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-000000000301', 'borrower',
      '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', null);
    select pg_temp.score('00000000-0000-4000-8000-000000000401', 'borrower',
      'communication', 2::smallint);
    select pg_temp.check_now();
  $$,
  '23001',
  null,
  'a score of 1 or 2 needs an explanation (PS-TRUST-002)'
);

select lives_ok(
  $$
    select pg_temp.review('00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-000000000301', 'borrower',
      '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', null);
    select pg_temp.score('00000000-0000-4000-8000-000000000401', 'borrower',
      'communication', 4::smallint);
    select pg_temp.check_now();
  $$,
  'Bo reviews Anna'
);

select throws_ok(
  $$ select pg_temp.review('00000000-0000-4000-8000-000000000402',
       '00000000-0000-4000-8000-000000000301', 'borrower',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', null) $$,
  '23505',
  null,
  'one review per side'
);

-- Publication (PS-TRUST-003–004).

select throws_ok(
  $$ update app.loan_reviews set status = 'published', published_at = now()
     where id = '00000000-0000-4000-8000-000000000401' $$,
  '23001',
  null,
  'a review is published only by its window closing'
);

select throws_ok(
  $$ update app.loan_review_periods
     set status = 'closed', closed_at = clock_timestamp(), closed_as = 'both_submitted'
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'the window does not close as reviewed by both before both have'
);

select lives_ok(
  $$
    select pg_temp.review('00000000-0000-4000-8000-000000000402',
      '00000000-0000-4000-8000-000000000301', 'lender',
      '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1',
      'Avlyste sent.');
    select pg_temp.score('00000000-0000-4000-8000-000000000402', 'lender',
      'communication', 2::smallint);
    update app.loan_review_periods
    set status = 'closed', closed_at = clock_timestamp(), closed_as = 'both_submitted'
    where loan_id = '00000000-0000-4000-8000-000000000301';
    select pg_temp.check_now();
  $$,
  'Anna reviews Bo, and the window closes'
);

select results_eq(
  $$ select count(*)::integer, count(distinct published_at)::integer
     from app.loan_reviews
     where loan_id = '00000000-0000-4000-8000-000000000301' and status = 'published' $$,
  $$ values (2, 1) $$,
  'both reviews are published at the same moment'
);

select throws_ok(
  $$ update app.loan_reviews set body = 'Omskrevet', version = 2, updated_at = clock_timestamp()
     where id = '00000000-0000-4000-8000-000000000402' $$,
  '23001',
  null,
  'a published review is locked'
);

select throws_ok(
  $$ delete from app.loan_review_scores
     where review_id = '00000000-0000-4000-8000-000000000402' $$,
  '23001',
  null,
  'so are its scores'
);

select throws_ok(
  $$ delete from app.loan_reviews where id = '00000000-0000-4000-8000-000000000402' $$,
  '23001',
  null,
  'a review is never deleted'
);

select throws_ok(
  $$ update app.loan_review_periods set status = 'open', closed_at = null, closed_as = null
     where loan_id = '00000000-0000-4000-8000-000000000301' $$,
  '23001',
  null,
  'a closed window stays closed'
);

-- The one response (PS-TRUST-005).

select throws_ok(
  $$ insert into app.loan_review_responses (review_id, author_user_id, body, responded_at)
     values ('00000000-0000-4000-8000-000000000402',
       '00000000-0000-4000-8000-0000000000a1', 'Jeg står ved det.', clock_timestamp()) $$,
  '23001',
  null,
  'the author does not answer their own review'
);

select lives_ok(
  $$ insert into app.loan_review_responses (review_id, author_user_id, body, responded_at)
     values ('00000000-0000-4000-8000-000000000402',
       '00000000-0000-4000-8000-0000000000b1', 'Jeg ble syk.', clock_timestamp()) $$,
  'Bo responds to Anna''s review'
);

select throws_ok(
  $$ insert into app.loan_review_responses (review_id, author_user_id, body, responded_at)
     values ('00000000-0000-4000-8000-000000000402',
       '00000000-0000-4000-8000-0000000000b1', 'En ting til.', clock_timestamp()) $$,
  '23505',
  null,
  'one response'
);

select throws_ok(
  $$ update app.loan_review_responses set body = 'Endret'
     where review_id = '00000000-0000-4000-8000-000000000402' $$,
  '23001',
  null,
  'a response never changes'
);

-- A loan that reopens (PS-TRUST-008). Cia's loan is handed over and
-- returned; she reviews Anna; then she says she still has it.

select lives_ok(
  $$
    insert into app.loan_handover_reports (
      loan_id, agreement_version, reported_by_user_id, reporter_role, outcome
    ) values ('00000000-0000-4000-8000-000000000302', 1,
      '00000000-0000-4000-8000-0000000000c1', 'borrower', 'handed_over');
    update app.loans set status = 'active', status_changed_at = clock_timestamp()
    where id = '00000000-0000-4000-8000-000000000302';
    select pg_temp.say('00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'received');
    update app.loans set status = 'ended', status_changed_at = clock_timestamp(),
      end_reason = 'returned', ended_at = clock_timestamp(),
      ended_by_user_id = '00000000-0000-4000-8000-0000000000a1'
    where id = '00000000-0000-4000-8000-000000000302';
    delete from app.loan_reservations where loan_id = '00000000-0000-4000-8000-000000000302';
    select pg_temp.review('00000000-0000-4000-8000-000000000403',
      '00000000-0000-4000-8000-000000000302', 'borrower',
      '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', null);
    select pg_temp.score('00000000-0000-4000-8000-000000000403', 'borrower', code, 5::smallint)
    from unnest(app.review_dimensions_for('returned', 'borrower')) as code;
    select pg_temp.check_now();
  $$,
  'Cia''s loan is returned and she reviews Anna'
);

select lives_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-0000000000c1', 'borrower', 'still_has');
    update app.loans set status = 'return_disputed', status_changed_at = clock_timestamp(),
      end_reason = null, ended_at = null, ended_by_user_id = null
    where id = '00000000-0000-4000-8000-000000000302';
    select pg_temp.check_now();
  $$,
  'Cia says she still has it: the loan reopens'
);

select results_eq(
  $$ select status, due_at from app.loan_review_periods
     where loan_id = '00000000-0000-4000-8000-000000000302' $$,
  $$ values ('paused', null::timestamptz) $$,
  'the window pauses before publication'
);

select throws_ok(
  $$ select pg_temp.review('00000000-0000-4000-8000-000000000404',
       '00000000-0000-4000-8000-000000000302', 'lender',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', null) $$,
  '23001',
  null,
  'nobody reviews while the loan is reopened'
);

select throws_ok(
  $$ update app.loan_reviews set body = 'Ny tekst', version = 2, updated_at = clock_timestamp()
     where id = '00000000-0000-4000-8000-000000000403' $$,
  '23001',
  null,
  'nor revises a hidden review'
);

select lives_ok(
  $$
    select pg_temp.say('00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 'received');
    update app.loans set status = 'ended', status_changed_at = clock_timestamp(),
      end_reason = 'returned', ended_at = clock_timestamp(),
      ended_by_user_id = '00000000-0000-4000-8000-0000000000a1'
    where id = '00000000-0000-4000-8000-000000000302';
    select pg_temp.check_now();
  $$,
  'Anna confirms the receipt again'
);

select results_eq(
  $$ select period.status, period.opened_at = loan.ended_at, review.status
     from app.loan_review_periods as period
     join app.loans as loan on loan.id = period.loan_id
     join app.loan_reviews as review on review.loan_id = period.loan_id
     where period.loan_id = '00000000-0000-4000-8000-000000000302' $$,
  $$ values ('open', true, 'hidden') $$,
  'a new window opens at the new ending, and the hidden review stands'
);

select * from finish();
rollback;
